// src/app/api/entry/resend/route.ts
//
// WHAT THIS IS
// The "Resend email" button: sends a fresh confirmation link.
//   POST /api/entry/resend   { "key": "<status key>" }
//
// WHAT IT SENDS BACK
//   200 { ok: true, emailSent: true }                     sent (the old link stops working)
//   200 { ok: true, emailSent: false }                    saved, but the email didn't go
//   200 { ok: true, status: "already_confirmed" }         nothing to resend
//   404 { ok: false, status: "unknown" }                  no one has that key
//   429 { ok: false, status: "too_soon", retryAfterSeconds }  one email a minute, at most
//
// Two speed limits: per IP (like every route), and per person (one email a
// minute), so the button can't be used to flood someone's inbox.

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { sendConfirmation } from "@/lib/confirmation";
import { hashToken } from "@/lib/tokens";
import { limitByIp } from "@/lib/rate-limit";

const COOLDOWN_SECONDS = 60;
const LINK_LIFETIME_HOURS = 48; // the same as in confirmation.ts

const resendSchema = z.object({ key: z.string().min(20).max(100) });

export async function POST(request: Request) {
  const limited = limitByIp(request, "resend", 6, 10 * 60);
  if (limited) return limited;

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
    }
    const parsed = resendSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, status: "unknown" }, { status: 404 });
    }

    // Who, and when their current link was sent (expiry minus its lifetime)
    const found = await db.query(
      `SELECT id, email, display_name, role, confirmed_at IS NOT NULL AS confirmed,
              EXTRACT(EPOCH FROM (NOW() - (confirm_expires_at - make_interval(hours => $2))))::int AS sent_seconds_ago
       FROM signups WHERE status_key_hash = $1`,
      [hashToken(parsed.data.key), LINK_LIFETIME_HOURS]
    );
    if (found.rows.length === 0) {
      return NextResponse.json({ ok: false, status: "unknown" }, { status: 404 });
    }
    const person = found.rows[0];
    if (person.confirmed) {
      return NextResponse.json({ ok: true, status: "already_confirmed" });
    }
    const wait = COOLDOWN_SECONDS - (person.sent_seconds_ago ?? COOLDOWN_SECONDS);
    if (wait > 0) {
      return NextResponse.json(
        { ok: false, status: "too_soon", error: `We just sent one. You can ask for another in ${wait} seconds.`, retryAfterSeconds: wait },
        { status: 429 }
      );
    }

    const emailSent = await sendConfirmation({
      id: person.id,
      email: person.email,
      displayName: person.display_name,
      role: person.role,
    });
    return NextResponse.json({ ok: true, emailSent });
  } catch (error) {
    console.error("[resend] unexpected error:", error);
    return NextResponse.json({ ok: false, error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
