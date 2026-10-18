// src/app/api/entry/route.ts
//
// WHAT THIS IS
// "Where's my entry at?", asked by the page with one of the person's private keys:
//   GET /api/entry?key=<key>
// The key is either the status key the sign-up gave the browser they joined
// from, or (on the device they confirmed on) the token from their email link.
//
// WHAT IT SENDS BACK
//   200 { ok: true, entry: { status: "pending" | "confirmed", role, displayName,
//         number, ukEligible, referralCode, referrals: {counted, pending, outsideUk} } }
//   404 { ok: false, status: "unknown" }   (no one has that key: e.g. they signed
//         up again since, which gives a fresh key, or it was typed wrong)
//
// The page asks every few seconds while it's waiting for them to confirm, so
// "Entry pending" turns into "Entry confirmed" by itself, even when they
// confirm on another device. Keys are private: only the person's own
// browsers have them (we keep scrambled copies). That's what keeps everyone's
// numbers to themselves: there's no way to look someone else's up.

import { NextResponse } from "next/server";
import { getEntryStatus } from "@/lib/stats";
import { hashToken } from "@/lib/tokens";
import { limitByIp } from "@/lib/rate-limit";

// The keys we make are 43 characters of letters, digits, - and _
const KEY_SHAPE = /^[A-Za-z0-9_-]{20,100}$/;

export async function GET(request: Request) {
  // Plenty for a page checking every few seconds; far too slow to guess keys
  const limited = limitByIp(request, "entry", 120, 60);
  if (limited) return limited;

  try {
    const key = new URL(request.url).searchParams.get("key") ?? "";
    if (!KEY_SHAPE.test(key)) {
      return NextResponse.json({ ok: false, status: "unknown" }, { status: 404 });
    }
    const entry = await getEntryStatus(hashToken(key));
    if (!entry) {
      return NextResponse.json({ ok: false, status: "unknown" }, { status: 404 });
    }
    return NextResponse.json(
      { ok: true, entry },
      { headers: { "Cache-Control": "no-store" } } // always fresh: it's about to change
    );
  } catch (error) {
    console.error("[entry] unexpected error:", error);
    return NextResponse.json({ ok: false, error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
