// src/app/api/admin/leaderboard/route.ts
//
// WHAT THIS IS
// The FULL leaderboard, for picking the winner (admin only):
//   GET http://localhost:3000/api/admin/leaderboard
//
// The ONLY leaderboard: the public site doesn't show one (the winner's
// revealed live on stream). It lists EVERYONE with a recruit, with:
//   rank               only for eligible people with 1+ counted recruit
//   reachedAt          when they hit their current count (the tie-break)
//   flaggedRecruits    how many of their recruits have a red flag
//   recruitsFromOwnIp  how many recruits signed up from their own IP
// Check #1's flags before announcing. If they cheated, disqualify them
// and #2 moves up automatically.

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getAdminLeaderboard } from "@/lib/admin-signups";

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    return NextResponse.json({ ok: true, entries: await getAdminLeaderboard() });
  } catch (error) {
    console.error("[admin/leaderboard] unexpected error:", error);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
