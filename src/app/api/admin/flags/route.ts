// src/app/api/admin/flags/route.ts
//
// WHAT THIS IS
// Every red flag in one place, grouped (admin only):
//   GET http://localhost:3000/api/admin/flags
//
// A flag means "have a look", not "definitely cheating": a college or a
// family can share an IP. The flag rules live in migration 005.

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getFlags } from "@/lib/admin-signups";

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    return NextResponse.json({ ok: true, ...(await getFlags()) });
  } catch (error) {
    console.error("[admin/flags] unexpected error:", error);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}