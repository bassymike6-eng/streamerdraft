-- db/migrations/007_streamer_signup.sql
--
-- WHAT THIS DOES (for the streamer sign-up form, F2)
--
-- 1. Streamers no longer have to give a platform and channel link to sign up.
--    The form just asks for an email and a name now, so as many people as
--    possible register their interest (we ask for channels later, at launch).
--    Scouts still have to fill in their application.
--
-- 2. confirm_ip_country: Cloudflare's country for the IP they CONFIRMED from
--    (like ip_country, which is the one they signed up from).
--
-- 3. uk_eligible: THE rule for "counts as being in the UK", worked out by the
--    database itself from the other columns, so it's always up to date:
--
--      they ticked "I'm based in the UK"
--      AND at least one of their IPs (sign-up or confirm) was in the UK ('GB')
--
--    If we don't know either IP's country (local dev has no Cloudflare, or
--    Cloudflare said 'XX' = unknown), the tick decides on its own.
--    Only uk_eligible people can win, and a referral only counts when BOTH
--    the person who shared the link and the person who used it are uk_eligible.
--
-- 4. status_key_hash: a private key per sign-up. Their browser keeps the key
--    (only the scrambled hash is stored here, like the confirm link), so the
--    page can ask "have they confirmed yet?" without using their public
--    referral code.
--
-- 5. The admin view now uses uk_eligible too.

-- 1.
ALTER TABLE signups DROP CONSTRAINT prospect_has_answers;

-- 2.
ALTER TABLE signups
  ADD COLUMN confirm_ip_country TEXT CHECK (confirm_ip_country ~ '^[A-Z0-9]{2}$');

-- 3. GENERATED ... STORED = the database works it out on every insert/update.
-- COALESCE(x, 'XX') treats "no country" as 'XX' (unknown), so every case comes
-- out a clear yes or no (in SQL, comparing an empty value gives "unknown", not "no").
ALTER TABLE signups
  ADD COLUMN uk_eligible BOOLEAN NOT NULL GENERATED ALWAYS AS (
    based_in_uk AND (
      COALESCE(ip_country, 'XX') = 'GB'
      OR COALESCE(confirm_ip_country, 'XX') = 'GB'
      OR (COALESCE(ip_country, 'XX') = 'XX' AND COALESCE(confirm_ip_country, 'XX') = 'XX')
    )
  ) STORED;

-- 4.
ALTER TABLE signups ADD COLUMN status_key_hash TEXT;
CREATE UNIQUE INDEX signups_status_key_unique ON signups (status_key_hash);

-- 5. (the same view as 006, using uk_eligible)
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
