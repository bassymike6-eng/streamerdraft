// src/app/api/admin/me/route.ts
//
// WHAT THIS IS
// "Am I logged in?": GET http://localhost:3000/api/admin/me
//   200 { "ok": true }  → show the dashboard
//   401                 → show the login box
// The dashboard page calls this first when it opens.

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  return NextResponse.json({ ok: true });
}