// src/app/privacy/page.tsx
//
// The privacy policy as its own page: /privacy
// (the words: src/components/page/Privacy.tsx)

import type { Metadata } from "next";
import { PrivacyPage } from "@/components/plain/DocPages";

export const metadata: Metadata = {
  title: "Privacy | StreamerDraft",
  description: "What StreamerDraft collects when you join, why, and your rights.",
};

export default function Privacy() {
  return <PrivacyPage />;
}
