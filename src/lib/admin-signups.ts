// src/lib/admin-signups.ts
//
// WHAT THIS IS
// Everything the admin dashboard needs about PEOPLE:
//   listSignups()        the big searchable, filterable table
//   getSignupDetail()    one person: details, their recruits, who shares their IP
//   setDisqualified()    disqualify / reinstate someone
//   setNote()            your private note on someone
//   setScoutApproved()   approve / un-approve a scout's application
//   deleteSignup()       remove someone completely (e.g. "delete my data" requests)
//   getAdminLeaderboard() the FULL leaderboard, with the extra info to pick a winner
//   getFlags()           all the red flags, grouped
//   getExportRows()      every sign-up, for the CSV download
//
// It all reads from the admin_signups view (migrations 005 + 006), which
// already has the recruit counts, red flags and scout answers worked out.

import "server-only";
import { db } from "@/lib/db";

// ── The columns we send for a person ────────────────────────────────
// The database uses snake_case (display_name); JavaScript uses camelCase
// (displayName). "AS "displayName"" renames each column on the way out, so
// the front end gets tidy names. The quotes keep the capital letters.
// We only send the first 10 characters of the IP fingerprint: enough to
// spot matches by eye, and the full value never needs to leave the server.
const PERSON_COLUMNS = `
  id::int AS id, role, email, display_name AS "displayName",
  platform, channel_url AS "channelUrl", stream_category AS "streamCategory",
  platform_urls AS "platformUrls", audience_size AS "audienceSize", content_types AS "contentTypes",
  marketing_opt_in AS "marketingOptIn", based_in_uk AS "basedInUk", ip_country AS "ipCountry",
  left(ip_hash, 10) AS "ipFingerprint", ip_group_size AS "ipGroupSize",
  referral_code AS "referralCode", number, feedback,
  created_at AS "createdAt", confirmed_at AS "confirmedAt", rules_accepted_at AS "rulesAcceptedAt",
  confirmed, eligible,
  disqualified, disqualified_at AS "disqualifiedAt", disqualified_reason AS "disqualifiedReason",
  admin_note AS "adminNote",
  recruiter_id::int AS "recruiterId", recruiter_name AS "recruiterName", recruiter_code AS "recruiterCode",
  recruits_counted AS "recruitsCounted", recruits_pending AS "recruitsPending",
  recruits_outside_uk AS "recruitsOutsideUk", recruits_total AS "recruitsTotal",
  scout_offers AS "scoutOffers", scout_hours AS "scoutHours", scout_pitch AS "scoutPitch",
  commitment_accepted_at AS "commitmentAcceptedAt",
  scout_approved AS "scoutApproved", scout_approved_at AS "scoutApprovedAt",
  flagged,
  flag_shared_ip AS "flagSharedIp", flag_same_ip_as_recruiter AS "flagSameIpAsRecruiter",
  flag_uk_mismatch AS "flagUkMismatch", flag_tor AS "flagTor", flag_recruit_burst AS "flagRecruitBurst"
`;

// ── 1. The big table ────────────────────────────────────────────────
export type SignupFilters = {
  search?: string; // matches email, name or recruit code
  role?: "prospect" | "scout";
  status?: "confirmed" | "unconfirmed" | "eligible" | "disqualified" | "approved" | "awaiting_approval";
  uk?: "yes" | "no";
  flagged?: "yes";
  sort: "newest" | "oldest" | "recruits" | "name";
  page: number;
  pageSize: number;
};

// SAFETY: user input NEVER goes into the SQL text itself. Values go in as
// $1, $2... placeholders, and sort orders come from this fixed list, so
// "?sort=; DROP TABLE signups" just doesn't match anything.
const SORTS = {
  newest: "created_at DESC, id DESC",
  oldest: "created_at ASC, id ASC",
  recruits: "recruits_counted DESC, recruits_total DESC, id ASC",
  name: "lower(display_name) ASC, id ASC",
} as const;

const STATUS_RULES = {
  confirmed: "confirmed",
  unconfirmed: "NOT confirmed",
  eligible: "eligible",
  disqualified: "disqualified",
  approved: "scout_approved", // scouts you've approved
  awaiting_approval: "role = 'scout' AND NOT scout_approved AND NOT disqualified", // scouts to review
} as const;

