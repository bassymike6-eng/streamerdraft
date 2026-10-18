// src/app/confirm/page.tsx
//
// The page the confirmation email's button opens: /confirm?token=...
// Everything happens in the browser (src/components/confirm/ConfirmPage.tsx):
// it reads the token from the address, checks it, shows the rules and the
// Confirm button. This file just gives the page its title.

import type { Metadata } from "next";
import { ConfirmPage } from "@/components/confirm/ConfirmPage";

export const metadata: Metadata = {
  title: "Confirm your entry | StreamerDraft",
  // a private link: keep it out of search engines, and don't pass the
  // address (with its token) on to any site they click through to
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function Confirm() {
  return <ConfirmPage />;
}
