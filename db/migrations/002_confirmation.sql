-- db/migrations/002_confirmation.sql
--
-- WHAT THIS IS
-- Database changes for B3 (email confirmation):
--   1. Two counters that hand out each person's private #number when
--      they confirm: one for prospects, one for scouts.
--   2. A new column recording WHEN someone ticked "I've read the rules".
--
-- WHY A "SEQUENCE" INSTEAD OF "COUNT EVERYONE, THEN + 1"?
-- If two people confirm at the exact same moment, counting could give
-- them BOTH #128. A sequence is a counter built into PostgreSQL that
-- never hands out the same number twice, even at the same instant.

CREATE SEQUENCE prospect_number_seq;
CREATE SEQUENCE scout_number_seq;

-- ALTER TABLE = change a table that already exists.
-- Empty (NULL) until they tick the rules box when entering the comp.
ALTER TABLE signups ADD COLUMN rules_accepted_at TIMESTAMPTZ;