// src/app/api/admin/emails/route.ts
//
// WHAT THIS IS
// The launch and news emails (admin only). How it all works: src/lib/broadcast.ts
//
//   GET  /api/admin/emails    what you've sent and how far each has got, how
//                             many are on each list, and whether this server
//                             really sends (devMode: true = printed in the
//                             terminal instead, like the confirm email;
//                             missingKey: true = the LIVE site has no Resend key)
//
//   POST /api/admin/emails    send one:
//        { "list": "launch", "subject": "...", "body": "Hey {name}, ...",
//          "buttonLabel": "Go to StreamerDraft", "buttonUrl": "https://...",
//          "confirm": true }
//        It starts sending in the background and replies straight away.
//        "confirm": true because it can't be unsent.

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-auth";
import { createBroadcast, draftSchema, listBroadcasts, runBroadcast } from "@/lib/broadcast";
import { getMailingCounts } from "@/lib/unsubscribe";

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    const [sends, lists] = await Promise.all([listBroadcasts(), getMailingCounts()]);
    return NextResponse.json(
      {
        ok: true, sends, lists,
        devMode: !process.env.RESEND_API_KEY && process.env.NODE_ENV !== "production",
        missingKey: !process.env.RESEND_API_KEY && process.env.NODE_ENV === "production",
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("[admin/emails] unexpected error:", error);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = await request.json().catch(() => null);
  if (body?.confirm !== true) {
    return NextResponse.json({ ok: false, error: 'Sending can\'t be undone. Send { "confirm": true } to do it.' }, { status: 400 });
  }
  const draft = draftSchema.safeParse(body);
  if (!draft.success) {
    const first = draft.error.issues[0]?.message ?? "Check the email.";
    return NextResponse.json({ ok: false, error: first, fields: z.flattenError(draft.error).fieldErrors }, { status: 400 });
  }

  try {
    const created = await createBroadcast(draft.data);
    if (created === "duplicate") {
      return NextResponse.json({ ok: false, error: "You've just sent this one: it's already going." }, { status: 409 });
    }
    if (created.total === 0) {
      return NextResponse.json({ ok: false, error: "Nobody's on that list yet." }, { status: 400 });
    }
    runBroadcast(created.id); // off it goes, in the background
    return NextResponse.json({ ok: true, ...created });
  } catch (error) {
    console.error("[admin/emails] unexpected error:", error);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
