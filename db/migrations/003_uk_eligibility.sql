-- db/migrations/003_uk_eligibility.sql
--
-- WHAT THIS DOES
-- Adds two ways of knowing where someone is:
--
--   based_in_uk  What THEY told us (the "I'm based in the UK" tick on the form).
--                This decides prize eligibility, and whether they count as a
--                recruit for whoever brought them in.
--
--   ip_country   What CLOUDFLARE says, from their IP address ('GB', 'US', ...).
--                Evidence only, never the decider: VPNs and holidays exist.
--                The admin dashboard (B6) uses it to flag people whose tick
--                and IP don't match, so we can check them before picking a winner.
--                NULL = we don't know (always the case in local dev, because
--                there's no Cloudflare in front of localhost).
--
-- Rows that already exist get based_in_uk = FALSE and ip_country = NULL.

ALTER TABLE signups
  ADD COLUMN based_in_uk BOOLEAN NOT NULL DEFAULT FALSE,

  -- Cloudflare sends 2-character codes: country codes like 'GB',
  -- plus 'XX' (unknown) and 'T1' (Tor). The CHECK blocks anything else.
  ADD COLUMN ip_country TEXT CHECK (ip_country ~ '^[A-Z0-9]{2}$');