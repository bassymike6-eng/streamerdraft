// src/lib/referral.ts
//
// WHAT THIS IS
// Makes random recruit codes like "k7x2qp" for links such as
// streamerdraft.com/r/k7x2qp
//
// We leave out characters people mix up (0/o, 1/l/i) so codes are
// easy to read out loud on stream.

import { randomInt } from "node:crypto";

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // 31 characters
const CODE_LENGTH = 6; // 31^6 = about 887 million possible codes

export function makeReferralCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    // randomInt is "cryptographically secure" random, so codes can't be guessed.
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return code;
}