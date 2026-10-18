// src/app/api/admin/emails/[id]/resume/route.ts
//
// WHAT THIS IS
// Resume (admin only): carry on sending an email that paused part-way
// (Resend's daily limit, the server restarting...). It picks up exactly
// where it stopped: nobody gets it twice (src/lib/broadcast.ts).
//   POST /api/admin/emails/7/resume

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-auth";
import { resumeBroadcast } from "@/lib/broadcast";

type Context = { params: Promise<{ id: string }> };
const idSchema = z.coerce.number().int().positive();

export async function POST(_request: Request, { params }: Context) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const id = idSchema.safeParse((await params).id);
  if (!id.success) return NextResponse.json({ ok: false, error: "No email with that id." }, { status: 404 });

  try {
    return (await resumeBroadcast(id.data))
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ ok: false, error: "No email with that id." }, { status: 404 });
  } catch (error) {
    console.error("[admin/emails/resume] unexpected error:", error);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