export async function listSignups(filters: SignupFilters) {
  const conditions: string[] = [];
  const values: unknown[] = [];

  // Adds a value to the list and returns its placeholder, e.g. "$3".
  const param = (value: unknown) => {
    values.push(value);
    return `$${values.length}`;
  };

  if (filters.search) {
    // ILIKE = "contains, ignoring capitals". % and _ are wildcards in ILIKE,
    // so we put a \ in front of any the admin actually typed.
    const pattern = `%${filters.search.replace(/[\\%_]/g, "\\$&")}%`;
    const p = param(pattern);
    conditions.push(`(email ILIKE ${p} OR display_name ILIKE ${p} OR referral_code ILIKE ${p})`);
  }
  if (filters.role) conditions.push(`role = ${param(filters.role)}`);
  if (filters.status) conditions.push(STATUS_RULES[filters.status]);
  if (filters.uk) conditions.push(filters.uk === "yes" ? "based_in_uk" : "NOT based_in_uk");
  if (filters.flagged) conditions.push("flagged");

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // How many match in total (for "page 2 of 7")
  const total = (await db.query(`SELECT COUNT(*)::int AS total FROM admin_signups ${where}`, values)).rows[0]
    .total as number;

  // Just this page of results
  const limit = param(filters.pageSize);
  const offset = param((filters.page - 1) * filters.pageSize);
  const rows = await db.query(
    `SELECT ${PERSON_COLUMNS} FROM admin_signups ${where}
     ORDER BY ${SORTS[filters.sort]}
     LIMIT ${limit} OFFSET ${offset}`,
    values
  );

  return {
    total,
    page: filters.page,
    pageSize: filters.pageSize,
    totalPages: Math.max(1, Math.ceil(total / filters.pageSize)),
    signups: rows.rows,
  };
}

// ── 2. One person in full ───────────────────────────────────────────
export async function getSignupDetail(id: number) {
  const person = (await db.query(`SELECT ${PERSON_COLUMNS}, ip_hash FROM admin_signups WHERE id = $1`, [id]))
    .rows[0];
  if (!person) return null;

  // Run the two follow-up lookups at the same time.
  const [recruits, sameIp] = await Promise.all([
    // Everyone they recruited, newest first
    db.query(`SELECT ${PERSON_COLUMNS} FROM admin_signups WHERE recruiter_id = $1 ORDER BY created_at DESC`, [
      id,
    ]),
    // Everyone else who signed up from the same IP fingerprint
    person.ip_hash
      ? db.query(
          `SELECT ${PERSON_COLUMNS} FROM admin_signups WHERE ip_hash = $1 AND id <> $2 ORDER BY created_at`,
          [person.ip_hash, id]
        )
      : Promise.resolve({ rows: [] }),
  ]);

  delete person.ip_hash; // used for the lookup above; never sent out
  return { signup: person, recruits: recruits.rows, sameIpFingerprint: sameIp.rows };
}

// ── 3. Actions ──────────────────────────────────────────────────────
// Each returns true if the person exists (and was changed), false if not.

export async function setDisqualified(id: number, disqualified: boolean, reason?: string) {
  const result = await db.query(
    disqualified
      ? // COALESCE keeps the ORIGINAL time if they were already disqualified
        `UPDATE signups SET disqualified_at = COALESCE(disqualified_at, NOW()), disqualified_reason = $2
         WHERE id = $1`
      : `UPDATE signups SET disqualified_at = NULL, disqualified_reason = NULL WHERE id = $1`,
    disqualified ? [id, reason ?? null] : [id]
  );
  return result.rowCount === 1;
}

export async function setNote(id: number, note: string) {
  // An empty note clears it (saved as NULL rather than "")
  const result = await db.query(`UPDATE signups SET admin_note = NULLIF($2, '') WHERE id = $1`, [id, note]);
  return result.rowCount === 1;
}

// Scouts only. Returns "ok", "not_found", or "not_scout" (prospects don't get approved).
export async function setScoutApproved(id: number, approved: boolean) {
  const result = await db.query(
    approved
      ? // COALESCE keeps the ORIGINAL approval time if they were already approved
        `UPDATE signups SET scout_approved_at = COALESCE(scout_approved_at, NOW())
         WHERE id = $1 AND role = 'scout'`
      : `UPDATE signups SET scout_approved_at = NULL WHERE id = $1 AND role = 'scout'`,
    [id]
  );
  if (result.rowCount === 1) return "ok";

  // Nothing changed: work out why, so the dashboard can say something useful.
  const exists = await db.query("SELECT 1 FROM signups WHERE id = $1", [id]);
  return exists.rows.length === 0 ? "not_found" : "not_scout";
}

export async function deleteSignup(id: number) {
  // Their recruits stay, but lose the link back to them
  // (the table was set up with ON DELETE SET NULL in migration 001).
  const result = await db.query(`DELETE FROM signups WHERE id = $1`, [id]);
  return result.rowCount === 1;
}

