// src/lib/confirmation.ts
//
// WHAT THIS IS
// Everything about the "confirm your email" email:
// 1. Makes a fresh secret link for a sign-up
// 2. Saves the scrambled (hashed) version + an expiry time
// 3. Writes the email and sends it
//
// Used right after someone signs up, when someone signs up again before
// confirming, and when they tap "Resend" (each time: a fresh link).
//
// sendConfirmation() is the one the routes use: it never crashes the request.
// If the email can't be sent, it says so (false), and the sign-up still stands,
// so the form can tell them and offer to resend.

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
};

// Sends it, and says whether it worked (true) or not (false), instead of throwing
export async function sendConfirmation(signup: SignupForEmail): Promise<boolean> {
  try {
    await issueConfirmation(signup);
    return true;
  } catch (error) {
    console.error("[confirmation] the email didn't send:", error);
    return false;
  }
}

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
  const confirmLink = `${appUrl}/confirm?token=${token}`; // the page with the rules tick (src/app/confirm)

  await sendEmail(buildConfirmEmail(signup, confirmLink, appUrl));
}

// ── The email itself ─────────────────────────────────────────────

function buildConfirmEmail(signup: SignupForEmail, confirmLink: string, appUrl: string) {
  const isProspect = signup.role === "prospect";

  // What the button does, and why they should tap it. The same for scouts
  // and streamers: both accept the rules and can win (F5).
  const why = "One more step: tap the button, read the competition rules and confirm. That locks your entry in and gets you your referral link.";
  const button = "Confirm my entry";

  // Plain-text version (each item is one line)
  const text = [
    `Hey ${signup.displayName},`,
    "",
    isProspect
      ? "You've registered your interest in StreamerDraft. Your entry is pending until you confirm your email."
      : "You've signed up to scout on StreamerDraft. Your sign-up is pending until you confirm your email.",
    "",
    why,
    "",
    confirmLink,
    "",
    "We'll email you again when StreamerDraft launches.",
    "",
    `This link works for ${LINK_LIFETIME_HOURS} hours. Didn't sign up? Ignore this and nothing happens.`,
    "",
    "StreamerDraft",
    `Competition rules: ${appUrl}/rules`,
    `Privacy: ${appUrl}/privacy`,
  ].join("\n"); // join the lines with line breaks

  // Designed version. escapeHtml stops a name like "<b>hi</b>" being
  // treated as code inside the email.
  const name = escapeHtml(signup.displayName);

  const html = `
    <div style="background:#000;padding:40px 20px;font-family:Arial,sans-serif;color:#F5F5F7">
      <div style="max-width:480px;margin:0 auto">
        <p style="font-size:22px;font-weight:bold;margin:0 0 24px;color:#E50914">StreamerDraft</p>
        <p style="font-size:16px;margin:0 0 12px">Hey ${name},</p>
        <p style="font-size:16px;line-height:1.5;margin:0 0 12px">${
          isProspect
            ? "You've registered your interest in StreamerDraft. Your entry is <b>pending</b> until you confirm your email."
            : "You've signed up to scout on StreamerDraft. Your sign-up is <b>pending</b> until you confirm your email."
        }</p>
        <p style="font-size:16px;line-height:1.5;margin:0 0 28px">${why}</p>
        <a href="${confirmLink}" style="display:inline-block;background:#E50914;color:#fff;text-decoration:none;font-weight:bold;padding:14px 28px;border-radius:999px">${button}</a>
        <p style="font-size:15px;line-height:1.5;margin:28px 0 0">We'll email you again when StreamerDraft launches.</p>
        <p style="font-size:13px;line-height:1.5;color:#A1A1A6;margin:16px 0 0">This link works for ${LINK_LIFETIME_HOURS} hours. Didn't sign up? Ignore this and nothing happens.</p>
        <p style="font-size:13px;line-height:1.5;color:#A1A1A6;margin:12px 0 0"><a href="${appUrl}/rules" style="color:#A1A1A6">Competition rules</a> &nbsp; <a href="${appUrl}/privacy" style="color:#A1A1A6">Privacy</a></p>
      </div>
    </div>`;

  return { to: signup.email, subject: "Confirm your StreamerDraft entry", html, text };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
