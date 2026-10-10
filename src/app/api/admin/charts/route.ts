// src/app/api/admin/charts/route.ts
//
// WHAT THIS IS
// Data for the admin dashboard's graphs (admin only):
//   GET http://localhost:3000/api/admin/charts            → last 30 days
//   GET http://localhost:3000/api/admin/charts?days=90    → last 90 days
// "days" only affects the day-by-day lines. The breakdowns (platforms,
// countries, hours...) always cover everyone.

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-auth";
import { getCharts } from "@/lib/admin-stats";

// z.coerce turns the text "90" from the URL into the number 90.
const querySchema = z.object({
  days: z.coerce.number().int().min(7).max(365).default(30),
});

export async function GET(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const url = new URL(request.url);
  const query = querySchema.safeParse({ days: url.searchParams.get("days") ?? undefined });
  if (!query.success) {
    return NextResponse.json({ ok: false, error: "days must be a number from 7 to 365." }, { status: 400 });
  }

  try {
    return NextResponse.json({ ok: true, ...(await getCharts(query.data.days)) });
  } catch (error) {
    console.error("[admin/charts] unexpected error:", error);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}