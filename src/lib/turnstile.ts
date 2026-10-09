// src/lib/turnstile.ts
//
// WHAT THIS IS
// The server half of Cloudflare Turnstile, the "are you human?" check.
//
// HOW TURNSTILE WORKS (two halves)
// 1. FRONT END (F-phase): a small Cloudflare widget sits on the sign-up form.
//    It quietly checks the visitor's browser (sometimes it asks them to tick
//    a box) and, if happy, gives the form a one-time TOKEN.
// 2. BACK END (this file): the form sends that token with the sign-up. We ask
//    Cloudflare "is this token real?" using our SECRET key. Only Cloudflare and
//    our server know the secret, so a bot can't fake a "yes".
//
// THINGS TO KNOW
// - Each token works ONCE and only for 5 minutes.
// - No TURNSTILE_SECRET_KEY in local dev → we skip the check (and say so in
//   the terminal), so our .http tests keep working without a widget.
//   On the live site a missing key stops everything, like the email key does.
// - Cloudflare's TEST secret keys let us try both outcomes locally:
//     1x0000000000000000000000000000000AA → always passes
//     2x0000000000000000000000000000000AA → always fails
//   Test keys only accept the dummy token "XXXX.DUMMY.TOKEN.XXXX".

import "server-only";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

// What Cloudflare sends back (only the parts we use)
type SiteverifyReply = {
  success: boolean;
  "error-codes"?: string[]; // e.g. ["invalid-input-response"] when it fails
};

// true = human (or check skipped in dev), false = failed
export async function isHuman(token: string | undefined, ip: string | null): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;

  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("TURNSTILE_SECRET_KEY is missing. Add it to the server's environment.");
    }
    console.warn("[turnstile] No TURNSTILE_SECRET_KEY, skipping the human check (dev only).");
    return true;
  }

  // No token at all: the widget never ran (or a bot skipped the form).
  if (!token) {
    console.warn("[turnstile] failed: no token sent");
    return false;
  }

  // Ask Cloudflare. If Cloudflare doesn't answer within 5 seconds, this
  // throws, and the sign-up route replies "Something went wrong, try again"
  // rather than letting anyone through unchecked.
  const response = await fetch(VERIFY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      secret,
      response: token,
      // The visitor's IP is optional, but helps Cloudflare judge the token.
      ...(ip ? { remoteip: ip } : {}),
    }),
    signal: AbortSignal.timeout(5000),
  });
  const reply = (await response.json()) as SiteverifyReply;

  if (!reply.success) {
    // Logged for us to debug; the visitor just gets a friendly message.
    console.warn("[turnstile] failed:", reply["error-codes"]?.join(", ") || "no reason given");
  }
  return reply.success;
}