// src/app/api/admin/signups/route.ts
//
// WHAT THIS IS
// The big table of everyone who signed up (admin only):
//   GET http://localhost:3000/api/admin/signups
//
// EVERYTHING IS OPTIONAL, mix and match in the URL:
//   ?search=bassy           email, name or recruit code contains "bassy"
//   ?role=prospect          or scout
//   ?status=confirmed       or unconfirmed, eligible, disqualified,
//                           approved (scouts), awaiting_approval (scouts to review)
//   ?uk=yes                 or no
//   ?flagged=yes            only people with a red flag
//   ?sort=recruits          or newest (default), oldest, name
//   ?page=2&pageSize=50     pages (pageSize 10 to 200)
// e.g. /api/admin/signups?role=prospect&flagged=yes&sort=recruits

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-auth";
import { listSignups } from "@/lib/admin-signups";

const querySchema = z.object({
  search: z.string().trim().max(100).optional(),
  role: z.enum(["prospect", "scout"]).optional(),
  status: z
    .enum(["confirmed", "unconfirmed", "eligible", "disqualified", "approved", "awaiting_approval"])
    .optional(),
  uk: z.enum(["yes", "no"]).optional(),
  flagged: z.enum(["yes"]).optional(),
  sort: z.enum(["newest", "oldest", "recruits", "name"]).default("newest"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(200).default(50),
});

export async function GET(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  // Turn ?a=1&b=2 into { a: "1", b: "2" }, leaving out empty ones (?search=)
  const params = Object.fromEntries(
    [...new URL(request.url).searchParams].filter(([, value]) => value !== "")
  );
  const query = querySchema.safeParse(params);
  if (!query.success) {
    return NextResponse.json(
      { ok: false, error: "Check the filters.", fields: z.flattenError(query.error).fieldErrors },
      { status: 400 }
    );
  }

  try {
    return NextResponse.json({ ok: true, ...(await listSignups(query.data)) });
  } catch (error) {
    console.error("[admin/signups] unexpected error:", error);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}