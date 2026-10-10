// src/app/api/admin/overview/route.ts
//
// WHAT THIS IS
// The headline numbers for the top of the admin dashboard (admin only):
//   GET http://localhost:3000/api/admin/overview
// See getOverview() in src/lib/admin-stats.ts for what's in it.

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getOverview } from "@/lib/admin-stats";

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    return NextResponse.json({ ok: true, ...(await getOverview()) });
  } catch (error) {
    console.error("[admin/overview] unexpected error:", error);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}