// src/lib/email.ts
//
// WHAT THIS IS
// The ONE place the app sends email from. Every email goes through here, so
// if we ever switch email provider, only this file changes.
//   sendEmail()       one email (confirm your email, a scout being turned down, a test)
//   sendEmailBatch()  up to 100 at once (the launch and news emails, broadcast.ts)
//
// TWO MODES
// - Dev mode (no RESEND_API_KEY in .env.local): the email is printed in
//   your terminal instead of being sent. Lets us build without a domain.
// - Real mode (RESEND_API_KEY set): sends through Resend's API.
//
// REPLIES go to CONTACT_EMAIL (src/lib/site.ts) once you've filled it in, so
// when someone hits Reply, it lands in an inbox you actually read.
//
// RESEND'S LIMITS (October 2026): the free plan sends 100 emails a day and
// 3,000 a month, confirm emails included. The API takes 10 requests a second,
// and a batch of 100 counts as one. Over a limit, Resend says no (429) and
// sendEmailBatch throws with its reason, so the launch email pauses (and you
// press Resume later) rather than losing anyone.

import "server-only";
import { CONTACT_EMAIL } from "@/lib/site";

export type Email = {
  to: string;
  subject: string;
  html: string; // the designed version email apps show
  text: string; // plain-text version for apps that don't show designs
  // Extra hidden headers. Launch and news emails MUST pass
  // unsubscribeHeaders(id) from src/lib/unsubscribe.ts here (and put
  // unsubscribeLink(id) in the footer). The confirm email doesn't need them.
  headers?: Record<string, string>;
};

const FROM = () => process.env.EMAIL_FROM ?? "StreamerDraft <onboarding@resend.dev>";

// One email, the way Resend wants it
const forResend = (email: Email) => ({
  from: FROM(),
  to: [email.to],
  subject: email.subject,
  html: email.html,
  text: email.text,
  ...(CONTACT_EMAIL ? { reply_to: CONTACT_EMAIL } : {}),
  ...(email.headers ? { headers: email.headers } : {}),
});

// Dev mode, or a missing key on the live site (which is a real problem: fail loudly)
function devMode(): boolean {
  if (process.env.RESEND_API_KEY) return false;
  if (process.env.NODE_ENV === "production") {
    throw new Error("RESEND_API_KEY is missing, so emails can't be sent.");
  }
  return true;
}

function print(email: Email) {
  console.log("\n──── EMAIL (dev mode: printed, not sent) ────");
  console.log(`To:      ${email.to}`);
  console.log(`Subject: ${email.subject}`);
  for (const [name, value] of Object.entries(email.headers ?? {})) console.log(`${name}: ${value}`);
  console.log("");
  console.log(email.text);
  console.log("─────────────────────────────────────────────\n");
}

async function resend(path: string, body: unknown, idempotencyKey?: string): Promise<void> {
  // fetch() sends an HTTP request, same idea as our .http test files.
  const response = await fetch(`https://api.resend.com${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`, // proves it's us
      "Content-Type": "application/json",
      // The same key twice (within 24 hours) = Resend sends it once. So if
      // we ever ask twice for the same batch, nobody gets it twice.
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
  });
  // response.ok is true for 2xx status codes (success)
  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Email failed to send (${response.status}): ${details}`);
  }
}

export async function sendEmail(email: Email): Promise<void> {
  if (devMode()) return print(email);
  await resend("/emails", forResend(email));
}

// Up to 100 emails in one go (Resend's batch API). All or nothing: if Resend
// says no, none of them went, and it throws.
export async function sendEmailBatch(emails: Email[], idempotencyKey: string): Promise<void> {
  if (emails.length === 0) return;
  if (emails.length > 100) throw new Error("A batch is at most 100 emails.");
  if (devMode()) {
    // the first one in full, then just who the rest went to
    print(emails[0]);
    if (emails.length > 1) console.log(`...and the same to ${emails.length - 1} more: ${emails.slice(1).map((e) => e.to).join(", ")}\n`);
    return;
  }
  await resend("/emails/batch", emails.map(forResend), idempotencyKey);
}
