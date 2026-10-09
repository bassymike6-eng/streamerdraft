-- db/migrations/004_email_normalisation.sql
--
-- WHAT THIS DOES
-- Stops one person signing up lots of times with "different" emails that
-- all land in the same inbox. That's the easiest way to farm fake recruits:
--
--   bassymike@gmail.com          ┐
--   bassy.mike@gmail.com         │  all the SAME Gmail inbox
--   bassymike+recruit1@gmail.com │
--   BassyMike@googlemail.com     ┘
--
-- HOW
-- 1. A database function, normalize_email(), turns every version into one
--    standard form: "bassymike@gmail.com".
-- 2. We swap the old "no duplicate emails" rule (which only ignored capitals)
--    for one that compares the NORMALISED version instead.
--
-- Doing it in the database (not in TypeScript) means there's one copy of the
-- rule, and it's enforced even if a bug in our code lets something through.
--
-- THE RULES
-- - Capitals and spaces never matter (same as before).
-- - "+anything" is dropped for EVERY provider: Gmail, Outlook, iCloud and
--   most others deliver name+anything@ to name@. (A tiny number of providers
--   don't, but for a waitlist, blocking farming matters more.)
-- - Dots are dropped for Gmail ONLY. Gmail ignores them; most others don't
--   (john.smith@outlook.com and johnsmith@outlook.com are different people).
-- - googlemail.com is the same as gmail.com.
--
-- If this migration fails with "could not create unique index", two existing
-- rows already normalise to the same email. Nothing changes (the migration
-- rolls back); delete one of them and run it again.

CREATE FUNCTION normalize_email(email TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE -- same input always gives the same output (required to use it in an index)
STRICT    -- NULL in gives NULL out, without running the function
AS $$
DECLARE
  -- Split "name@domain" into its two halves, all lowercase.
  local_part TEXT := split_part(lower(trim(email)), '@', 1);
  domain     TEXT := split_part(lower(trim(email)), '@', 2);
BEGIN
  -- googlemail.com is the same inbox as gmail.com
  IF domain = 'googlemail.com' THEN
    domain := 'gmail.com';
  END IF;

  -- Drop "+anything": "bassymike+abc" becomes "bassymike".
  -- (Unless that would leave nothing, e.g. "+abc@...". Then keep it as is.)
  IF split_part(local_part, '+', 1) <> '' THEN
    local_part := split_part(local_part, '+', 1);
  END IF;

  -- Gmail ignores dots: "bassy.mike" becomes "bassymike".
  IF domain = 'gmail.com' THEN
    local_part := replace(local_part, '.', '');
  END IF;

  RETURN local_part || '@' || domain;
END;
$$;

-- Swap the duplicate-email rule. We keep the SAME index name, so the sign-up
-- route still recognises the "already signed up" error without changes.
DROP INDEX signups_email_unique;
CREATE UNIQUE INDEX signups_email_unique ON signups (normalize_email(email));