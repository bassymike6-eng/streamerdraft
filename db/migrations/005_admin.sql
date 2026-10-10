-- db/migrations/005_admin.sql
--
-- WHAT THIS DOES
-- Gets the database ready for the admin dashboard:
--
-- 1. Three new columns so you can act on what you find:
--      disqualified_at      when you disqualified someone (NULL = not disqualified)
--      disqualified_reason  why, in your words, e.g. "fake recruits from one IP"
--      admin_note           any private note you want to keep about a person
--    Disqualified people stop counting everywhere: Road to 300, recruit
--    counts and the leaderboard. Un-disqualify them and they count again.
--
-- 2. A VIEW called admin_signups.
--    A view is a saved query that you can use like a table. This one is every
--    sign-up PLUS everything worked out about them: who recruited them, their
--    recruit counts, how many people share their IP fingerprint, and red flags.
--    The admin API reads from it, and you can open it in pgAdmin too:
--      SELECT * FROM admin_signups ORDER BY id;
--
-- THE RED FLAGS (each one means "have a look", not "definitely cheating")
--   flag_shared_ip             3+ sign-ups share this IP fingerprint
--                              (could be a house or a college, could be a farm)
--   flag_same_ip_as_recruiter  signed up from the same place as the person who
--                              recruited them: the classic self-referral
--   flag_uk_mismatch           ticked "based in UK" but Cloudflare says another country
--   flag_tor                   signed up through Tor (Cloudflare code 'T1')
--   flag_recruit_burst         THIS person got 5+ recruits within 10 minutes
--
-- To change a threshold later (3 or 5 or 10 minutes), make a new migration
-- with CREATE OR REPLACE VIEW. Never edit this file once it has run.

ALTER TABLE signups
  ADD COLUMN disqualified_at     TIMESTAMPTZ,
  ADD COLUMN disqualified_reason TEXT,
  ADD COLUMN admin_note          TEXT;

CREATE VIEW admin_signups AS
WITH
  -- How many sign-ups share each IP fingerprint.
  ip_groups AS (
    SELECT ip_hash, COUNT(*) AS size
    FROM signups
    WHERE ip_hash IS NOT NULL
    GROUP BY ip_hash
  ),

  -- Each person's recruits, counted the same way as the public numbers.
  -- Disqualified recruits don't count for anything.
  recruit_counts AS (
    SELECT
      referred_by_id AS recruiter_id,
      COUNT(*) FILTER (WHERE based_in_uk AND confirmed_at IS NOT NULL) AS counted,
      COUNT(*) FILTER (WHERE based_in_uk AND confirmed_at IS NULL)     AS pending,
      COUNT(*) FILTER (WHERE NOT based_in_uk)                          AS outside_uk,
      COUNT(*)                                                         AS total
    FROM signups
    WHERE referred_by_id IS NOT NULL
      AND disqualified_at IS NULL
    GROUP BY referred_by_id
  ),

  -- The most recruits each person got inside any 10-minute window.
  -- "RANGE ... 10 minutes PRECEDING" = for each recruit, count the recruits
  -- by the same recruiter in the 10 minutes up to and including that one.
  bursts AS (
    SELECT recruiter_id, MAX(in_window) AS max_in_10_min
    FROM (
      SELECT
        referred_by_id AS recruiter_id,
        COUNT(*) OVER (
          PARTITION BY referred_by_id
          ORDER BY created_at
          RANGE BETWEEN INTERVAL '10 minutes' PRECEDING AND CURRENT ROW
        ) AS in_window
      FROM signups
      WHERE referred_by_id IS NOT NULL
    ) windows
    GROUP BY recruiter_id
  ),

  -- Everything about each person, plus the worked-out numbers and flags
  everything AS (
    SELECT
      -- Everything about the person
      s.id, s.role, s.email, s.display_name,
      s.platform, s.channel_url, s.stream_category,
      s.platform_urls, s.audience_size, s.content_types,
      s.marketing_opt_in, s.based_in_uk, s.ip_country, s.ip_hash,
      s.referral_code, s.number, s.feedback,
      s.created_at, s.confirmed_at, s.rules_accepted_at,
      s.disqualified_at, s.disqualified_reason, s.admin_note,
      s.confirmed_at IS NOT NULL    AS confirmed,
      s.disqualified_at IS NOT NULL AS disqualified,

      -- Can this person win? (a confirmed, UK-based, not-disqualified prospect)
      (s.role = 'prospect' AND s.confirmed_at IS NOT NULL
         AND s.based_in_uk AND s.disqualified_at IS NULL) AS eligible,

      -- Who recruited them
      r.id AS recruiter_id, r.display_name AS recruiter_name, r.referral_code AS recruiter_code,

      -- Their own recruits
      COALESCE(rc.counted, 0)::int    AS recruits_counted,
      COALESCE(rc.pending, 0)::int    AS recruits_pending,
      COALESCE(rc.outside_uk, 0)::int AS recruits_outside_uk,
      COALESCE(rc.total, 0)::int      AS recruits_total,

      -- How many sign-ups (including them) share their IP fingerprint
      COALESCE(ip.size, 1)::int AS ip_group_size,

      -- Red flags (COALESCE turns "unknown" into "no")
      COALESCE(ip.size, 1) >= 3                                           AS flag_shared_ip,
      COALESCE(s.ip_hash = r.ip_hash, FALSE)                              AS flag_same_ip_as_recruiter,
      COALESCE(s.based_in_uk AND s.ip_country <> 'GB', FALSE)             AS flag_uk_mismatch,
      COALESCE(s.ip_country = 'T1', FALSE)                                AS flag_tor,
      COALESCE(b.max_in_10_min, 0) >= 5                                   AS flag_recruit_burst
    FROM signups s
    LEFT JOIN signups r         ON r.id = s.referred_by_id
    LEFT JOIN recruit_counts rc ON rc.recruiter_id = s.id
    LEFT JOIN ip_groups ip      ON ip.ip_hash = s.ip_hash
    LEFT JOIN bursts b          ON b.recruiter_id = s.id
  )

-- Finally: all of the above, plus one "flagged" column that's true
-- if ANY red flag is up (handy for filtering).
SELECT
  everything.*,
  (flag_shared_ip OR flag_same_ip_as_recruiter OR flag_uk_mismatch
     OR flag_tor OR flag_recruit_burst) AS flagged
FROM everything;