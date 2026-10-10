// src/lib/stats.ts
//
// WHAT THIS IS
// The numbers the site shows. Three questions, each answered by one SQL query:
//   1. Road to 300: how many streamers have signed up so far?
//   2. Recruit counts: for one person, how many recruits count, how many
//      are still pending, and how many are outside the UK?
//   3. Leaderboard: who are the top 10 recruiters?
//
// THE RULES (from docs/PLAN.md)
// - Road to 300 counts EVERY prospect sign-up: any country, confirmed or not.
// - A recruit COUNTS once they've confirmed their email AND ticked "based in UK".
//   Prospect or scout, both count.
// - PENDING = ticked UK but hasn't confirmed yet (the recruiter can chase them).
// - OUTSIDE UK = can join, but never counts. We still return the number so
//   the page can explain why a friend isn't showing up as counted.
// - Leaderboard: only confirmed, UK-based prospects (the people who can win)
//   with at least 1 counted recruit. Same count? Whoever got there first ranks higher.
// - DISQUALIFIED people (set from the admin dashboard) don't count anywhere:
//   not in the 300, not as anyone's recruit, not on the leaderboard.
//
// ONE THING TO KNOW ABOUT COUNT
// Postgres's COUNT() returns a "bigint" (a huge whole number). The pg driver
// hands bigints back as TEXT ("3", not 3), because JavaScript numbers can't
// hold every bigint exactly. Our counts will never be that big, so we add
// ::int to turn them into normal numbers.

import { db } from "@/lib/db";

export const GOAL = 300;

// ── 1. Road to 300 ──────────────────────────────────────────────────
export async function getRoadTo300(): Promise<{ count: number; goal: number }> {
  const result = await db.query(
    "SELECT COUNT(*)::int AS count FROM signups WHERE role = 'prospect' AND disqualified_at IS NULL"
  );
  return { count: result.rows[0].count, goal: GOAL };
}

// ── 2. One person's recruit counts ──────────────────────────────────
export type RecruitCounts = {
  counted: number; // confirmed + UK: these are the ones that count
  pending: number; // UK but not confirmed yet
  outsideUk: number; // signed up from outside the UK: never count
};

// Looks the person up by their recruit code (the 6 characters in /r/abc123).
// Returns null if no one has that code.
export async function getRecruitCounts(referralCode: string): Promise<RecruitCounts | null> {
  // r = the recruiter, x = the people they recruited.
  // LEFT JOIN keeps the recruiter even when they have 0 recruits
  // (a normal JOIN would drop them and we'd wrongly say "unknown code").
  // "AND x.disqualified_at IS NULL" in the join leaves disqualified recruits out.
  // FILTER (WHERE ...) = "only count the rows that match this".
  // COUNT(x.id) skips the empty row LEFT JOIN makes when there are 0 recruits.
  const result = await db.query(
    `SELECT
       COUNT(x.id) FILTER (WHERE x.based_in_uk AND x.confirmed_at IS NOT NULL)::int AS counted,
       COUNT(x.id) FILTER (WHERE x.based_in_uk AND x.confirmed_at IS NULL)::int     AS pending,
       COUNT(x.id) FILTER (WHERE NOT x.based_in_uk)::int                            AS outside_uk
     FROM signups r
     LEFT JOIN signups x ON x.referred_by_id = r.id AND x.disqualified_at IS NULL
     WHERE r.referral_code = $1
     GROUP BY r.id`,
    [referralCode.toLowerCase()]
  );

  if (result.rows.length === 0) return null; // no one has this code

  const row = result.rows[0];
  return { counted: row.counted, pending: row.pending, outsideUk: row.outside_uk };
}

// ── 3. Leaderboard ──────────────────────────────────────────────────
export type LeaderboardEntry = {
  rank: number;
  displayName: string;
  recruits: number;
};

export async function getLeaderboard(limit = 10): Promise<LeaderboardEntry[]> {
  // A normal JOIN (not LEFT) on purpose: people with 0 counted recruits
  // have nothing to join to, so they drop out. That's the "1+ only" rule.
  //
  // reached_at = when their LATEST counted recruit confirmed, which is the
  // moment they hit their current number. Sorting by it (earliest first)
  // breaks ties: whoever reached the number first ranks higher.
  // r.id is a last-resort tie-break so the order never shuffles.
  const result = await db.query(
    `SELECT
       r.display_name,
       COUNT(*)::int       AS recruits,
       MAX(x.confirmed_at) AS reached_at
     FROM signups r
     JOIN signups x ON x.referred_by_id = r.id
     WHERE r.role = 'prospect'
       AND r.confirmed_at IS NOT NULL
       AND r.based_in_uk
       AND r.disqualified_at IS NULL
       AND x.confirmed_at IS NOT NULL
       AND x.based_in_uk
       AND x.disqualified_at IS NULL
     GROUP BY r.id, r.display_name
     ORDER BY recruits DESC, reached_at ASC, r.id ASC
     LIMIT $1`,
    [limit]
  );

  // Rows come back already sorted, so rank is just position + 1.
  // We only send the name and count: never emails or codes.
  return result.rows.map((row, index) => ({
    rank: index + 1,
    displayName: row.display_name,
    recruits: row.recruits,
  }));
}