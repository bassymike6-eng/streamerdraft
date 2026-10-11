// src/lib/admin-stats.ts
//
// WHAT THIS IS
// The numbers behind the admin dashboard's cards and graphs:
//   getOverview()  → the headline numbers (cards across the top)
//   getCharts()    → data shaped ready for graphs (lines, bars, pies),
//                    including what scouts can offer and their hours
//
// Everything here is read-only. Times are grouped by UK time
// (Europe/London), so "today" means today in the UK, not in UTC.

import "server-only";
import { db } from "@/lib/db";
import { GOAL } from "@/lib/stats";

// "What % is part of whole?", to 1 decimal place. 0 if whole is 0.
function percent(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part / whole) * 1000) / 10;
}

// One slice/bar of a chart: { label: "twitch", count: 12, percent: 40 }
export type ChartItem = { label: string; count: number; percent: number };

function withPercents(rows: { label: string; count: number }[]): ChartItem[] {
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  return rows.map((row) => ({ ...row, percent: percent(row.count, total) }));
}

// ── Headline numbers ────────────────────────────────────────────────
export async function getOverview() {
  // One pass over the table. FILTER (WHERE ...) counts only matching rows.
  const totals = (
    await db.query(`
      SELECT
        COUNT(*)::int                                                        AS all_signups,
        COUNT(*) FILTER (WHERE role = 'prospect')::int                       AS prospects,
        COUNT(*) FILTER (WHERE role = 'scout')::int                          AS scouts,
        COUNT(*) FILTER (WHERE confirmed_at IS NOT NULL)::int                AS confirmed,
        COUNT(*) FILTER (WHERE role = 'prospect' AND confirmed_at IS NOT NULL)::int AS prospects_confirmed,
        COUNT(*) FILTER (WHERE role = 'scout' AND confirmed_at IS NOT NULL)::int    AS scouts_confirmed,
        COUNT(*) FILTER (WHERE based_in_uk)::int                             AS uk,
        COUNT(*) FILTER (WHERE ip_country IS NOT NULL)::int                  AS country_known,
        COUNT(*) FILTER (WHERE referred_by_id IS NOT NULL)::int              AS referred,
        COUNT(*) FILTER (WHERE marketing_opt_in)::int                        AS marketing_opt_in,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')::int AS last_24h,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int   AS last_7d,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::int  AS last_30d,
        -- Road to 300: same rule as the public counter
        COUNT(*) FILTER (WHERE role = 'prospect' AND disqualified_at IS NULL)::int AS road_count,
        COUNT(*) FILTER (WHERE role = 'prospect' AND disqualified_at IS NULL
                           AND created_at >= NOW() - INTERVAL '7 days')::int AS road_last_7d
      FROM signups
    `)
  ).rows[0];

  // The competition numbers come from the admin_signups view (migration 005).
  const competition = (
    await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE eligible)::int     AS eligible,
        COUNT(*) FILTER (WHERE flagged)::int      AS flagged,
        COUNT(*) FILTER (WHERE disqualified)::int AS disqualified,
        COUNT(*) FILTER (WHERE role = 'scout' AND scout_approved)::int AS scouts_approved,
        COUNT(*) FILTER (WHERE role = 'scout' AND NOT scout_approved AND NOT disqualified)::int AS scouts_waiting
      FROM admin_signups
    `)
  ).rows[0];

  // At last week's pace, how many days until 300? (null = no sign-ups this week)
  const perDay = totals.road_last_7d / 7;
  const remaining = Math.max(GOAL - totals.road_count, 0);
  const projectedDaysToGoal = remaining === 0 ? 0 : perDay > 0 ? Math.ceil(remaining / perDay) : null;

  return {
    signups: {
      all: totals.all_signups,
      prospects: totals.prospects,
      scouts: totals.scouts,
    },
    confirmed: {
      all: totals.confirmed,
      prospects: totals.prospects_confirmed,
      scouts: totals.scouts_confirmed,
      percent: percent(totals.confirmed, totals.all_signups),
    },
    uk: {
      ticked: totals.uk,
      notTicked: totals.all_signups - totals.uk,
      percentTicked: percent(totals.uk, totals.all_signups),
      countryKnown: totals.country_known,
    },
    referrals: {
      viaRecruitLink: totals.referred,
      direct: totals.all_signups - totals.referred,
      percentViaRecruitLink: percent(totals.referred, totals.all_signups),
    },
    marketingOptIn: {
      count: totals.marketing_opt_in,
      percent: percent(totals.marketing_opt_in, totals.all_signups),
    },
    growth: {
      last24h: totals.last_24h,
      last7d: totals.last_7d,
      last30d: totals.last_30d,
    },
    roadTo300: {
      count: totals.road_count,
      goal: GOAL,
      percent: percent(totals.road_count, GOAL),
      prospectsLast7d: totals.road_last_7d,
      projectedDaysToGoal,
    },
    competition: {
      eligibleEntrants: competition.eligible, // confirmed + UK + not disqualified prospects
      flagged: competition.flagged,
      disqualified: competition.disqualified,
    },
    scouts: {
      approved: competition.scouts_approved,
      awaitingApproval: competition.scouts_waiting, // applications for you to review
    },
  };
}

// ── Graph data ──────────────────────────────────────────────────────
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const AUDIENCE_ORDER = ["under_10k", "10k_50k", "50k_100k", "100k_plus"];
const HOURS_ORDER = ["under_3", "3_5", "6_10", "10_plus"];

export async function getCharts(days: number) {
  // Each query is independent, so Promise.all runs them all at once.
  const [daily, platform, audience, content, country, ukTick, category, hour, weekday, funnel, offers, hours] =
    await Promise.all([
      // 1. Day by day, for line charts. generate_series makes one row per day,
      //    so days with 0 sign-ups still appear (as 0) instead of vanishing.
      //    to_char(..., 'YYYY-MM-DD') sends the date as plain text: the pg driver
      //    would otherwise turn it into a JavaScript Date at midnight, which
      //    can shift it to the day before when sent as JSON.
      db.query(
        `WITH days AS (
           SELECT generate_series(
             (NOW() AT TIME ZONE 'Europe/London')::date - ($1::int - 1),
             (NOW() AT TIME ZONE 'Europe/London')::date,
             INTERVAL '1 day'
           )::date AS day
         )
         SELECT
           to_char(d.day, 'YYYY-MM-DD') AS date,
           COUNT(s.id) FILTER (WHERE s.role = 'prospect')::int         AS prospects,
           COUNT(s.id) FILTER (WHERE s.role = 'scout')::int            AS scouts,
           COUNT(s.id) FILTER (WHERE s.referred_by_id IS NOT NULL)::int AS via_recruit_link,
           (SELECT COUNT(*)::int FROM signups c
             WHERE (c.confirmed_at AT TIME ZONE 'Europe/London')::date = d.day) AS confirmations,
           -- Running total for the Road to 300 line
           (SELECT COUNT(*)::int FROM signups p
             WHERE p.role = 'prospect' AND p.disqualified_at IS NULL
               AND (p.created_at AT TIME ZONE 'Europe/London')::date <= d.day) AS road_to_300
         FROM days d
         LEFT JOIN signups s ON (s.created_at AT TIME ZONE 'Europe/London')::date = d.day
         GROUP BY d.day
         ORDER BY d.day`,
        [days]
      ),

      // 2. Which platforms prospects stream on
      db.query(`SELECT platform AS label, COUNT(*)::int AS count
                FROM signups WHERE role = 'prospect'
                GROUP BY platform ORDER BY count DESC`),

      // 3. Scout audience sizes
      db.query(`SELECT audience_size AS label, COUNT(*)::int AS count
                FROM signups WHERE role = 'scout'
                GROUP BY audience_size`),

      // 4. Scout content types. unnest() turns each array into separate rows,
      //    so a scout who picked 2 types counts once in each.
      db.query(`SELECT unnest(content_types) AS label, COUNT(*)::int AS count
                FROM signups WHERE role = 'scout'
                GROUP BY label ORDER BY count DESC`),

      // 5. Countries (from Cloudflare). Unknown = local dev or no header.
      db.query(`SELECT COALESCE(ip_country, 'Unknown') AS label, COUNT(*)::int AS count
                FROM signups GROUP BY label ORDER BY count DESC`),

      // 6. Ticked "based in UK" or not
      db.query(`SELECT CASE WHEN based_in_uk THEN 'UK' ELSE 'Not UK' END AS label,
                       COUNT(*)::int AS count
                FROM signups GROUP BY label ORDER BY label DESC`),

      // 7. Top 10 stream categories (typed by prospects, so tidied first)
      db.query(`SELECT lower(trim(stream_category)) AS label, COUNT(*)::int AS count
                FROM signups
                WHERE role = 'prospect' AND stream_category IS NOT NULL AND trim(stream_category) <> ''
                GROUP BY label ORDER BY count DESC LIMIT 10`),

      // 8. Hour of the day people sign up (UK time): when to post
      db.query(`SELECT h AS hour, COUNT(s.id)::int AS count
                FROM generate_series(0, 23) AS h
                LEFT JOIN signups s
                  ON EXTRACT(HOUR FROM s.created_at AT TIME ZONE 'Europe/London') = h
                GROUP BY h ORDER BY h`),

      // 9. Day of the week (1 = Monday ... 7 = Sunday)
      db.query(`SELECT d AS weekday, COUNT(s.id)::int AS count
                FROM generate_series(1, 7) AS d
                LEFT JOIN signups s
                  ON EXTRACT(ISODOW FROM s.created_at AT TIME ZONE 'Europe/London') = d
                GROUP BY d ORDER BY d`),

      // 10. The prospect funnel: how many make it through each step
      db.query(`SELECT
                  COUNT(*)::int                                AS signed_up,
                  COUNT(*) FILTER (WHERE confirmed)::int       AS confirmed,
                  COUNT(*) FILTER (WHERE eligible)::int        AS eligible,
                  COUNT(*) FILTER (WHERE eligible AND recruits_counted > 0)::int AS recruiting
                FROM admin_signups WHERE role = 'prospect'`),

      // 11. What scouts can offer (each ticked option counts once)
      db.query(`SELECT unnest(scout_offers) AS label, COUNT(*)::int AS count
                FROM signups WHERE role = 'scout'
                GROUP BY label ORDER BY count DESC`),

      // 12. How many hours a month scouts can give
      db.query(`SELECT scout_hours AS label, COUNT(*)::int AS count
                FROM signups WHERE role = 'scout' AND scout_hours IS NOT NULL
                GROUP BY scout_hours`),
    ]);

  const f = funnel.rows[0];

  return {
    days,
    daily: daily.rows.map((row) => ({
      date: row.date,
      prospects: row.prospects,
      scouts: row.scouts,
      viaRecruitLink: row.via_recruit_link,
      confirmations: row.confirmations,
      roadTo300: row.road_to_300,
    })),
    byPlatform: withPercents(platform.rows),
    byAudienceSize: withPercents(
      // Sort sizes small → big, rather than by count
      [...audience.rows].sort((a, b) => AUDIENCE_ORDER.indexOf(a.label) - AUDIENCE_ORDER.indexOf(b.label))
    ),
    byContentType: withPercents(content.rows),
    byCountry: withPercents(country.rows),
    byUkTick: withPercents(ukTick.rows),
    byStreamCategory: withPercents(category.rows),
    byHour: hour.rows.map((row) => ({ hour: row.hour, count: row.count })),
    byWeekday: weekday.rows.map((row) => ({ day: WEEKDAYS[row.weekday - 1], count: row.count })),
    byScoutOffer: withPercents(offers.rows),
    byScoutHours: withPercents(
      [...hours.rows].sort((a, b) => HOURS_ORDER.indexOf(a.label) - HOURS_ORDER.indexOf(b.label))
    ),
    prospectFunnel: [
      { step: "Signed up", count: f.signed_up, percent: 100 },
      { step: "Confirmed email", count: f.confirmed, percent: percent(f.confirmed, f.signed_up) },
      { step: "Eligible (UK)", count: f.eligible, percent: percent(f.eligible, f.signed_up) },
      { step: "Recruited 1+", count: f.recruiting, percent: percent(f.recruiting, f.signed_up) },
    ],
  };
}
