// src/components/page/referral.ts
//
// WHAT THIS IS
// Remembers whose referral link brought this visitor here, so it counts for
// them when the visitor joins.
//
// HOW A REFERRAL LINK WORKS, END TO END
//   1. Alice shares streamerdraft.co.uk/r/k7x2qp
//   2. src/app/r/[code]/route.ts checks the code and sends the visitor on to /?ref=k7x2qp
//   3. keepReferral() (here) picks the code up from the address
//   4. The sign-up form sends it with their details (savedReferral())
//   5. The sign-up is saved as "referred by Alice". It COUNTS for Alice once the
//      visitor confirms their email, if they're both in the UK (src/lib/stats.ts)
//
// WHY IT ISN'T SAVED IN THE BROWSER
// The code stays in the page's address (?ref=...) and in memory, and nowhere
// else. UK rules (PECR) say storing things on someone's device needs their
// consent unless it's strictly needed for what they asked for, and referral
// tracking isn't. Kept in the address, it still survives a refresh, with no
// cookie banner needed. (The privacy policy says exactly this.)

import { useSyncExternalStore } from "react";

const CODE_SHAPE = /^[a-z0-9]{4,20}$/;
const OLD_KEY = "sd.ref"; // where an earlier version saved it: cleared out

let current: string | null = null; // this visit's code
const listeners = new Set<() => void>();

// Run once when the page opens
export function keepReferral() {
  try {
    localStorage.removeItem(OLD_KEY);
  } catch {
    // storage blocked: nothing to clear
  }
  const code = new URLSearchParams(window.location.search).get("ref")?.trim().toLowerCase() ?? null;
  const next = code && CODE_SHAPE.test(code) ? code : null;
  if (next !== current) {
    current = next;
    for (const tell of listeners) tell();
  }
}

// The code to send with the sign-up (null: they didn't come from a link)
export function savedReferral(): string | null {
  return current;
}

// The same, for showing on screen ("You're joining through a friend's link")
export function useReferral(): string | null {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => current,
    () => null,
  );
}
