// src/lib/throwaway.ts
//
// WHAT THIS IS
// Spots "throwaway" email addresses: inboxes like mailinator.com or
// 10minutemail.com that anyone can create in seconds, with no sign-up.
// They're the second-easiest way to farm fake recruits (after Gmail tricks),
// and a winner on one of them couldn't be contacted anyway.
//
// WHERE THE LIST COMES FROM
// The npm package "disposable-email-domains-js", which packages a public,
// community-maintained list (github.com/disposable-email-domains). It has
// thousands of domains. To pick up new ones, now and then run:
//   npm update disposable-email-domains-js
//
// WHY THIS ISN'T IN validation.ts
// validation.ts may also run in the browser later (for instant form errors).
// This list is big, so we keep it on the server only.

import "server-only";
import { disposableEmailBlocklistSet } from "disposable-email-domains-js";

// Build the list ONCE when the server starts. A Set can answer
// "is this in the list?" instantly, however long the list is.
const BLOCKLIST = disposableEmailBlocklistSet();

// Our own additions: if you spot a throwaway domain that isn't caught,
// add it here (lowercase, no "@"), e.g. "fakeinbox.example".
const EXTRA_BLOCKED = new Set<string>([]);

function isBlocked(domain: string): boolean {
  return BLOCKLIST.has(domain) || EXTRA_BLOCKED.has(domain);
}

export function isThrowawayEmail(email: string): boolean {
  const domain = email.split("@")[1]?.trim().toLowerCase() ?? "";

  // Also catch subdomains: for "x@spam.mailinator.com" we check
  // "spam.mailinator.com", then "mailinator.com".
  // (We stop before checking just "com" on its own.)
  const parts = domain.split(".");
  for (let i = 0; i < parts.length - 1; i++) {
    if (isBlocked(parts.slice(i).join("."))) {
      return true;
    }
  }
  return false;
}