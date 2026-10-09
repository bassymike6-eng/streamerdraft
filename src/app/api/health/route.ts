// src/app/api/health/route.ts
//
// WHAT THIS IS
// Our "is everything alive?" check: http://localhost:3000/api/health
// It now checks two things: the server is running AND the database answers.
// If anything breaks later, open this URL first.

import { NextResponse } from "next/server";
import { db } from "@/lib/db"; // "@/" is a shortcut for the src/ folder

export async function GET() {
  try {
    // Ask the database a tiny question. If it answers, the connection works.
    // NOW() is SQL for "what's the current time?". "AS db_time" names the answer.
    const result = await db.query("SELECT NOW() AS db_time");

    return NextResponse.json({
      ok: true,
      service: "streamerdraft-api",
      database: "connected",
      dbTime: result.rows[0].db_time, // rows = the answer, [0] = first row
    });
  } catch (error) {
    // Something went wrong talking to the database.
    // The FULL error goes to the terminal (for us to debug).
    // The browser only gets a short message (never leak details to visitors).
    console.error("[health] database error:", error);

    return NextResponse.json(
      { ok: false, service: "streamerdraft-api", database: "error" },
      { status: 503 } // 503 = "service unavailable"
    );
  }
}