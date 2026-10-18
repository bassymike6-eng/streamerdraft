// src/lib/csv.ts
//
// WHAT THIS IS
// Turns rows into a spreadsheet file (CSV) for the admin dashboard's
// downloads: everyone (/api/admin/export) and the email lists
// (/api/admin/mailing-list). Opens in Excel, Google Sheets or Numbers.
//
// TWO SAFETY DETAILS
// 1. CSV injection: a sneaky name like =HYPERLINK("bad-site") would run as a
//    formula when the file is opened in Excel. Anything starting with
//    = + - @ gets a ' in front, which makes Excel show it as plain text.
// 2. The file starts with an invisible "BOM" character so Excel reads
//    accents and emojis in names correctly.

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

// A whole file. `headers` = the column names (and order); each row is read by them.
export function toCsv(headers: string[], rows: Record<string, unknown>[]): string {
  const lines = [
    headers.map(toCell).join(","),
    ...rows.map((row) => headers.map((header) => toCell(row[header])).join(",")),
  ];
  return "﻿" + lines.join("\r\n");
}

// A download reply, named e.g. streamerdraft-signups-2026-10-15.csv
export function csvResponse(name: string, csv: string): Response {
  // Today's date in the UK, e.g. 2026-10-15 ("en-CA" happens to format dates as YYYY-MM-DD)
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      // "attachment" = download it, with this file name
      "Content-Disposition": `attachment; filename="streamerdraft-${name}-${today}.csv"`,
      // personal data: never keep a copy in a cache along the way
      "Cache-Control": "no-store",
    },
  });
}
