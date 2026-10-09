// src/app/api/signup/route.ts
//
// WHAT THIS IS
// The endpoint the sign-up form sends people's details to:
//   POST http://localhost:3000/api/signup
//
// WHAT IT DOES, IN ORDER
// 1. Reads the data sent to it (JSON)
// 2. Checks every field with our Zod rules (src/lib/validation.ts)
// 3. Finds who recruited them, if they came through a recruit link
// 4. Saves them in the database with a fresh random recruit code
// 5. Emails them their confirm link (src/lib/confirmation.ts)
// 6. Replies with a clear success or error message
//
// If the email is already on the list:
// - confirmed → "This email is already on the list."
// - not confirmed yet → we send them a fresh confirm link

import { NextResponse } from "next/server";
import { z } from "zod";
import { db, isUniqueViolation } from "@/lib/db";
import { signupSchema } from "@/lib/validation";
import { makeReferralCode } from "@/lib/referral";
import { issueConfirmation } from "@/lib/confirmation";
import { getIpCountry } from "@/lib/country";
import { isThrowawayEmail } from "@/lib/throwaway";
import { getClientIp, hashIp } from "@/lib/ip";
import { limitByIp } from "@/lib/rate-limit";
import { isHuman } from "@/lib/turnstile";

// POST = "here is some data for you" (GET was "give me something")
export async function POST(request: Request) {
  // ── 0. Speed limit: 20 sign-up attempts per 10 minutes per IP ──
  // Checked before anything else, so even junk requests count.
  const limited = limitByIp(request, "signup", 20, 10 * 60);
  if (limited) return limited;

  try {    // ── 1. Read the JSON body ───────────────────────────────────
    let body: unknown; // "unknown" = we have no idea what's in it yet
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
    }

    // ── 2. Check every field ────────────────────────────────────
    // safeParse never crashes: it returns success true/false.
    const result = signupSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "Check the highlighted fields.",
          // e.g. { email: ["Enter a valid email address."] }
          // The front end uses this to show a message under each field.
          fields: z.flattenError(result.error).fieldErrors,
        },
        { status: 400 } // 400 = "your data has a problem"
      );
    }
    const data = result.data; // from here on, the data is clean and checked

    
    // ── 2b. Block throwaway inboxes ─────────────────────────────
    // Same reply shape as a validation error, so the form shows it
    // under the email field like any other mistake.
    if (isThrowawayEmail(data.email)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Check the highlighted fields.",
          fields: {
            email: ["Temporary email addresses can't be used. Use one you'll keep, so we can reach you if you win."],
          },
        },
        { status: 400 }
      );
    }


        // ── 2c. Are they human? (Cloudflare Turnstile) ────────────────
    // After the quick checks above (so a typo doesn't waste their
    // one-time token), but before we touch the database.
    if (!(await isHuman(data.turnstileToken, getClientIp(request)))) {
      return NextResponse.json(
        {
          ok: false,
          status: "human_check_failed",
          error: "We couldn't complete the human check. Refresh the page and try again.",
        },
        { status: 400 }
      );
    }

    // ── 3. Who recruited them? ──────────────────────────────────
    let referredById: string | null = null;
    if (data.ref) {
      const recruiter = await db.query(
        "SELECT id FROM signups WHERE referral_code = $1",
        [data.ref.toLowerCase()]
      );
      // Unknown code? Just ignore it, never block a sign-up over it.
      if (recruiter.rows.length > 0) {
        referredById = recruiter.rows[0].id;
      }
    }

    // Prospect and scout answers go in different columns.
    // Anything that doesn't apply to this role is saved as null (empty).
    const isProspect = data.role === "prospect";
    
    // Country from Cloudflare (e.g. "GB"), or null if unknown.
    // Saved as evidence for the admin dashboard; the UK tick decides eligibility.
    const ipCountry = getIpCountry(request);
    
    // Scrambled fingerprint of their IP (never the IP itself), so the
    // admin dashboard can spot lots of sign-ups from the same place.
    const ipHash = hashIp(getClientIp(request));

    // ── 4. Save them ────────────────────────────────────────────
    // Recruit codes are random, so two people COULD get the same one
    // (very unlikely). If that happens, the database rejects it and we
    // simply try again with a new code, up to 5 times.
    for (let attempt = 1; attempt <= 5; attempt++) {
      const referralCode = makeReferralCode();

      try {
        // $1, $2, $3... are placeholders. The values array below fills
        // them in order. This keeps us safe from SQL injection.
               const inserted = await db.query(
          `INSERT INTO signups (
             role, email, display_name,
             platform, channel_url, stream_category,
             platform_urls, audience_size, content_types,
             age_confirmed, marketing_opt_in,
             referral_code, referred_by_id,
             based_in_uk, ip_country, ip_hash
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
           RETURNING id, role, email, display_name, referral_code`,
          [
            data.role, //                                         $1
            data.email, //                                        $2
            data.displayName, //                                  $3
            isProspect ? data.platform : null, //                 $4
            isProspect ? data.channelUrl : null, //               $5
            isProspect ? data.streamCategory || null : null, //   $6
            isProspect ? null : data.platformUrls, //             $7
            isProspect ? null : data.audienceSize, //             $8
            isProspect ? null : data.contentTypes, //             $9
            data.ageConfirmed, //                                 $10
            data.marketingOptIn, //                               $11
            referralCode, //                                      $12
            referredById, //                                      $13
            data.basedInUk, //                                    $14
            ipCountry, //                                         $15
            ipHash, //                                            $16
          ]
        );

        const saved = inserted.rows[0];

        // ── 5. Send the confirmation email ──────────────────────
        await issueConfirmation({
          id: saved.id,
          email: saved.email,
          displayName: saved.display_name,
          role: saved.role,
          referralCode: saved.referral_code,
        });

        // ── 6. Success ──────────────────────────────────────────
        return NextResponse.json(
          { ok: true, status: "created", role: saved.role, referralCode: saved.referral_code },
          { status: 201 } // 201 = "created"
        );
      } catch (error) {
        // Same inbox already signed up (capitals, dots or +tags): friendly message.
        if (isUniqueViolation(error, "signups_email_unique")) {
          return handleExistingEmail(data.email);
        }
        // Recruit code clash: loop round and try a new code.
        if (isUniqueViolation(error, "signups_referral_code_unique")) {
          continue;
        }
        // Anything else is unexpected: hand it to the outer catch below.
        throw error;
      }
    }

    // We only get here if 5 codes in a row clashed (practically impossible).
    throw new Error("Could not create a unique referral code after 5 attempts.");
  } catch (error) {
    // Something unexpected broke. Full details go to the terminal for us;
    // the visitor just gets a short message.
    console.error("[signup] unexpected error:", error);
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 } // 500 = "our fault, not yours"
    );
  }
}

// ── Someone signed up with an email that's already on the list ─────
// - Already confirmed → tell them they're already in.
// - Not confirmed yet → their first email probably got lost, so send a
//   fresh link (this also replaces the old link).
async function handleExistingEmail(email: string) {
   // normalize_email() is the database function from migration 004. Comparing
  // the normalised versions finds the original sign-up even when this attempt
  // used dots or a +tag (bassy.mike+2@gmail.com finds bassymike@gmail.com).
  const existing = await db.query(
    `SELECT id, email, display_name, role, referral_code, confirmed_at
     FROM signups
     WHERE normalize_email(email) = normalize_email($1)`,
    [email]
  );
  const person = existing.rows[0];

  if (person.confirmed_at) {
    return NextResponse.json(
      { ok: false, status: "already_confirmed", error: "This email is already on the list." },
      { status: 409 } // 409 = "conflict"
    );
  }

  await issueConfirmation({
    id: person.id,
    email: person.email,
    displayName: person.display_name,
    role: person.role,
    referralCode: person.referral_code,
  });

  return NextResponse.json(
    { ok: true, status: "resent", message: "You're already signed up. We've sent you a fresh confirmation link." },
    { status: 200 } // 200 = "OK"
  );
}