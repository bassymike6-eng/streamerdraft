// src/app/rules/page.tsx
//
// The competition rules as their own page: /rules
// (the words: src/components/page/Rules.tsx)

import type { Metadata } from "next";
import { RulesPage } from "@/components/plain/DocPages";

export const metadata: Metadata = {
  title: "Competition rules | StreamerDraft",
  description: "The rules of the StreamerDraft GTA 6 referral competition.",
};

export default function Rules() {
  return <RulesPage />;
}
