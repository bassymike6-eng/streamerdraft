// src/app/api/confirm/route.ts
//
// WHAT THIS IS
// "Enter the comp" / "Confirm" button on the confirm page sends here:
//   POST http://localhost:3000/api/confirm
//   body: { "token": "...", "rulesAccepted": true }
//
// WHY A BUTTON (POST) AND NOT JUST CLICKING THE EMAIL LINK?
// Some email apps (like Outlook) automatically "click" every link in an
// email to scan it for viruses. If the link itself confirmed people,
// robots would be entering the comp. A button a human presses can't be
// pressed by a scanner.
//
// WHAT IT DOES, IN ORDER
// 1. Checks the request has a token (and the rules tick)
// 2. Finds the sign-up whose scrambled token matches
// 3. Handles: not found / already confirmed / expired / rules not ticked
// 4. Confirms them: saves the time, the rules tick, and their #number

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashToken } from "@/lib/tokens";
import { limitByIp } from "@/lib/rate-limit";
// The shape we expect the button to send
const confirmSchema = z.object({
  token: z.string().min(20).max(100),
  rulesAccepted: z.boolean().default(false),
});

export async function POST(request: Request) {
  // ── 0. Speed limit: 20 confirm attempts per 10 minutes per IP ──
  const limited = limitByIp(request, "confirm", 20, 10 * 60);
  if (limited) return limited;

  try {    // ── 1. Read + check the request ─────────────────────────────
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
      `SELECT id, role, display_name, referral_code, number,
              confirmed_at, confirm_expires_at < NOW() AS expired
       FROM signups
       WHERE confirm_token_hash = $1`,
      [hashToken(token)]
    );

    // ── 3a. Nobody has this token ───────────────────────────────
    // A typo, or an older link that was replaced by a newer email.
    if (found.rows.length === 0) {
      return NextResponse.json(
        { ok: false, status: "invalid", error: "This link isn't valid. If you asked for a new one, use the newest email." },
        { status: 400 }
      );
    }
    const person = found.rows[0];

    // ── 3b. Already confirmed (e.g. they pressed it twice) ──────
    // Not an error: just show them their details again.
    if (person.confirmed_at) {
      return NextResponse.json({
        ok: true,
        status: "already_confirmed",
        role: person.role,
        number: person.number,
        displayName: person.display_name,
        referralCode: person.referral_code,
      });
    }

    // ── 3c. Link expired ────────────────────────────────────────
    if (person.expired) {
      return NextResponse.json(
        { ok: false, status: "expired", error: "This link has expired. Sign up again with the same email and we'll send a fresh one." },
        { status: 410 } // 410 = "gone"
      );
    }

    // ── 3d. Prospects must tick the rules (it's how they enter) ──
    if (person.role === "prospect" && !rulesAccepted) {
      return NextResponse.json(
        { ok: false, status: "rules_required", error: "Tick the box to confirm you've read the competition rules." },
        { status: 400 }
      );
    }

    // ── 4. Confirm them ─────────────────────────────────────────
    // nextval() takes the next number from the right counter.
    // "AND confirmed_at IS NULL" makes sure a double-press can never
    // hand out two numbers to the same person.
    const confirmed = await db.query(
      `UPDATE signups
       SET confirmed_at = NOW(),
           rules_accepted_at = CASE WHEN $2 THEN NOW() ELSE NULL END,
           number = CASE role
                      WHEN 'prospect' THEN nextval('prospect_number_seq')
                      ELSE nextval('scout_number_seq')
                    END
       WHERE id = $1 AND confirmed_at IS NULL
       RETURNING role, number, display_name, referral_code`,
      [person.id, rulesAccepted]
    );

    // If a double-press got there first, nothing was updated: that's fine,
    // they're confirmed either way, so show their details.
    const row = confirmed.rows[0] ?? (await db.query(
      "SELECT role, number, display_name, referral_code FROM signups WHERE id = $1",
      [person.id]
    )).rows[0];

    return NextResponse.json({
      ok: true,
      status: "confirmed",
      role: row.role,
      number: row.number, // their private #number
      displayName: row.display_name,
      referralCode: row.referral_code,
    });
  } catch (error) {
    console.error("[confirm] unexpected error:", error);
    return NextResponse.json(
      { ok: false, status: "error", error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}