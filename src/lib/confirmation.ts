// src/lib/confirmation.ts
//
// WHAT THIS IS
// Everything about the "confirm your email" email:
// 1. Makes a fresh secret link for a sign-up
// 2. Saves the scrambled (hashed) version + an expiry time
// 3. Writes the email and sends it
//
// Used in two places: right after someone signs up, and when someone
// signs up again before confirming (we send them a fresh link).

import "server-only";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { hashToken, makeToken } from "@/lib/tokens";

// How long a confirmation link works for.
const LINK_LIFETIME_HOURS = 48;

// The bits of a sign-up we need to write the email.
type SignupForEmail = {
  id: string;
  email: string;
  displayName: string;
  role: "prospect" | "scout"; // "|" means "one or the other"
  referralCode: string;
};

export async function issueConfirmation(signup: SignupForEmail): Promise<void> {
  // 1. A new secret token. Any older link for this person stops working,
  //    because we overwrite the hash it would need to match.
  const token = makeToken();

  // 2. Save the hash + expiry. make_interval builds "48 hours" from a
  //    number, using our $2 placeholder.
  await db.query(
    `UPDATE signups
     SET confirm_token_hash = $1,
         confirm_expires_at = NOW() + make_interval(hours => $2)
     WHERE id = $3`,
    [hashToken(token), LINK_LIFETIME_HOURS, signup.id]
  );

  // 3. Build the links and send the email.
  // APP_URL = where the site lives: localhost now, streamerdraft.com later.
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const confirmLink = `${appUrl}/confirm?token=${token}`; // the page with the rules tick (built in F2)
  const recruitLink = `${appUrl}/r/${signup.referralCode}`;

  await sendEmail(buildConfirmEmail(signup, confirmLink, recruitLink));
}

// ── The email itself ─────────────────────────────────────────────

function buildConfirmEmail(signup: SignupForEmail, confirmLink: string, recruitLink: string) {
  const isProspect = signup.role === "prospect";

  // What confirming gets them (different for prospects and scouts)
  const why = isProspect
    ? "One more step to enter the GTA 6 comp and claim your number: tap the link below, read the rules, and hit Enter."
    : "One more step to claim your scout number: tap the link below and hit Confirm.";
  const button = isProspect ? "Enter the comp" : "Confirm my email";

  const text = [
    `Hey ${signup.displayName},`,
    "",
    "You're on the StreamerDraft list. Your recruit link already works:",
    recruitLink,
    "",
    why,
    "",
    confirmLink,
    "",
    `This link works for ${LINK_LIFETIME_HOURS} hours. Didn't sign up? Ignore this and nothing happens.`,
    "",
    "StreamerDraft",
  ].join("\n"); // join the lines with line breaks

  // People choose their own names, so we "escape" it before putting it in
  // HTML. Otherwise a name like <b>hi</b> would turn into real formatting.
  const name = escapeHtml(signup.displayName);

  const html = `
    <div style="background:#000;padding:40px 20px;font-family:Arial,sans-serif;color:#F5F5F7">
      <div style="max-width:480px;margin:0 auto">
        <p style="font-size:22px;font-weight:bold;margin:0 0 24px">StreamerDraft</p>
        <p style="font-size:16px;margin:0 0 12px">Hey ${name},</p>
        <p style="font-size:16px;line-height:1.5;margin:0 0 8px">You're on the list. Your recruit link already works:</p>
        <p style="font-size:16px;margin:0 0 24px"><a href="${recruitLink}" style="color:#F5F5F7">${recruitLink}</a></p>
        <p style="font-size:16px;line-height:1.5;margin:0 0 28px">${why}</p>
        <a href="${confirmLink}" style="display:inline-block;background:#F5F5F7;color:#000;text-decoration:none;font-weight:bold;padding:14px 28px;border-radius:999px">${button}</a>
        <p style="font-size:13px;line-height:1.5;color:#A1A1A6;margin:28px 0 0">This link works for ${LINK_LIFETIME_HOURS} hours. Didn't sign up? Ignore this and nothing happens.</p>
      </div>
    </div>`;

  return { to: signup.email, subject: "Confirm your StreamerDraft entry", html, text };
}

// Turns characters that mean something in HTML into harmless versions.
function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}