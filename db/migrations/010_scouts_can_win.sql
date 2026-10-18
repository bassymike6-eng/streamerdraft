-- db/migrations/010_scouts_can_win.sql
--
-- WHAT THIS DOES (F5: scouts are in from the start, and can win)
--
-- 1. SCOUTS CAN WIN THE COMPETITION, the same as streamers: confirmed their
--    email, accepted the rules, in the UK, not disqualified. (Before, only
--    streamers could.) From now on scouts accept the rules when they confirm,
--    like streamers do (src/app/api/confirm/route.ts).
--    Anyone who confirmed BEFORE accepting the rules (early test sign-ups)
--    isn't in the running until they have: that's what the rules say an
--    entry is.
--
-- 2. NO MORE "APPLICATIONS". Signing up as a scout makes you a scout. On the
--    dashboard you can:
--      mark one as checked ("Looks good")   scout_checked_at
--                                           (was scout_approved_at: renamed,
--                                            anyone you'd approved stays checked)
--      turn one down                        scout_turned_down_at + _reason
--                                           (they're emailed, src/lib/scout-email.ts;
--                                            they stay in the competition)
--
-- THE ADMIN VIEW gets the new columns and the new "eligible": DROP and CREATE
-- it again, the same as 008 plus the lines marked "CHANGED in 010".

-- The view uses the column we're renaming, so it goes first
DROP VIEW admin_signups;

ALTER TABLE signups RENAME COLUMN scout_approved_at TO scout_checked_at;
ALTER TABLE signups
  ADD COLUMN scout_turned_down_at TIMESTAMPTZ,
  ADD COLUMN scout_turned_down_reason TEXT CHECK (char_length(scout_turned_down_reason) <= 200);


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
      s.commitment_accepted_at,
      -- CHANGED in 010: "approved" is now "checked" (scouts are in from the
      -- start; this just marks the ones you've looked at), and turned down
      s.scout_checked_at, s.scout_checked_at IS NOT NULL AS scout_checked,
      s.scout_turned_down_at, s.scout_turned_down_reason,
      s.scout_turned_down_at IS NOT NULL AS scout_turned_down,
      s.confirmed_at IS NOT NULL    AS confirmed,
      s.disqualified_at IS NOT NULL AS disqualified,

      -- Can this person win? CHANGED in 010: streamers AND scouts. Confirmed,
      -- accepted the rules, in the UK, not disqualified. (Being turned down
      -- as a scout doesn't change it: that's about scouting, not the competition.)
      (s.confirmed_at IS NOT NULL AND s.rules_accepted_at IS NOT NULL
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
