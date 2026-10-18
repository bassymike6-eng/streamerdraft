// src/lib/broadcast.ts
//
// WHAT THIS IS
// Sending the launch email (or a news email) to everyone on a list, from the
// dashboard's "Write an email" (src/components/admin/EmailComposer.tsx).
//
//   createBroadcast()   saves the email, and WHO it's going to: everyone on
//                       the list right now (migration 011)
//   runBroadcast()      sends it, 100 at a time, in the background, so the
//                       dashboard isn't left waiting (it checks in for progress)
//   resumeBroadcast()   carries on after a pause
//   sendTestEmail()     one copy to you first, to check it looks right
//   listBroadcasts()    what you've sent, and how far each one's got
//
// EVERY EMAIL GETS (broadcast-email.ts + unsubscribe.ts)
//   - "Hey {name}" filled in with THEIR name
//   - their own Unsubscribe link in the footer
//   - the hidden List-Unsubscribe headers, so Gmail and Outlook show their own
//     Unsubscribe button next to our name
//
// NOBODY GETS IT TWICE, NOBODY WHO'S UNSUBSCRIBED GETS IT
//   - each person is marked sent the moment their batch goes
//   - before each batch, anyone who's unsubscribed since you pressed Send (or
//     left the list) is skipped
//   - each batch carries an "idempotency key" made from who's in it: if we
//     ever ask Resend for the same batch twice (a crash at the wrong moment),
//     Resend sends it once
//
// IF IT STOPS (Resend's daily limit on the free plan, a wrong API key, the
// server restarting): the send is "paused" with the reason, and Resume on the
// dashboard picks up exactly where it stopped.

import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { sendEmail, sendEmailBatch } from "@/lib/email";
import { LIST_RULES, unsubscribeHeaders, unsubscribeLink } from "@/lib/unsubscribe";
import { broadcastEmail, type Draft } from "./broadcast-email";

// What the dashboard sends: checked here, and by the database (migration 011)
export const draftSchema = z
  .object({
    list: z.enum(["launch", "news"]),
    subject: z.string().trim().min(1, "Write a subject.").max(150, "Keep the subject under 150 characters."),
    body: z.string().trim().min(1, "Write the message.").max(10000, "That's too long for one email."),
    buttonLabel: z.string().trim().max(40, "Keep the button's words short.").optional().or(z.literal("")),
    buttonUrl: z.string().trim().max(500).optional().or(z.literal("")),
  })
  .refine((d) => !d.buttonLabel || /^https?:\/\/\S+$/.test(d.buttonUrl ?? ""), {
    error: "The button needs a link starting https://",
    path: ["buttonUrl"],
  });

const appUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const BATCH = 100; // Resend's most per batch
const PAUSE_MS = 600; // between batches: well under Resend's 10 requests a second

// Which sends are going right now, in THIS server process. Kept on globalThis
// (like the database pool) so it survives Next.js reloading files in dev.
const memory = globalThis as unknown as { broadcastsRunning?: Set<number> };
const running = (memory.broadcastsRunning ??= new Set<number>());

// ── Saving it, with who it goes to ──────────────────────────────────
export async function createBroadcast(draft: Draft): Promise<{ id: number; total: number } | "duplicate"> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    // The same email to the same list in the last 2 minutes? A double press: don't send twice
    const recent = await client.query(
      `SELECT 1 FROM email_sends
       WHERE list = $1 AND subject = $2 AND body = $3 AND created_at > NOW() - INTERVAL '2 minutes'`,
      [draft.list, draft.subject, draft.body]
    );
    if (recent.rows.length > 0) {
      await client.query("ROLLBACK");
      return "duplicate";
    }
    const created = await client.query(
      `INSERT INTO email_sends (list, subject, body, button_label, button_url)
       VALUES ($1, $2, $3, $4, $5) RETURNING id::int AS id`,
      [draft.list, draft.subject, draft.body, draft.buttonLabel || null, draft.buttonUrl || null]
    );
    const id = created.rows[0].id as number;
    // Everyone on the list right now (LIST_RULES is a fixed string, never anything typed)
    const added = await client.query(
      `INSERT INTO email_send_recipients (send_id, signup_id)
       SELECT $1, id FROM signups WHERE ${LIST_RULES[draft.list]}`,
      [id]
    );
    await client.query("COMMIT");
    return { id, total: added.rowCount ?? 0 };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

// ── Sending it ──────────────────────────────────────────────────────
// Starts it in the background and returns straight away.
export function runBroadcast(id: number): void {
  if (running.has(id)) return; // already going
  running.add(id);
  void sendAll(id)
    .catch(async (error) => {
      console.error(`[broadcast ${id}] paused:`, error);
      await db
        .query("UPDATE email_sends SET status = 'paused', problem = $2 WHERE id = $1", [id, explain(error)])
        .catch(() => {});
    })
    .finally(() => running.delete(id));
}

