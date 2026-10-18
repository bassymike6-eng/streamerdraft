// src/app/api/admin/export/route.ts
//
// WHAT THIS IS
// Downloads every sign-up as a spreadsheet file (admin only):
//   GET http://localhost:3000/api/admin/export
// Opens in Excel, Google Sheets or Numbers. Handy as a backup too.
// (The file itself, with its safety details, is made by src/lib/csv.ts.)

import { requireAdmin } from "@/lib/admin-auth";
import { getExportRows } from "@/lib/admin-signups";
import { csvResponse, toCsv } from "@/lib/csv";

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    const rows = await getExportRows();
    const headers = rows.length > 0 ? Object.keys(rows[0]) : ["id"];
    return csvResponse("signups", toCsv(headers, rows));
  } catch (error) {
    console.error("[admin/export] unexpected error:", error);
    return Response.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
