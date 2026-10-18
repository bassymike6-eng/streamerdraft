// src/app/api/admin/mailing-list/route.ts
//
// WHAT THIS IS
// Downloads an email list as a spreadsheet (admin only), ready for whatever
// you send the email with:
//   GET /api/admin/mailing-list?list=launch   everyone confirmed: the launch email
//   GET /api/admin/mailing-list?list=news     only those who ticked "news and offers"
//
// Columns: email, name, role, unsubscribe_link. Each person's
// unsubscribe_link is their own: put it in the footer of the email you send
// them ("Unsubscribe"). Anyone who's unsubscribed is already left out, so
// download a FRESH list right before each send. (Who's on which list, and
// why: src/lib/unsubscribe.ts.)

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-auth";
import { csvResponse, toCsv } from "@/lib/csv";
import { getMailingList } from "@/lib/unsubscribe";

const querySchema = z.object({ list: z.enum(["launch", "news"]) });

export async function GET(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const query = querySchema.safeParse({ list: new URL(request.url).searchParams.get("list") });
  if (!query.success) {
    return NextResponse.json({ ok: false, error: "list must be launch or news." }, { status: 400 });
  }

  try {
    const rows = await getMailingList(query.data.list);
    const name = query.data.list === "launch" ? "launch-email-list" : "news-email-list";
    return csvResponse(name, toCsv(["email", "name", "role", "unsubscribe_link"], rows));
  } catch (error) {
    console.error("[admin/mailing-list] unexpected error:", error);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
