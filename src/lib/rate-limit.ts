// src/lib/rate-limit.ts
//
// WHAT THIS IS
// A speed limit for our API. Each IP address gets a number of tries per
// time window, e.g. 20 sign-ups per 10 minutes. Go over it and you get
// "429 Too Many Requests" until the window resets.
//
// WHAT IT STOPS
// Scripts. A person signs up once or twice; a bot fires hundreds of requests
// a minute (fake sign-ups, guessing recruit codes, hammering the database).
// The limits are generous on purpose: a whole college or household can
// share ONE IP address, and we don't want to block a room full of real
// people signing up together. Catching sneaky humans is the dashboard's job.
//
// HOW IT WORKS ("fixed window")
// For every "route + IP" we remember a count and when the window ends.
//   First request   → count 1, window ends in e.g. 10 minutes
//   More requests   → count goes up
//   count > limit   → blocked until the window ends
//   Window ended    → start again from 1
//
// LIMITS OF THIS APPROACH
// The counts live in the server's memory, so:
// - restarting the server resets everyone's counts (fine for us)
// - it only works with ONE server process (our VPS). If we ever run several,
//   the counts need to move somewhere shared, like Redis or Postgres.

import "server-only";
import { NextResponse } from "next/server";
import { getClientIp } from "@/lib/ip";


type Bucket = { count: number; resetAt: number }; // resetAt = time in ms

// Kept on globalThis (like our database pool in db.ts) so the counts
// survive Next.js reloading files while we code.
const globalForLimits = globalThis as unknown as { rateLimitBuckets?: Map<string, Bucket> };
const buckets = globalForLimits.rateLimitBuckets ?? new Map<string, Bucket>();
globalForLimits.rateLimitBuckets = buckets;

// Use this at the top of a route. It returns:
// - null if the request is allowed (carry on as normal)
// - a ready-made 429 reply if they're over the limit (return it straight away)
export function limitByIp(
  request: Request,
  name: string, // which route, e.g. "signup", so each route has its own count
  limit: number, // how many requests are allowed...
  windowSeconds: number // ...per this many seconds
): NextResponse | null {
  // No IP (very rare)? They share one "unknown" bucket rather than skip the limit.
  const key = `${name}:${getClientIp(request) ?? "unknown"}`;
  const now = Date.now();
  const bucket = buckets.get(key);

  // No bucket yet, or the old window has ended: start a fresh one.
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    sweepOldBuckets(now);
    return null;
  }

  // Still inside the window and under the limit: count it, let it through.
  if (bucket.count < limit) {
    bucket.count++;
    return null;
  }

  // Over the limit: tell them how long to wait.
  const retryAfterSeconds = Math.ceil((bucket.resetAt - now) / 1000);
  return NextResponse.json(
    {
      ok: false,
      status: "rate_limited",
      error: "Too many attempts. Wait a few minutes and try again.",
      retryAfterSeconds,
    },
    {
      status: 429, // 429 = "too many requests"
      headers: { "Retry-After": String(retryAfterSeconds) }, // the standard way to say "wait this long"
    }
  );
}

// Every so often, forget buckets whose window has ended, so memory
// doesn't slowly fill up with IPs we'll never see again.
function sweepOldBuckets(now: number) {
  if (buckets.size < 10_000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}