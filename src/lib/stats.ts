// src/lib/stats.ts
//
// WHAT THIS IS
// The numbers the public site shows. Each answered by SQL:
//   1. Road to 300: how many people are in so far (streamers and scouts)?
//   2. One person's own entry (by their private key): pending or confirmed,
//      in the UK or not, and how THEIR referrals are doing.
//
// NO PUBLIC LEADERBOARD (decided in F2)
// The winner is revealed live on stream, so the site never shows who's
// winning: no names, no ranks, nobody else's numbers. Each person only sees
// their own referrals, and only with their private key. The full leaderboard
// is admin-only (src/lib/admin-signups.ts: getAdminLeaderboard, for the F5
// dashboard).
//
// THE RULES
// - Road to 300 counts everyone who's CONFIRMED their email, streamers and
//   scouts together, any country. It decides the prize: 300 or more by the
//   close, the top referrer wins GTA 6; fewer, a £25 prize (the rules, Rules.tsx).
// - "In the UK" is the uk_eligible column (migration 007): they ticked "based in
//   the UK" AND an IP of theirs was in the UK (or we couldn't tell, e.g. local dev).
// - A referral COUNTS once the person who used the link has confirmed their
//   email AND is uk_eligible. Prospect or scout, both count.
// - PENDING = uk_eligible but hasn't confirmed yet (the referrer can chase them).
// - OUTSIDE UK = can join, but never counts. We still return the number so
//   the page can explain why a friend isn't showing up as counted.
// - DISQUALIFIED people (set from the admin dashboard) don't count anywhere:
//   not in the 300, and not as anyone's referral.
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
    `SELECT COUNT(*)::int AS count
     FROM signups
     WHERE confirmed_at IS NOT NULL AND disqualified_at IS NULL`
  );
  return { count: result.rows[0].count, goal: GOAL };
}

// ── 2. One person's own entry ───────────────────────────────────────
export type RecruitCounts = {
  counted: number; // confirmed + in the UK: these are the ones that count
  pending: number; // in the UK but not confirmed yet
  outsideUk: number; // not in the UK: never count
};

export type EntryStatus = {
  status: "pending" | "confirmed";
  role: "prospect" | "scout";
  displayName: string;
  number: number | null; // their #number, once confirmed
  ukEligible: boolean; // in the UK (by the rule above): can win, and their referrals can count
  referralCode: string | null; // only once confirmed: that's when they get their link
  referrals: RecruitCounts;
  turnedDown: boolean; // scouts we've turned down as a scout (the dashboard): still in the competition
};

// Looks a person up by the scrambled copy of one of their private keys:
//   status_key_hash     the key the sign-up gave the browser they joined from
//   confirm_token_hash  the link in their email, which the confirm page keeps
//                       as the key for the device they confirmed on (it stops
//                       being replaced once they've confirmed, so it lasts)
export async function getEntryStatus(keyHash: string): Promise<EntryStatus | null> {
  // s = the person, x = the people who used their link.
  // LEFT JOIN keeps them even with 0 referrals; FILTER (WHERE ...) counts
  // only the rows that match; COUNT(x.id) skips the empty row LEFT JOIN makes.
  const found = await db.query(
    `SELECT s.role, s.display_name, s.number, s.uk_eligible, s.referral_code,
            s.confirmed_at IS NOT NULL AS confirmed,
            s.scout_turned_down_at IS NOT NULL AS turned_down,
            COUNT(x.id) FILTER (WHERE x.uk_eligible AND x.confirmed_at IS NOT NULL)::int AS counted,
            COUNT(x.id) FILTER (WHERE x.uk_eligible AND x.confirmed_at IS NULL)::int     AS pending,
            COUNT(x.id) FILTER (WHERE NOT x.uk_eligible)::int                            AS outside_uk
     FROM signups s
     LEFT JOIN signups x ON x.referred_by_id = s.id AND x.disqualified_at IS NULL
     WHERE s.status_key_hash = $1
        OR (s.confirm_token_hash = $1 AND s.confirmed_at IS NOT NULL)
     GROUP BY s.id`,
    [keyHash]
  );
  if (found.rows.length === 0) return null;
  const row = found.rows[0];
  return {
    status: row.confirmed ? "confirmed" : "pending",
    role: row.role,
    displayName: row.display_name,
    number: row.number,
    ukEligible: row.uk_eligible,
    referralCode: row.confirmed ? row.referral_code : null,
    referrals: { counted: row.counted, pending: row.pending, outsideUk: row.outside_uk },
    turnedDown: row.turned_down,
  };
}
