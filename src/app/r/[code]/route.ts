// src/app/r/[code]/route.ts
//
// WHAT THIS IS
// Everyone's referral link: streamerdraft.co.uk/r/k7x2qp
//
// WHAT HAPPENS WHEN SOMEONE OPENS ONE
// 1. We check the code belongs to someone (and looks like a code at all)
// 2. We send them on to the home page with the code attached: /?ref=k7x2qp
// 3. The home page (src/components/page/referral.ts) picks the code up from
//    the address (it stays there, rather than being saved in the browser)
// 4. When they join, the form sends the code with their sign-up, and the
//    sign-up is saved as "referred by" the owner of the link
//
// A code nobody has (a typo, half a link) still lands on the home page, just
// without the code, so the link never looks "broken" to the person opening it.
//
// WHY A ROUTE AND NOT A PAGE?
// There's nothing to show: it only checks and passes them on, so a route
// (which can answer with a redirect) is the right tool, and it's instant.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { limitByIp } from "@/lib/rate-limit";

// Same shape as the codes we make (src/lib/referral.ts): 6 letters/digits.
// A little looser (up to 20) so old or hand-made codes still pass this check.
const CODE_SHAPE = /^[a-z0-9]{4,20}$/i;

export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  // Where the site lives (APP_URL on the live site, so the redirect never
  // points at the server's own internal address)
  const home = new URL("/", process.env.APP_URL ?? request.url);

  // Opening links is cheap, but guessing codes over and over isn't allowed
  const limited = limitByIp(request, "referral-link", 60, 60);
  if (limited) return NextResponse.redirect(home, 302);

  const { code } = await params;
  const clean = code.trim().toLowerCase();
  if (!CODE_SHAPE.test(clean)) return NextResponse.redirect(home, 302);

  try {
    const found = await db.query(
      "SELECT 1 FROM signups WHERE referral_code = $1 AND disqualified_at IS NULL",
      [clean]
    );
    if (found.rows.length > 0) home.searchParams.set("ref", clean);
  } catch (error) {
    // The database is down: still let them in, just without the code
    console.error("[referral link] couldn't check the code:", error);
  }

  // 302 = "go here instead, for now" (not cached forever like a 301 would be,
  // so if a code's ever removed, the browser checks again next time)
  return NextResponse.redirect(home, 302);
}
