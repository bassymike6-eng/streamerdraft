// src/app/api/health/route.ts
//
// WHAT THIS IS
// A "route handler" = one back-end endpoint.
// Next.js turns the folder path into a URL:
//   src/app/api/health/route.ts  ->  http://localhost:3000/api/health
//
// WHY WE HAVE IT
// A quick "is the server alive?" check. If anything breaks later,
// open this URL first: if it fails, the server itself is down.
// In chunk B1 it will also check the database connection.

import { NextResponse } from "next/server";

// The function's NAME decides which kind of request it answers.
// GET = what the browser sends when you just open a URL.
// Later we'll use POST for sending form data (the sign-up form).
export async function GET() {
  // NextResponse.json() sends data back as JSON,
  // the format our front end will read.
  return NextResponse.json({
    ok: true,                       // the server is running
    service: "streamerdraft-api",   // which app replied
    time: new Date().toISOString(), // changes on every refresh, proving the reply is live
  });
}