// ── 4. The full leaderboard ─────────────────────────────────────────
// Everyone with at least one recruit (any status), not just the top 10.
// Only ELIGIBLE people with 1+ counted recruit get a rank; everyone else is
// listed underneath with rank null, so you can see who's close but not in.
export async function getAdminLeaderboard() {
  const rows = await db.query(`
    SELECT
      ${PERSON_COLUMNS},
      -- When they reached their current count (for the tie-break)
      (SELECT MAX(x.confirmed_at) FROM signups x
        WHERE x.referred_by_id = a.id AND x.based_in_uk
          AND x.confirmed_at IS NOT NULL AND x.disqualified_at IS NULL) AS "reachedAt",
      -- How many of their recruits have a red flag
      (SELECT COUNT(*)::int FROM admin_signups x
        WHERE x.recruiter_id = a.id AND x.flagged) AS "flaggedRecruits",
      -- How many of their recruits signed up from THEIR IP fingerprint
      (SELECT COUNT(*)::int FROM admin_signups x
        WHERE x.recruiter_id = a.id AND x.flag_same_ip_as_recruiter) AS "recruitsFromOwnIp"
    FROM admin_signups a
    WHERE a.recruits_total > 0
    ORDER BY
      (a.eligible AND a.recruits_counted > 0) DESC,
      a.recruits_counted DESC,
      "reachedAt" ASC NULLS LAST,
      a.id ASC
  `);

  let rank = 0;
  return rows.rows.map((row) => ({
    rank: row.eligible && row.recruitsCounted > 0 ? ++rank : null,
    ...row,
  }));
}

// ── 5. Red flags, grouped ───────────────────────────────────────────
const SHORT_COLUMNS = `
  id::int AS id, role, email, display_name AS "displayName", ip_country AS "ipCountry",
  recruiter_name AS "recruiterName", confirmed, disqualified, created_at AS "createdAt"
`;

export async function getFlags() {
  const [summary, ipGroups, sameIp, ukMismatch, tor, bursts] = await Promise.all([
    db.query(`
      SELECT
        COUNT(*) FILTER (WHERE flagged)::int                   AS flagged,
        COUNT(*) FILTER (WHERE flag_shared_ip)::int            AS shared_ip,
        COUNT(*) FILTER (WHERE flag_same_ip_as_recruiter)::int AS same_ip_as_recruiter,
        COUNT(*) FILTER (WHERE flag_uk_mismatch)::int          AS uk_mismatch,
        COUNT(*) FILTER (WHERE flag_tor)::int                  AS tor,
        COUNT(*) FILTER (WHERE flag_recruit_burst)::int        AS recruit_burst
      FROM admin_signups`),

    // Groups of 3+ people sharing one IP fingerprint, biggest first.
    // json_agg bundles each group's members into one list.
    db.query(`
      SELECT
        left(ip_hash, 10) AS "ipFingerprint",
        COUNT(*)::int AS size,
        json_agg(json_build_object(
          'id', id, 'displayName', display_name, 'email', email, 'role', role,
          'recruiterName', recruiter_name, 'confirmed', confirmed, 'createdAt', created_at
        ) ORDER BY created_at) AS members
      FROM admin_signups
      WHERE ip_hash IS NOT NULL
      GROUP BY ip_hash
      HAVING COUNT(*) >= 3
      ORDER BY size DESC`),

    db.query(`SELECT ${SHORT_COLUMNS} FROM admin_signups WHERE flag_same_ip_as_recruiter ORDER BY created_at DESC`),
    db.query(`SELECT ${SHORT_COLUMNS} FROM admin_signups WHERE flag_uk_mismatch ORDER BY created_at DESC`),
    db.query(`SELECT ${SHORT_COLUMNS} FROM admin_signups WHERE flag_tor ORDER BY created_at DESC`),
    db.query(`SELECT ${SHORT_COLUMNS}, recruits_total AS "recruitsTotal"
              FROM admin_signups WHERE flag_recruit_burst ORDER BY recruits_total DESC`),
  ]);

  const s = summary.rows[0];
  return {
    summary: {
      flaggedPeople: s.flagged,
      sharedIp: s.shared_ip,
      sameIpAsRecruiter: s.same_ip_as_recruiter,
      ukMismatch: s.uk_mismatch,
      tor: s.tor,
      recruitBurst: s.recruit_burst,
    },
    ipGroups: ipGroups.rows, // 3+ sign-ups from one place
    sameIpAsRecruiter: sameIp.rows, // likely self-referrals
    ukMismatch: ukMismatch.rows, // ticked UK, IP says elsewhere
    tor: tor.rows, // signed up through Tor
    recruitBursts: bursts.rows, // recruiters who got 5+ in 10 minutes
  };
}

// ── 6. Everything, for the CSV download ─────────────────────────────
export async function getExportRows() {
  return (await db.query(`SELECT ${PERSON_COLUMNS} FROM admin_signups ORDER BY id`)).rows as Record<
    string,
    unknown
  >[];
}