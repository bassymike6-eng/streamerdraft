// src/lib/ip.ts
//
// WHAT THIS IS
// A "fingerprint" of where each sign-up came from, so the admin dashboard (B6)
// can spot one person signing up lots of fake recruits from the same place.
//
// WHY WE SCRAMBLE THE IP INSTEAD OF SAVING IT
// An IP address can point to a real home, so it counts as personal data.
// We don't need the actual address, only "is this the SAME as that one?".
// So we save a scrambled version (a hash): same IP in → same hash out,
// but you can't turn the hash back into the IP.
//
// WHY THE SECRET
// There are only about 4 billion IPv4 addresses. Without a secret, someone
// with our database could hash every one of them in minutes and match them up.
// Mixing in IP_HASH_SECRET (an "HMAC") makes that impossible without the secret.
// Never change the secret once the site is live: every hash would change and
// old sign-ups would stop matching new ones.
//
// WHERE THE IP COMES FROM
// - Live (behind Cloudflare): the "CF-Connecting-IP" header Cloudflare adds.
// - Local dev: "X-Forwarded-For", which Next.js fills in (usually 127.0.0.1 or ::1).
// Like CF-IPCountry, these can only be trusted once the server ONLY accepts
// traffic from Cloudflare (on the L1 list).

import "server-only";
import { createHmac } from "node:crypto";
import { isIPv4, isIPv6 } from "node:net";

// ── Read the visitor's IP from the request ──────────────────────────
export function getClientIp(request: Request): string | null {
  const fromCloudflare = request.headers.get("cf-connecting-ip");
  // X-Forwarded-For can be a list ("client, proxy1, proxy2"): the first is the visitor.
  const fromForwarded = request.headers.get("x-forwarded-for")?.split(",")[0];

  const ip = (fromCloudflare ?? fromForwarded ?? "").trim();

  // Only accept something that really is an IP address.
  return isIPv4(ip) || isIPv6(ip) ? ip : null;
}

// ── Turn an IP into its scrambled fingerprint ───────────────────────
export function hashIp(ip: string | null): string | null {
  if (!ip) return null; // unknown IP = no fingerprint

  return createHmac("sha256", getSecret()).update(groupIp(ip)).digest("hex");
}

// IPv6 users often get a NEW address every day, but the first half of it
// (the "/64") stays the same for their home or phone. So for IPv6 we
// fingerprint just that first half. Otherwise one person would look like
// lots of different people.
function groupIp(ip: string): string {
  // "::ffff:1.2.3.4" is an IPv4 address written in IPv6 form: treat as IPv4.
  if (ip.toLowerCase().startsWith("::ffff:") && isIPv4(ip.slice(7))) {
    return ip.slice(7);
  }
  if (isIPv4(ip)) return ip;

  // IPv6: "::" is shorthand for "a run of zero blocks", so expand it to all
  // 8 blocks first, then keep the first 4.
  const [head, tail] = ip.toLowerCase().split("::");
  const headBlocks = head ? head.split(":") : [];
  const tailBlocks = tail ? tail.split(":") : [];
  const zeros = Array(8 - headBlocks.length - tailBlocks.length).fill("0");
  const blocks = tail === undefined ? headBlocks : [...headBlocks, ...zeros, ...tailBlocks];

  // parseInt + toString tidies "0db8" and "db8" into the same thing.
  return blocks
    .slice(0, 4)
    .map((block) => parseInt(block || "0", 16).toString(16))
    .join(":") + "::/64";
}

function getSecret(): string {
  const secret = process.env.IP_HASH_SECRET;
  if (secret) return secret;

  // Live site with no secret: stop loudly rather than save weak hashes.
  if (process.env.NODE_ENV === "production") {
    throw new Error("IP_HASH_SECRET is missing. Add it to the server's environment.");
  }
  // Local dev: a fixed stand-in is fine.
  return "dev-only-not-secret";
}