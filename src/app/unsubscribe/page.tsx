// src/app/unsubscribe/page.tsx
//
// The page an email's "Unsubscribe" link opens: /unsubscribe?u=...
// Everything happens in the browser (src/components/plain/UnsubscribePage.tsx):
// one button, and opening the page on its own changes nothing (the API route
// says why). This file just gives the page its title.

import type { Metadata } from "next";
import { UnsubscribePage } from "@/components/plain/UnsubscribePage";

export const metadata: Metadata = {
  title: "Unsubscribe | StreamerDraft",
  // a private link: keep it out of search engines, and don't pass the
  // address (with its code) on to any site they click through to
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function Unsubscribe() {
  return <UnsubscribePage />;
}
