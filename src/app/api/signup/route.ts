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
// 5. Replies with a clear success or error message

import { NextResponse } from "next/server";
import { z } from "zod";
import { db, isUniqueViolation } from "@/lib/db";
import { signupSchema } from "@/lib/validation";
import { makeReferralCode } from "@/lib/referral";

// POST = "here is some data for you" (GET was "give me something")
export async function POST(request: Request) {
  try {
    // ── 1. Read the JSON body ───────────────────────────────────
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
             referral_code, referred_by_id
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
           RETURNING id, role, referral_code`,
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
          ]
        );

        const saved = inserted.rows[0];

        // ── 5. Success ──────────────────────────────────────────
        return NextResponse.json(
          { ok: true, role: saved.role, referralCode: saved.referral_code },
          { status: 201 } // 201 = "created"
        );
      } catch (error) {
        // Same email already signed up (any capitals): friendly message.
        if (isUniqueViolation(error, "signups_email_unique")) {
          return NextResponse.json(
            { ok: false, error: "This email is already on the list." },
            { status: 409 } // 409 = "conflict"
          );
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