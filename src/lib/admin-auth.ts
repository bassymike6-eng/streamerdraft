// src/lib/admin-auth.ts
//
// WHAT THIS IS
// The lock on the admin dashboard. Only someone who knows ADMIN_PASSWORD
// can see the admin data.
//
// HOW IT WORKS
// 1. You log in once with the password (POST /api/admin/login).
// 2. We give your browser a COOKIE holding a "session ticket":
//       <expiry time>.<signature>
//    The signature is made with ADMIN_SESSION_SECRET, which only the server
//    knows. If anyone changes the expiry, the signature stops matching, so a
//    ticket can't be faked or stretched.
// 3. Every admin route calls requireAdmin() first, which checks the ticket.
//
// THE COOKIE IS LOCKED DOWN
//   httpOnly        page JavaScript can't read it (so a script can't steal it)
//   sameSite strict the browser only sends it from OUR site, never from links
//                   or forms on other sites
//   secure          on the live site it only travels over https
//   12 hours        then you log in again
//
// TO LOG EVERYONE OUT (e.g. you think the password leaked): change
// ADMIN_SESSION_SECRET and ADMIN_PASSWORD, then restart the server.

import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const ADMIN_COOKIE = "sd_admin";
export const SESSION_HOURS = 12;

// ── Checking the password ───────────────────────────────────────────
export function isAdminConfigured(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD && process.env.ADMIN_SESSION_SECRET);
}

export function passwordMatches(attempt: string): boolean {
  const real = process.env.ADMIN_PASSWORD;
  if (!real) return false;

  // timingSafeEqual takes the same time whether the first letter or the last
  // letter is wrong, so an attacker can't guess the password one letter at a
  // time by timing our replies. It needs two equal-length inputs, so we
  // compare fixed-length fingerprints (SHA-256) of each.
  const a = createHash("sha256").update(attempt).digest();
  const b = createHash("sha256").update(real).digest();
  return timingSafeEqual(a, b);
}

// ── Making and checking the session ticket ──────────────────────────
function sign(value: string): string {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) throw new Error("ADMIN_SESSION_SECRET is missing. Add it to .env.local.");
  return createHmac("sha256", secret).update(`admin.${value}`).digest("base64url");
}

export function makeSessionTicket(): string {
  const expiresAt = Date.now() + SESSION_HOURS * 60 * 60 * 1000;
  return `${expiresAt}.${sign(String(expiresAt))}`;
}

function ticketIsValid(ticket: string | undefined): boolean {
  if (!ticket || !isAdminConfigured()) return false;

  const [expiresAt, signature] = ticket.split(".");
  if (!expiresAt || !signature) return false;

  // Expired?
  if (Number(expiresAt) < Date.now()) return false;

  // Signature right? (compared the timing-safe way, same reason as above)
  const expected = Buffer.from(sign(expiresAt));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

// ── The guard every admin route uses ────────────────────────────────
// Returns null if you're logged in (carry on), or a 401 reply to send back.
export async function requireAdmin(): Promise<NextResponse | null> {
  const cookieStore = await cookies(); // Next.js 15+: cookies() must be awaited
  if (ticketIsValid(cookieStore.get(ADMIN_COOKIE)?.value)) {
    return null;
  }
  return NextResponse.json(
    { ok: false, error: "Log in to see this." },
    { status: 401 } // 401 = "you need to log in"
  );
}

// The cookie settings, in one place so login and logout always match.
export function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}