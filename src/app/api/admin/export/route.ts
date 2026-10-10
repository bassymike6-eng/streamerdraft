// src/app/api/admin/export/route.ts
//
// WHAT THIS IS
// Downloads every sign-up as a spreadsheet file (admin only):
//   GET http://localhost:3000/api/admin/export
// Opens in Excel, Google Sheets or Numbers. Handy as a backup too.
//
// TWO SAFETY DETAILS
// 1. CSV injection: a sneaky name like =HYPERLINK("bad-site") would run as a
//    formula when the file is opened in Excel. Anything starting with
//    = + - @ gets a ' in front, which makes Excel show it as plain text.
// 2. The file starts with an invisible "BOM" character so Excel reads
//    accents and emojis in names correctly.

import { requireAdmin } from "@/lib/admin-auth";
import { getExportRows } from "@/lib/admin-signups";

function toCell(value: unknown): string {
  let text: string;
  if (value === null || value === undefined) text = "";
  else if (value instanceof Date) text = value.toISOString();
  else if (Array.isArray(value)) text = value.join("; ");
  else text = String(value);

  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`; // CSV injection guard

  // Wrap every cell in quotes, and double any quotes inside it ("" = ").
  return `"${text.replace(/"/g, '""')}"`;
}

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    const rows = await getExportRows();
    const headers = rows.length > 0 ? Object.keys(rows[0]) : ["id"];

    const lines = [
      headers.map(toCell).join(","),
      ...rows.map((row) => headers.map((header) => toCell(row[header])).join(",")),
    ];

    // Today's date in the UK, e.g. 2026-10-10 ("en-CA" happens to format dates as YYYY-MM-DD)
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
    return new Response("\uFEFF" + lines.join("\r\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        // "attachment" = download it, with this file name
        "Content-Disposition": `attachment; filename="streamerdraft-signups-${today}.csv"`,
      },
    });
  } catch (error) {
    console.error("[admin/export] unexpected error:", error);
    return Response.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}