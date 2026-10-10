// src/app/api/admin/logout/route.ts
//
// WHAT THIS IS
// Logging out: POST http://localhost:3000/api/admin/logout
// We overwrite the cookie with an empty one that expires straight away.

import { NextResponse } from "next/server";
import { ADMIN_COOKIE, cookieOptions } from "@/lib/admin-auth";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, "", cookieOptions(0));
  return response;
}