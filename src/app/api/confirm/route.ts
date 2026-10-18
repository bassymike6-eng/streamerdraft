// src/app/api/confirm/route.ts
//
// WHAT THIS IS
// The confirm page (src/app/confirm) talks to this, in two steps:
//
//   GET  /api/confirm?token=...        "is this link OK, and whose is it?"
//        (the page asks as it opens, so it can greet them by name, or tell
//         them straight away that the link's expired, before they read the rules)
//
//   POST /api/confirm                  "confirm me"
//        body: { "token": "...", "rulesAccepted": true }
//        (the button on the page, once they've read the rules and ticked)
//
// WHY A BUTTON (POST) AND NOT JUST CLICKING THE EMAIL LINK?
// Some email apps (like Outlook) automatically "click" every link in an
// email to scan it for viruses. If the link itself confirmed people,
// robots would be entering the comp. A button a human presses can't be
// pressed by a scanner. (The GET only LOOKS, it never changes anything,
// so a scanner opening the page does no harm.)
//
// THE UK CHECK HAPPENS HERE TOO (migration 007)
// We note which country they confirmed from (Cloudflare's CF-IPCountry), as
// confirm_ip_country. The database then works out uk_eligible by itself: they
// ticked "based in the UK" AND they signed up OR confirmed from a UK IP.
// (So someone who signed up on holiday but confirms at home still counts.)
// The reply says ukEligible, so the page can tell them if they can't win.
//
// WHAT IT DOES (POST), IN ORDER
// 1. Checks the request has a token (and the rules tick)
// 2. Finds the sign-up whose scrambled token matches
// 3. Handles: not found / already confirmed / expired / rules not ticked
// 4. Confirms them: saves the time, the rules tick, the country and their #number

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashToken } from "@/lib/tokens";
import { limitByIp } from "@/lib/rate-limit";
import { getIpCountry } from "@/lib/country";

// The shape we expect the button to send
const confirmSchema = z.object({
  token: z.string().min(20).max(100),
  rulesAccepted: z.boolean().default(false),
});

// What the page needs to show once they're in (both "confirmed" and "already_confirmed")
type ConfirmedRow = {
  role: "prospect" | "scout";
  number: number;
  display_name: string;
  email: string;
  referral_code: string;
  uk_eligible: boolean;
};
const confirmedReply = (status: "confirmed" | "already_confirmed", row: ConfirmedRow) =>
  NextResponse.json(
    {
      ok: true,
      status,
      role: row.role,
      number: row.number, // their #number
      displayName: row.display_name,
      email: row.email, // so the page can match it to an entry saved in this browser
      referralCode: row.referral_code, // their link: /r/<code>
      ukEligible: row.uk_eligible, // false: they can't win, and their referrals don't count
    },
    { headers: { "Cache-Control": "no-store" } }
  );

const INVALID = "This link isn't valid. If you asked for a new one, use the newest email.";
const EXPIRED = "This link has expired. Join again with the same email and we'll send you a fresh one.";

