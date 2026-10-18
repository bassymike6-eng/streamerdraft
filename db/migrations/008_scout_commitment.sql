-- db/migrations/008_scout_commitment.sql
--
-- WHAT THIS DOES (the scout application, F2)
--
-- The scout commitment is reworked. Before: 6 weeks, 2 feedback calls and
-- 1 raid or collab (but scouts don't have to be streamers, and not everyone
-- wants to collab). Now each scout PICKS how long they'll back each streamer
-- they draft, and agrees to the same two things for every one of them:
--
--   4, 6 or 8 weeks of backing      (scout_weeks: their pick)
--   2 feedback calls                 (fixed: part of the commitment they tick)
--   1 shout-out to their followers   (fixed: share the streamer's stream or a clip)
--
-- NEW COLUMNS (empty for streamers)
--   scout_weeks        4, 6 or 8
--   scout_offer_other  what else they can help with, in their own words, when
--                      they tick "Something else" (up to 120 characters)
--
-- CHANGED
--   platform_urls: up to 5 links now, not 3 (their channels AND socials: a
--   creator's often on Twitch, YouTube, TikTok and Instagram at once).
--   scout_offers can now include 'other' (that "Something else" tick).
--   scout_hours stays (older applications have it), but the form doesn't ask
--   any more: the weeks they pick say more about the time they'll give.
--
-- No "scouts must answer" rule in the database (same reason as 006): the
-- sign-up rules (validation.ts) make the new questions required for every
-- NEW scout.
--
-- THE ADMIN VIEW gets the two new columns: DROP and CREATE it again, the same
-- as 007 plus the lines marked "NEW in 008".

ALTER TABLE signups
  ADD COLUMN scout_weeks SMALLINT CHECK (scout_weeks IN (4, 6, 8)),
  ADD COLUMN scout_offer_other TEXT CHECK (char_length(scout_offer_other) <= 120);

-- Up to 5 links (001's "scout_has_answers" rule said 1 to 3): swap the rule
-- for the same one with the new number
ALTER TABLE signups DROP CONSTRAINT scout_has_answers;
ALTER TABLE signups ADD CONSTRAINT scout_has_answers CHECK (
  role <> 'scout' OR (
    platform_urls IS NOT NULL AND cardinality(platform_urls) BETWEEN 1 AND 5
    AND audience_size IS NOT NULL
    AND content_types IS NOT NULL AND cardinality(content_types) >= 1
  )
);

-- The list of allowed offers, now with 'other'. (A column's own CHECK is named
-- <table>_<column>_check by Postgres, so that's the one to swap.)
ALTER TABLE signups DROP CONSTRAINT signups_scout_offers_check;
ALTER TABLE signups ADD CONSTRAINT signups_scout_offers_check
  CHECK (scout_offers <@ ARRAY['obs_setup', 'multistreaming', 'clipping', 'raids',
                               'collabs', 'feedback', 'socials', 'intros', 'other']);

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
      COUNT(*) FILTER (WHERE uk_eligible AND confirmed_at IS NOT NULL) AS counted,
      COUNT(*) FILTER (WHERE uk_eligible AND confirmed_at IS NULL)     AS pending,
      COUNT(*) FILTER (WHERE NOT uk_eligible)                          AS outside_uk,
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
      -- NEW in 007: where they confirmed from, and the UK decision itself
      s.confirm_ip_country, s.uk_eligible,
      s.referral_code, s.number, s.feedback,
      s.created_at, s.confirmed_at, s.rules_accepted_at,
      s.disqualified_at, s.disqualified_reason, s.admin_note,
      -- NEW in 006: the scout application
      s.scout_offers, s.scout_hours, s.scout_pitch,
      -- NEW in 008: how many weeks they'll back each streamer, and their "something else"
      s.scout_weeks, s.scout_offer_other,
      s.commitment_accepted_at, s.scout_approved_at,
      s.scout_approved_at IS NOT NULL AS scout_approved,
      s.confirmed_at IS NOT NULL    AS confirmed,
      s.disqualified_at IS NOT NULL AS disqualified,

      -- Can this person win? (a confirmed, UK-based, not-disqualified prospect)
      (s.role = 'prospect' AND s.confirmed_at IS NOT NULL
         AND s.uk_eligible AND s.disqualified_at IS NULL) AS eligible,

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
      -- ticked "based in the UK", but no IP of theirs was in the UK
      (s.based_in_uk AND NOT s.uk_eligible)                               AS flag_uk_mismatch,
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
