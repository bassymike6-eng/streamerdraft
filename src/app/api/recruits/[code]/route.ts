// src/app/api/recruits/[code]/route.ts
//
// WHAT THIS IS
// One person's recruit counts, looked up by their recruit code:
//   GET http://localhost:3000/api/recruits/gp5xwq
//
// WHY THE FOLDER IS CALLED [code]
// Square brackets make it a "dynamic route": whatever is in that part of
// the URL gets handed to us as `code`. So /api/recruits/gp5xwq gives
// code = "gp5xwq". One file handles every code.
//
// WHAT IT SENDS BACK
//   200 { "ok": true, "counted": 2, "pending": 1, "outsideUk": 1 }
//   404 { "ok": false, "error": "We couldn't find that recruit link." }
//
// IS IT OK THAT ANYONE CAN LOOK THIS UP?
// Yes. Recruit codes are public (they're in the links people share),
// and this only shows three numbers. No names, emails or countries.
// Someone guessing codes over and over gets slowed down in B5 (rate limits).

import { NextResponse } from "next/server";
import { getRecruitCounts } from "@/lib/stats";

// A real code is letters and digits only, never longer than 20 characters.
const CODE_SHAPE = /^[a-z0-9]{1,20}$/i;

export async function GET(
  _request: Request, // we don't need the request, the "_" says "unused on purpose"
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    // In Next.js 15+ params arrive as a Promise, so we have to await them.
    const { code } = await params;

    // Junk that can't be a code: answer "not found" without asking the database.
    if (!CODE_SHAPE.test(code)) {
      return notFound();
    }

    const counts = await getRecruitCounts(code);
    if (!counts) {
      return notFound(); // looks like a code, but nobody has it
    }

    // "...counts" copies counted, pending and outsideUk into the reply.
    return NextResponse.json({ ok: true, ...counts });
  } catch (error) {
    console.error("[recruits] unexpected error:", error);
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}

// Same reply for "junk" and "unknown", so the page only has one case to handle.
function notFound() {
  return NextResponse.json(
    { ok: false, error: "We couldn't find that recruit link." },
    { status: 404 } // 404 = "not found"
  );
}