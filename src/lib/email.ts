// src/lib/email.ts
//
// WHAT THIS IS
// The ONE place the app sends email from. Every email goes through
// sendEmail(), so if we ever switch email provider, only this file changes.
//
// TWO MODES
// - Dev mode (no RESEND_API_KEY in .env.local): the email is printed in
//   your terminal instead of being sent. Lets us build without a domain.
// - Real mode (RESEND_API_KEY set): sends through Resend's API.

import "server-only";

export type Email = {
  to: string;
  subject: string;
  html: string; // the designed version email apps show
  text: string; // plain-text version for apps that don't show designs
};

export async function sendEmail(email: Email): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;

  // ── Dev mode: print it instead of sending ───────────────────────
  if (!apiKey) {
    // On the live site, a missing key is a real problem: fail loudly.
    if (process.env.NODE_ENV === "production") {
      throw new Error("RESEND_API_KEY is missing, so emails can't be sent.");
    }
    console.log("\n──── EMAIL (dev mode: printed, not sent) ────");
    console.log(`To:      ${email.to}`);
    console.log(`Subject: ${email.subject}`);
    console.log("");
    console.log(email.text);
    console.log("─────────────────────────────────────────────\n");
    return;
  }

  // ── Real mode: ask Resend to send it ────────────────────────────
  // fetch() sends an HTTP request, same idea as our .http test files.
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`, // proves it's us
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM ?? "StreamerDraft <onboarding@resend.dev>",
      to: [email.to],
      subject: email.subject,
      html: email.html,
      text: email.text,
    }),
  });

  // response.ok is true for 2xx status codes (success)
  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Email failed to send (${response.status}): ${details}`);
  }
}