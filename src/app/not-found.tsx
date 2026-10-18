// src/app/not-found.tsx
//
// Any address that doesn't exist on the site: our own page, with a way back
// (src/components/plain/DocPages.tsx), instead of the plain white default.

import type { Metadata } from "next";
import { NotFoundPage } from "@/components/plain/DocPages";

export const metadata: Metadata = {
  title: "Page not found | StreamerDraft",
  robots: { index: false },
};

export default function NotFound() {
  return <NotFoundPage />;
}
