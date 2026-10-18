// src/app/api/admin/signups/[id]/route.ts
//
// WHAT THIS IS
// One person, and the things you can do to them (admin only):
//
//   GET    /api/admin/signups/42   everything about #42: details, flags,
//                                  their recruits, and who shares their IP
//
//   PATCH  /api/admin/signups/42   change something. Send any of:
//            { "disqualified": true, "reason": "fake recruits" }
//            { "disqualified": false }               ← reinstate them
//            { "note": "DM'd them on TikTok" }       ← "" clears the note
//            { "scoutChecked": true }                ← "Looks good" on a scout (false = un-tick)
//            { "scoutTurnedDown": true, "reason": "fake links" }
//                                                    ← turn a scout down: the FIRST time,
//                                                      they're emailed (if they'd confirmed)
//            { "scoutTurnedDown": false }            ← undo it (no email)
//
//   DELETE /api/admin/signups/42   remove them completely, for "delete my
//            { "confirm": true }   data" requests. Can't be undone, so the
//                                  body must say confirm: true.
//
// NOTE: the 42 here is the database id (shown in the table), not their #number.

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-auth";
import { deleteSignup, getSignupDetail, setDisqualified, setNote, setScoutChecked, setScoutTurnedDown } from "@/lib/admin-signups";
import { sendEmail } from "@/lib/email";
import { turnDownEmail } from "@/lib/turn-down-email";

type Context = { params: Promise<{ id: string }> };

// The id in the URL is text: check it's a sensible whole number.
const idSchema = z.coerce.number().int().positive();

const patchSchema = z
  .object({
    disqualified: z.boolean().optional(),
    reason: z.string().trim().max(200).optional(),
    note: z.string().trim().max(1000).optional(),
    scoutChecked: z.boolean().optional(),
    scoutTurnedDown: z.boolean().optional(),
  })
  .refine(
    (body) =>
      body.disqualified !== undefined || body.note !== undefined ||
      body.scoutChecked !== undefined || body.scoutTurnedDown !== undefined,
    { error: "Send disqualified, note, scoutChecked and/or scoutTurnedDown." }
  )
  // one reason box: it can't be for disqualifying AND turning down at once
  .refine((body) => !(body.disqualified === true && body.scoutTurnedDown === true), {
    error: "Disqualify and turn down separately.",
  });

const deleteSchema = z.object({ confirm: z.literal(true) });

const notFound = () => NextResponse.json({ ok: false, error: "No sign-up with that id." }, { status: 404 });
const notScout = () => NextResponse.json({ ok: false, error: "Only scouts can be checked or turned down." }, { status: 400 });

// The "we can't take you on as a scout" email (src/lib/turn-down-email.ts).
// Only to a confirmed email. If it doesn't send, they're still turned down:
// returns false, and the dashboard says it didn't go.
async function emailTurnDown(id: number): Promise<boolean> {
  const detail = await getSignupDetail(id);
  const person = detail?.signup;
  if (!person?.confirmed) return false;
  try {
    const appUrl = process.env.APP_URL ?? "http://localhost:3000";
    await sendEmail({ to: person.email, ...turnDownEmail({ displayName: person.displayName, eligible: person.eligible }, appUrl) });
    return true;
  } catch (error) {
    console.error("[admin/signups] the turn-down email didn't send:", error);
    return false;
  }
}
const failed = (where: string, error: unknown) => {
  console.error(`[admin/signups/${where}] unexpected error:`, error);
  return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
};

// Reads JSON without crashing on an empty or broken body.
async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export async function GET(_request: Request, { params }: Context) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const id = idSchema.safeParse((await params).id);
  if (!id.success) return notFound();

  try {
    const detail = await getSignupDetail(id.data);
    return detail ? NextResponse.json({ ok: true, ...detail }) : notFound();
  } catch (error) {
    return failed("get", error);
  }
}

export async function PATCH(request: Request, { params }: Context) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const id = idSchema.safeParse((await params).id);
  if (!id.success) return notFound();

  const body = patchSchema.safeParse(await readJson(request));
  if (!body.success) {
    return NextResponse.json(
      { ok: false, error: "Send disqualified, a note, scoutChecked or scoutTurnedDown (true/false)." },
      { status: 400 }
    );
  }

  try {
    const { disqualified, reason, note, scoutChecked, scoutTurnedDown } = body.data;

    // Scout changes are checked FIRST: if this isn't a scout, nothing else
    // gets changed either, so a mistake never leaves half a change behind.
    if (scoutChecked !== undefined) {
      const outcome = await setScoutChecked(id.data, scoutChecked);
      if (outcome === "not_found") return notFound();
      if (outcome === "not_scout") return notScout();
    }
    let emailed = false;
    if (scoutTurnedDown !== undefined) {
      const { outcome, wasAlready } = await setScoutTurnedDown(id.data, scoutTurnedDown, reason);
      if (outcome === "not_found") return notFound();
      if (outcome === "not_scout") return notScout();
      // Newly turned down: tell them (only if they'd confirmed their email)
      if (scoutTurnedDown && !wasAlready) emailed = await emailTurnDown(id.data);
    }
    if (disqualified !== undefined && !(await setDisqualified(id.data, disqualified, reason))) return notFound();
    if (note !== undefined && !(await setNote(id.data, note))) return notFound();

    // Send back the updated person, so the page can refresh in one go.
    return NextResponse.json({ ok: true, emailed, ...(await getSignupDetail(id.data)) });
  } catch (error) {
    return failed("patch", error);
  }
}

export async function DELETE(request: Request, { params }: Context) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const id = idSchema.safeParse((await params).id);
  if (!id.success) return notFound();

  if (!deleteSchema.safeParse(await readJson(request)).success) {
    return NextResponse.json(
      { ok: false, error: 'Deleting can\'t be undone. Send { "confirm": true } to do it.' },
      { status: 400 }
    );
  }

  try {
    return (await deleteSignup(id.data)) ? NextResponse.json({ ok: true, deleted: id.data }) : notFound();
  } catch (error) {
    return failed("delete", error);
  }
}