async function sendAll(id: number) {
  const found = await db.query(
    `UPDATE email_sends SET status = 'sending', problem = NULL WHERE id = $1
     RETURNING list, subject, body, button_label AS "buttonLabel", button_url AS "buttonUrl"`,
    [id]
  );
  const draft = found.rows[0] as Draft | undefined;
  if (!draft) return;

  for (;;) {
    // Anyone who's unsubscribed (or otherwise left the list) since: skip them
    await db.query(
      `UPDATE email_send_recipients r SET skipped_at = NOW()
       FROM signups s
       WHERE r.send_id = $1 AND r.signup_id = s.id
         AND r.sent_at IS NULL AND r.skipped_at IS NULL
         AND NOT (${LIST_RULES[draft.list]})`,
      [id]
    );
    // The next 100 still waiting
    const next = await db.query(
      `SELECT s.id::int AS id, s.email, s.display_name AS name
       FROM email_send_recipients r JOIN signups s ON s.id = r.signup_id
       WHERE r.send_id = $1 AND r.sent_at IS NULL AND r.skipped_at IS NULL
       ORDER BY s.id LIMIT ${BATCH}`,
      [id]
    );
    const people = next.rows as { id: number; email: string; name: string }[];
    if (people.length === 0) break;

    const emails = people.map((person) => ({
      to: person.email,
      ...broadcastEmail(draft, person.name, unsubscribeLink(person.id), appUrl()),
      headers: unsubscribeHeaders(person.id),
    }));
    // the same people in the same send = the same key (Resend sends it once)
    await sendEmailBatch(emails, `sd-send-${id}-${people[0].id}-${people[people.length - 1].id}-${people.length}`);
    await db.query(
      "UPDATE email_send_recipients SET sent_at = NOW() WHERE send_id = $1 AND signup_id = ANY($2::bigint[])",
      [id, people.map((person) => person.id)]
    );
    await new Promise((done) => setTimeout(done, PAUSE_MS));
  }

  await db.query("UPDATE email_sends SET status = 'done', finished_at = NOW() WHERE id = $1", [id]);
}

// Resend's answer, in words you can act on
function explain(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  if (/quota/i.test(text)) {
    return "Resend's sending limit is used up (the free plan sends 100 a day, confirm emails included). Press Resume tomorrow, or upgrade your Resend plan and press Resume now.";
  }
  if (/\(429\)/.test(text)) return "Resend asked us to slow down. Press Resume in a minute.";
  if (/RESEND_API_KEY/.test(text)) return "RESEND_API_KEY isn't set on the server, so nothing can be sent.";
  if (/\(40[13]\)/.test(text)) return "Resend didn't accept our API key, or the sending domain isn't verified yet. Check Resend, then press Resume.";
  return `It stopped: ${text.slice(0, 300)}`;
}

export async function resumeBroadcast(id: number): Promise<boolean> {
  const found = await db.query("SELECT status FROM email_sends WHERE id = $1", [id]);
  if (found.rows.length === 0) return false;
  if (found.rows[0].status !== "done") runBroadcast(id);
  return true;
}

// ── One copy to you first ───────────────────────────────────────────
export async function sendTestEmail(draft: Draft, to: string): Promise<void> {
  const email = broadcastEmail(draft, "there", `${appUrl()}/unsubscribe?u=test`, appUrl());
  await sendEmail({ to, ...email, subject: `[Test] ${email.subject}` });
}

// ── What you've sent ────────────────────────────────────────────────
export async function listBroadcasts() {
  const rows = await db.query(`
    SELECT e.id::int AS id, e.list, e.subject, e.status, e.problem,
           e.created_at AS "createdAt", e.finished_at AS "finishedAt",
           COUNT(r.signup_id)::int  AS total,
           COUNT(r.sent_at)::int    AS sent,
           COUNT(r.skipped_at)::int AS skipped
    FROM email_sends e
    LEFT JOIN email_send_recipients r ON r.send_id = e.id
    GROUP BY e.id
    ORDER BY e.created_at DESC
    LIMIT 20`);
  return rows.rows.map((row) => {
    // "sending" but nothing's running it: the server restarted part-way
    const stalled = row.status === "sending" && !running.has(row.id);
    return {
      ...row,
      status: stalled ? "paused" : row.status,
      problem: stalled ? "It stopped part-way (the server restarted?). Press Resume to carry on." : row.problem,
    } as {
      id: number; list: Draft["list"]; subject: string; status: "sending" | "paused" | "done"; problem: string | null;
      createdAt: string; finishedAt: string | null; total: number; sent: number; skipped: number;
    };
  });
}
