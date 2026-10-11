-- db/migrations/006_scout_application.sql
--
-- WHAT THIS DOES
-- Turns the scout sign-up into an APPLICATION. Scouts now tell us what they
-- can actually do for a prospect, and agree to the commitment.
--
-- NEW COLUMNS (all empty for prospects)
--   scout_offers            what they can help with (they tick 1 or more):
--                             obs_setup       setting up OBS / stream quality
--                             multistreaming  streaming to more than one platform
--                             clipping        clipping and editing
--                             raids           raids and shoutouts
--                             collabs         streaming together
--                             feedback        feedback calls on their content
--                             socials         growing on TikTok / Shorts / Reels
--                             intros          introductions to other creators
--   scout_hours             roughly how many hours a month: under_3, 3_5, 6_10, 10_plus
--   scout_pitch             one line on why they want to scout (optional)
--   commitment_accepted_at  WHEN they ticked "6 weeks, 2 feedback calls,
--                           1 raid or collab" (a record that they agreed)
--   scout_approved_at       when YOU approved them (empty = not approved yet)
--
-- WHY THERE'S NO "SCOUTS MUST ANSWER" RULE IN THE DATABASE
-- Your test database already has scouts from before this existed, and a
-- rule like that would break the moment one of them is updated (confirmed,
-- disqualified...). So the sign-up rules (validation.ts) make the questions
-- required for every NEW scout instead. The live database starts empty, so
-- every real scout will have answered.
--
-- THE ADMIN VIEW
-- admin_signups (from 005) gets the new columns too. A view can't have
-- columns added in the middle, so we DROP it and CREATE it again: same
-- query as 005, plus the scout lines marked "NEW in 006".

ALTER TABLE signups
  ADD COLUMN scout_offers TEXT[]
    CHECK (scout_offers <@ ARRAY['obs_setup', 'multistreaming', 'clipping', 'raids',
                                 'collabs', 'feedback', 'socials', 'intros']),
  ADD COLUMN scout_hours TEXT
    CHECK (scout_hours IN ('under_3', '3_5', '6_10', '10_plus')),
  ADD COLUMN scout_pitch TEXT
    CHECK (char_length(scout_pitch) <= 200),
  ADD COLUMN commitment_accepted_at TIMESTAMPTZ,
  ADD COLUMN scout_approved_at      TIMESTAMPTZ;

DROP VIEW admin_signups;

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
      -- NEW in 006: the scout application
      s.scout_offers, s.scout_hours, s.scout_pitch,
      s.commitment_accepted_at, s.scout_approved_at,
      s.scout_approved_at IS NOT NULL AS scout_approved,
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