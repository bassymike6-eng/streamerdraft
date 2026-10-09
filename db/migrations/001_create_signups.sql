-- db/migrations/001_create_signups.sql
--
-- WHAT THIS IS
-- Creates the "signups" table: one row per person on the waitlist,
-- prospects AND scouts together.
--
-- WHAT A MIGRATION IS
-- A numbered SQL file that changes the database. They run in order
-- (001, 002, 003...) and each one runs only once.
-- RULE: never edit a migration after it has run. To change the table
-- later, write a NEW file (002_...sql) that makes the change.

CREATE TABLE signups (

  -- ── Who they are ─────────────────────────────────────────────
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                -- Auto-numbered row ID (1, 2, 3...). Internal only.
  role          TEXT NOT NULL CHECK (role IN ('prospect', 'scout')),
  email         TEXT NOT NULL,
  display_name  TEXT NOT NULL,
                -- Prospects: streamer name (shown on the leaderboard).
                -- Scouts: creator name as on their socials (NEVER public).

  -- ── Prospect answers (empty for scouts) ──────────────────────
  platform        TEXT CHECK (platform IN ('twitch', 'tiktok', 'youtube', 'kick', 'other')),
  channel_url     TEXT,
  stream_category TEXT,           -- optional, e.g. "GTA RP, Just Chatting"

  -- ── Scout answers (empty for prospects) ──────────────────────
  platform_urls   TEXT[],         -- [] means a LIST: 1 to 3 links
  audience_size   TEXT CHECK (audience_size IN ('under_10k', '10k_50k', '50k_100k', '100k_plus')),
  content_types   TEXT[] CHECK (content_types <@ ARRAY['streaming', 'short_form', 'videos', 'podcasts', 'other']),
                  -- <@ means "every item must come from this list"

  -- ── Consent ──────────────────────────────────────────────────
  age_confirmed     BOOLEAN NOT NULL CHECK (age_confirmed = TRUE),  -- must tick 18+
  marketing_opt_in  BOOLEAN NOT NULL DEFAULT FALSE,                 -- "email me updates"

  -- ── Referrals ────────────────────────────────────────────────
  referral_code   TEXT NOT NULL,  -- random code in their link, e.g. k7x2qp
  referred_by_id  BIGINT REFERENCES signups(id) ON DELETE SET NULL,
                  -- The id of whoever recruited them (empty if nobody).
                  -- REFERENCES = must point at a real row in this table.

  -- ── Email confirmation ───────────────────────────────────────
  confirm_token_hash  TEXT,         -- scrambled copy of the secret in their email link
  confirm_expires_at  TIMESTAMPTZ,  -- when that link stops working
  confirmed_at        TIMESTAMPTZ,  -- empty until they click it; only confirmed people count
  number              INTEGER,      -- their #128, given when they confirm

  -- ── Extras ───────────────────────────────────────────────────
  feedback    TEXT,                 -- answer to the "You're in" screen question
  ip_hash     TEXT,                 -- scrambled IP, only for spotting fake sign-ups
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- also breaks leaderboard ties

  -- ── Rules: each role must have its own answers filled in ─────
  CONSTRAINT prospect_has_answers CHECK (
    role <> 'prospect' OR (platform IS NOT NULL AND channel_url IS NOT NULL)
  ),
  CONSTRAINT scout_has_answers CHECK (
    role <> 'scout' OR (
      platform_urls IS NOT NULL AND cardinality(platform_urls) BETWEEN 1 AND 3
      AND audience_size IS NOT NULL
      AND content_types IS NOT NULL AND cardinality(content_types) >= 1
    )
  )
);

-- ── Indexes: fast lookups + uniqueness rules ───────────────────

-- One email = one person = one role. lower() makes "Mike@X.com"
-- and "mike@x.com" count as the SAME email.
CREATE UNIQUE INDEX signups_email_unique ON signups (lower(email));

-- No two people can share a referral code.
CREATE UNIQUE INDEX signups_referral_code_unique ON signups (referral_code);

-- Numbers are per role: prospect #12 and scout #12 can both exist,
-- but there can't be two prospect #12s.
CREATE UNIQUE INDEX signups_role_number_unique ON signups (role, number);

-- Makes "how many people did X recruit?" fast (for the leaderboard).
CREATE INDEX signups_referred_by_idx ON signups (referred_by_id);