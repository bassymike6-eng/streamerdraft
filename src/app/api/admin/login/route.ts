// src/app/api/admin/login/route.ts
//
// WHAT THIS IS
// Logging in to the admin dashboard:
//   POST http://localhost:3000/api/admin/login
//   body: { "password": "..." }
//
// RIGHT PASSWORD → 200 + a session cookie (see src/lib/admin-auth.ts)
// WRONG PASSWORD → 401, and it counts towards a strict speed limit:
// 5 tries per 15 minutes per IP, so nobody can guess the password by
// trying thousands of times.

import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ADMIN_COOKIE,
  SESSION_HOURS,
  cookieOptions,
  isAdminConfigured,
  makeSessionTicket,
  passwordMatches,
} from "@/lib/admin-auth";
import { limitByIp } from "@/lib/rate-limit";

const loginSchema = z.object({ password: z.string().min(1).max(200) });

export async function POST(request: Request) {
  const limited = limitByIp(request, "admin-login", 5, 15 * 60);
  if (limited) return limited;

  // No password set up on the server: say so clearly (no one can log in).
  if (!isAdminConfigured()) {
    console.error("[admin] ADMIN_PASSWORD or ADMIN_SESSION_SECRET is missing from the environment.");
    return NextResponse.json({ ok: false, error: "Admin login isn't set up yet." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const result = loginSchema.safeParse(body);
  if (!result.success || !passwordMatches(result.data.password)) {
    // Same reply for "missing" and "wrong", so we give nothing away.
    return NextResponse.json({ ok: false, error: "Wrong password." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, makeSessionTicket(), cookieOptions(SESSION_HOURS * 60 * 60));
  return response;
}