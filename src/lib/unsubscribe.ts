// src/lib/unsubscribe.ts
//
// WHAT THIS IS
// Everything about unsubscribing from our emails:
//   unsubscribeLink()     the personal link to put in an email's footer
//   unsubscribeHeaders()  the hidden headers that give Gmail, Outlook and
//                         Apple Mail their own "Unsubscribe" button
//   readUnsubscribeToken() checks a link's code, and says whose it is
//   unsubscribe()         takes them off our lists
//   getMailingList()      who to send to (for the admin dashboard's downloads)
//
// THE LINK
//   https://streamerdraft.com/unsubscribe?u=1c.Xk3v9...
//                                         ── ─────────
//                                         id  signature
// The id says WHO (in base 36, so it's short). The signature proves WE made
// the link: it's an HMAC of the id, made with a secret only the server knows,
// so nobody can unsubscribe someone else by changing the id. Same idea as the
// admin login ticket (admin-auth.ts).
//
// WHICH SECRET
// IP_HASH_SECRET, mixed with the word "unsubscribe" so it can never be
// confused with an IP fingerprint. That secret must never change once the site
// is live (ip.ts says why), which is exactly what these links need: an
// unsubscribe link in an email from months ago still has to work.
// (Not ADMIN_SESSION_SECRET: you change that one to log everyone out, and it
// would break every link we'd ever sent.)
//
// THE TWO EMAIL LISTS
//   launch  everyone who's confirmed their email: "we're live" and anything
//           about their entry. The privacy policy's "to tell you when
//           StreamerDraft launches" (legitimate interests).
//   news    only those who ticked "Send me news and offers" (their consent).
// Both leave out anyone who's unsubscribed, and anyone who never confirmed
// (a typo'd or borrowed email shouldn't get our mail).

import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";

function getSecret(): string {
  const secret = process.env.IP_HASH_SECRET;
  if (secret) return secret;
  // Same rule as ip.ts: the live site must have a real one
  if (process.env.NODE_ENV === "production") {
    throw new Error("IP_HASH_SECRET is missing. Add it to the server's environment.");
  }
  return "dev-only-not-secret";
}

// 22 characters of base64url = 132 bits: far too many to guess
function sign(id: number): string {
  return createHmac("sha256", getSecret()).update(`unsubscribe.${id}`).digest("base64url").slice(0, 22);
}

export function unsubscribeToken(id: number): string {
  return `${id.toString(36)}.${sign(id)}`;
}

// The id the code belongs to, or null if it's broken or made up
export function readUnsubscribeToken(token: string | null | undefined): number | null {
  const match = /^([0-9a-z]{1,10})\.([A-Za-z0-9_-]{22})$/.exec(token ?? "");
  if (!match) return null;

  const id = parseInt(match[1], 36);
  if (!Number.isSafeInteger(id) || id <= 0) return null;

  // Compared the timing-safe way (admin-auth.ts explains why)
  const expected = Buffer.from(sign(id));
  const given = Buffer.from(match[2]);
  return expected.length === given.length && timingSafeEqual(expected, given) ? id : null;
}

// Where the site lives (localhost now, streamerdraft.com later), without a trailing /
function siteUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

// The link for the email's footer: opens a page with an Unsubscribe button
export function unsubscribeLink(id: number): string {
  return `${siteUrl()}/unsubscribe?u=${unsubscribeToken(id)}`;
}

// Pass these to sendEmail({ ..., headers }) on every launch or news email.
// Email apps read them and show their own Unsubscribe button next to the
// sender's name; pressing it sends a POST straight to our API ("one-click",
// the RFC 8058 standard). Gmail and Yahoo expect it on bulk email.
export function unsubscribeHeaders(id: number): Record<string, string> {
  return {
    "List-Unsubscribe": `<${siteUrl()}/api/unsubscribe?u=${unsubscribeToken(id)}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

// Takes them off both lists. COALESCE keeps the FIRST time if they press it
// twice. Returns false if they're not in the database any more (deleted).
export async function unsubscribe(id: number): Promise<boolean> {
  const result = await db.query(
    `UPDATE signups
     SET marketing_opt_in = false, unsubscribed_at = COALESCE(unsubscribed_at, NOW())
     WHERE id = $1`,
    [id]
  );
  return result.rowCount === 1;
}

// ── The lists, for the admin dashboard ──────────────────────────────
export type MailingListKind = "launch" | "news";

// (broadcast.ts uses these too: the same rules for who an email goes to)
export const LIST_RULES: Record<MailingListKind, string> = {
  launch: "confirmed_at IS NOT NULL AND unsubscribed_at IS NULL",
  news: "confirmed_at IS NOT NULL AND unsubscribed_at IS NULL AND marketing_opt_in",
};

export async function getMailingList(kind: MailingListKind) {
  const rows = await db.query(
    `SELECT id::int AS id, email, display_name AS name, role
     FROM signups WHERE ${LIST_RULES[kind]} ORDER BY id`
  );
  return rows.rows.map((row) => ({
    email: row.email as string,
    name: row.name as string,
    role: row.role === "scout" ? "scout" : "streamer",
    unsubscribe_link: unsubscribeLink(row.id),
  }));
}

// How many are on each list (the dashboard's Overview)
export async function getMailingCounts() {
  const row = (
    await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE ${LIST_RULES.launch})::int AS launch,
        COUNT(*) FILTER (WHERE ${LIST_RULES.news})::int   AS news,
        COUNT(*) FILTER (WHERE unsubscribed_at IS NOT NULL)::int AS unsubscribed
      FROM signups`)
  ).rows[0];
  return { launch: row.launch as number, news: row.news as number, unsubscribed: row.unsubscribed as number };
}
