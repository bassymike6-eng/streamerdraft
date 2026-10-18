// src/app/api/stats/route.ts
//
// WHAT THIS IS
// The public numbers for the landing page:
//   GET http://localhost:3000/api/stats
//
// WHAT IT SENDS BACK
//   { "ok": true, "roadTo300": { "count": 5, "goal": 300 } }
//
// THINGS TO KNOW
// - It's a GET, so you can open it straight in your browser to check it.
// - Next.js doesn't cache GET routes by default (since version 15), so every
//   visit runs the query again and the number is always fresh.
// - No leaderboard (F2): the winner's revealed live on stream, so nothing
//   public says who's winning. The full board is admin-only
//   (/api/admin/leaderboard).

import { NextResponse } from "next/server";
import { getRoadTo300 } from "@/lib/stats";
import { limitByIp } from "@/lib/rate-limit";

export async function GET(request: Request) {
  // Speed limit: 120 per minute per IP. The landing page asks for this
  // on every visit, so it's generous; it only stops something hammering it.
  const limited = limitByIp(request, "stats", 120, 60);
  if (limited) return limited;

  try {
    const roadTo300 = await getRoadTo300();
    return NextResponse.json({ ok: true, roadTo300 });
  } catch (error) {
    console.error("[stats] unexpected error:", error);
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
