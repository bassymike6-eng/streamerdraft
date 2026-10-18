// src/app/api/unsubscribe/route.ts
//
// WHAT THIS IS
// Unsubscribing from our emails. Two ways in, both a POST:
//
// 1. The Unsubscribe button on our /unsubscribe page (the link in an email's
//    footer opens that page):
//      POST /api/unsubscribe   body: { "token": "1c.Xk3v9..." }
//
// 2. "One-click": the Unsubscribe button Gmail, Outlook and Apple Mail show
//    next to our name (from the List-Unsubscribe header, unsubscribe.ts).
//    Their servers send:
//      POST /api/unsubscribe?u=1c.Xk3v9...   body: List-Unsubscribe=One-Click
//
// WHY THERE'S NO "JUST OPEN THE LINK" VERSION (GET)
// Work and school email systems open every link in an email to check it for
// viruses, before the person even reads it. If opening the link unsubscribed
// them, those scanners would unsubscribe people by accident. So opening the
// link only shows a page with a button, and only pressing it (a POST) counts.
//
// Replies: 200 { ok: true } (done, or they were already off the list),
// 400 if the code's broken or made up.

import { NextResponse } from "next/server";
import { limitByIp } from "@/lib/rate-limit";
import { readUnsubscribeToken, unsubscribe } from "@/lib/unsubscribe";

// The code can come in the address (?u=) or in a JSON body ({ token })
async function readToken(request: Request): Promise<string | null> {
  const fromUrl = new URL(request.url).searchParams.get("u");
  if (fromUrl) return fromUrl;
  if (!request.headers.get("content-type")?.includes("application/json")) return null;
  try {
    const body = await request.json();
    return typeof body?.token === "string" ? body.token : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  // Generous: one-click unsubscribes all arrive from a handful of Gmail and
  // Outlook servers, so lots of real ones can share an IP after a big send
  const limited = limitByIp(request, "unsubscribe", 300, 10 * 60);
  if (limited) return limited;

  const id = readUnsubscribeToken(await readToken(request));
  if (id === null) {
    return NextResponse.json(
      { ok: false, status: "invalid", error: "This unsubscribe link doesn't work." },
      { status: 400 }
    );
  }

  try {
    // false = they've been deleted already: nothing left to email, so that's a yes too
    await unsubscribe(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[unsubscribe] unexpected error:", error);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