// ── GET: look before you confirm ───────────────────────────────────
export async function GET(request: Request) {
  const limited = limitByIp(request, "confirm-look", 60, 10 * 60);
  if (limited) return limited;

  try {
    const token = new URL(request.url).searchParams.get("token") ?? "";
    if (token.length < 20 || token.length > 100) {
      return NextResponse.json({ ok: false, status: "invalid", error: INVALID }, { status: 400 });
    }

    const found = await db.query(
      `SELECT role, display_name, email, referral_code, number, uk_eligible,
              confirmed_at IS NOT NULL AS confirmed, confirm_expires_at < NOW() AS expired
       FROM signups
       WHERE confirm_token_hash = $1`,
      [hashToken(token)]
    );
    if (found.rows.length === 0) {
      return NextResponse.json({ ok: false, status: "invalid", error: INVALID }, { status: 400 });
    }
    const person = found.rows[0];

    if (person.confirmed) return confirmedReply("already_confirmed", person);
    if (person.expired) {
      return NextResponse.json({ ok: false, status: "expired", error: EXPIRED }, { status: 410 });
    }

    // Ready to confirm: just enough to greet them (nothing they haven't typed themselves)
    return NextResponse.json(
      { ok: true, status: "ready", role: person.role, displayName: person.display_name },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("[confirm] unexpected error (look):", error);
    return NextResponse.json({ ok: false, status: "error", error: "Something went wrong. Please try again." }, { status: 500 });
  }
}

// ── POST: confirm ──────────────────────────────────────────────────
export async function POST(request: Request) {
  // ── 0. Speed limit: 20 confirm attempts per 10 minutes per IP ──
  const limited = limitByIp(request, "confirm", 20, 10 * 60);
  if (limited) return limited;

  try {
    // ── 1. Read + check the request ─────────────────────────────
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ ok: false, status: "invalid", error: "Invalid request." }, { status: 400 });
    }
    const result = confirmSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { ok: false, status: "invalid", error: "This link isn't complete. Copy the whole link from the email." },
        { status: 400 }
      );
    }
    const { token, rulesAccepted } = result.data; // "destructuring": pulls both values out at once

    // ── 2. Find the sign-up with this token ─────────────────────
    // We hash the token from the link and look for the same hash.
    const found = await db.query(
      `SELECT id, role, display_name, email, referral_code, number, uk_eligible,
              confirmed_at, confirm_expires_at < NOW() AS expired
       FROM signups
       WHERE confirm_token_hash = $1`,
      [hashToken(token)]
    );

    // ── 3a. Nobody has this token ───────────────────────────────
    // A typo, or an older link that was replaced by a newer email.
    if (found.rows.length === 0) {
      return NextResponse.json({ ok: false, status: "invalid", error: INVALID }, { status: 400 });
    }
    const person = found.rows[0];

    // ── 3b. Already confirmed (e.g. they pressed it twice) ──────
    // Not an error: just show them their details again.
    if (person.confirmed_at) return confirmedReply("already_confirmed", person);

    // ── 3c. Link expired ────────────────────────────────────────
    if (person.expired) {
      return NextResponse.json({ ok: false, status: "expired", error: EXPIRED }, { status: 410 }); // 410 = "gone"
    }

    // ── 3d. Everyone ticks the rules: it's how they enter ───────
    // (Streamers and scouts can both win, since F5.)
    if (!rulesAccepted) {
      return NextResponse.json(
        { ok: false, status: "rules_required", error: "Read the competition rules and tick the box to confirm." },
        { status: 400 }
      );
    }

    // ── 4. Confirm them ─────────────────────────────────────────
    // nextval() takes the next number from the right counter.
    // "AND confirmed_at IS NULL" makes sure a double-press can never
    // hand out two numbers to the same person.
    // RETURNING runs after the update, so uk_eligible already takes the
    // country they confirmed from into account.
    const confirmed = await db.query(
      `UPDATE signups
       SET confirmed_at = NOW(),
           rules_accepted_at = CASE WHEN $2 THEN NOW() ELSE NULL END,
           confirm_ip_country = $3,
           number = CASE role
                      WHEN 'prospect' THEN nextval('prospect_number_seq')
                      ELSE nextval('scout_number_seq')
                    END
       WHERE id = $1 AND confirmed_at IS NULL
       RETURNING role, number, display_name, email, referral_code, uk_eligible`,
      [person.id, rulesAccepted, getIpCountry(request)]
    );

    // If a double-press got there first, nothing was updated: that's fine,
    // they're confirmed either way, so show their details.
    const row = confirmed.rows[0] ?? (await db.query(
      "SELECT role, number, display_name, email, referral_code, uk_eligible FROM signups WHERE id = $1",
      [person.id]
    )).rows[0];

    return confirmedReply("confirmed", row);
  } catch (error) {
    console.error("[confirm] unexpected error:", error);
    return NextResponse.json(
      { ok: false, status: "error", error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
