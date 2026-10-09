// src/lib/tokens.ts
//
// WHAT THIS IS
// Makes the secret code that goes inside each confirmation email link,
// and "hashes" (scrambles) it for storing in the database.
//
// WHY HASH IT?
// We only store the scrambled version. Hashing is one-way: you can turn
// a token into its hash, but never a hash back into the token. So even
// if someone stole a copy of the database, they couldn't confirm anyone.
// When a link is clicked, we hash the token from the link and look for
// a matching hash.

import { createHash, randomBytes } from "node:crypto";

// 32 random bytes → a 43-character code that's safe to put in a URL.
export function makeToken(): string {
  return randomBytes(32).toString("base64url");
}

// SHA-256 = a standard one-way scrambler. Same input → same output, every time.
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}