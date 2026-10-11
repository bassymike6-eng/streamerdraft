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
//            { "scoutApproved": true }               ← approve a scout (false = un-approve)
//
//   DELETE /api/admin/signups/42   remove them completely, for "delete my
//            { "confirm": true }   data" requests. Can't be undone, so the
//                                  body must say confirm: true.
//
// NOTE: the 42 here is the database id (shown in the table), not their #number.

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-auth";
import { deleteSignup, getSignupDetail, setDisqualified, setNote, setScoutApproved } from "@/lib/admin-signups";

type Context = { params: Promise<{ id: string }> };

// The id in the URL is text: check it's a sensible whole number.
const idSchema = z.coerce.number().int().positive();

const patchSchema = z
  .object({
    disqualified: z.boolean().optional(),
    reason: z.string().trim().max(200).optional(),
    note: z.string().trim().max(1000).optional(),
    scoutApproved: z.boolean().optional(),
  })
  .refine(
    (body) => body.disqualified !== undefined || body.note !== undefined || body.scoutApproved !== undefined,
    { error: "Send disqualified, note and/or scoutApproved." }
  );

const deleteSchema = z.object({ confirm: z.literal(true) });

const notFound = () => NextResponse.json({ ok: false, error: "No sign-up with that id." }, { status: 404 });
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
      { ok: false, error: "Send disqualified (true/false), a note and/or scoutApproved (true/false)." },
      { status: 400 }
    );
  }

  try {
    const { disqualified, reason, note, scoutApproved } = body.data;

    // Approving is checked FIRST: if this isn't a scout, nothing else gets
    // changed either, so a mistake never leaves half a change behind.
    if (scoutApproved !== undefined) {
      const outcome = await setScoutApproved(id.data, scoutApproved);
      if (outcome === "not_found") return notFound();
      if (outcome === "not_scout") {
        return NextResponse.json({ ok: false, error: "Only scouts can be approved." }, { status: 400 });
      }
    }
    if (disqualified !== undefined && !(await setDisqualified(id.data, disqualified, reason))) return notFound();
    if (note !== undefined && !(await setNote(id.data, note))) return notFound();

    // Send back the updated person, so the page can refresh in one go.
    return NextResponse.json({ ok: true, ...(await getSignupDetail(id.data)) });
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