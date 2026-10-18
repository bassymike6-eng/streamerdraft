-- db/migrations/011_email_sends.sql
--
-- WHAT THIS DOES (F5: sending the launch and news emails from the dashboard)
--
-- Every email you send from the dashboard (src/lib/broadcast.ts) is saved,
-- with who it's going to, so that:
--   - you can see how it's going ("Sent 120 of 175")
--   - if it stops part-way (Resend's daily limit, the server restarting),
--     Resume carries on from where it stopped, and NOBODY gets it twice
--
--   email_sends               one row per email you send
--     list                    launch (everyone confirmed) or news (ticked news and offers)
--     subject, body           what you wrote (body is plain text: {name} = their name)
--     button_label/_url       the optional red button
--     status                  sending, paused (with the problem), done
--
--   email_send_recipients     one row per person it's going to (who was on
--                             the list when you pressed Send)
--     sent_at                 when it went to them
--     skipped_at              they unsubscribed before their turn came
--
-- Deleting someone (a "delete my data" request) deletes their rows here too
-- (ON DELETE CASCADE).

CREATE TABLE email_sends (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  list TEXT NOT NULL CHECK (list IN ('launch', 'news')),
  subject TEXT NOT NULL CHECK (char_length(subject) BETWEEN 1 AND 150),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 10000),
  button_label TEXT CHECK (char_length(button_label) <= 40),
  button_url TEXT CHECK (char_length(button_url) <= 500),
  status TEXT NOT NULL DEFAULT 'sending' CHECK (status IN ('sending', 'paused', 'done')),
  problem TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

CREATE TABLE email_send_recipients (
  send_id BIGINT NOT NULL REFERENCES email_sends(id) ON DELETE CASCADE,
  signup_id BIGINT NOT NULL REFERENCES signups(id) ON DELETE CASCADE,
  sent_at TIMESTAMPTZ,
  skipped_at TIMESTAMPTZ,
  PRIMARY KEY (send_id, signup_id)
);

-- "who's still waiting for this one?" (the part of the list not yet sent)
CREATE INDEX email_send_recipients_waiting_idx
  ON email_send_recipients (send_id, signup_id)
  WHERE sent_at IS NULL AND skipped_at IS NULL;
