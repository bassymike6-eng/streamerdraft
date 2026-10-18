// src/app/api/admin/emails/test/route.ts
//
// WHAT THIS IS
// "Send me a test" (admin only): one copy of the email you're writing, to
// you, so you can see it in a real inbox before everyone gets it.
//   POST /api/admin/emails/test   { ...the email (see ../route.ts), "to": "you@..." }
// The subject starts [Test], the name says "there", and the unsubscribe link
// is a dummy. 10 a minute, so a stuck button can't eat your Resend allowance.

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-auth";
import { draftSchema, sendTestEmail } from "@/lib/broadcast";
import { limitByIp } from "@/lib/rate-limit";

const toSchema = z.object({ to: z.email({ error: "Type the email to send the test to." }).max(254) });

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const limited = limitByIp(request, "admin-test-email", 10, 60);
  if (limited) return limited;

  const body = await request.json().catch(() => null);
  const to = toSchema.safeParse(body);
  const draft = draftSchema.safeParse(body);
  if (!to.success || !draft.success) {
    const problem = (to.success ? null : to.error.issues[0]?.message) ?? (draft.success ? null : draft.error.issues[0]?.message);
    return NextResponse.json({ ok: false, error: problem ?? "Check the email." }, { status: 400 });
  }

  try {
    await sendTestEmail(draft.data, to.data.to);
    return NextResponse.json({ ok: true, devMode: !process.env.RESEND_API_KEY && process.env.NODE_ENV !== "production" });
  } catch (error) {
    console.error("[admin/emails/test] didn't send:", error);
    return NextResponse.json({ ok: false, error: "The test didn't send. Check the server log (and your Resend settings)." }, { status: 502 });
  }
}
