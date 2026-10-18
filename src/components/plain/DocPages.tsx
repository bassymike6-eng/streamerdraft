"use client";

// src/components/plain/DocPages.tsx
//
// WHAT THIS IS
// The competition rules and the privacy policy as their own pages:
//   /rules     src/app/rules/page.tsx
//   /privacy   src/app/privacy/page.tsx
// and the page for an address that doesn't exist (src/app/not-found.tsx).
// for anyone who wants to read them again, and for linking to from emails.
// On the home page they open as pop-ups instead (the footer), so nobody has to
// sit through the intro again. The words themselves live in one place each:
// src/components/page/Rules.tsx and src/components/page/Privacy.tsx.

import Link from "next/link";
import type { ReactNode } from "react";
import { PrivacyContent } from "@/components/page/Privacy";
import { RulesContent } from "@/components/page/Rules";
import e from "@/components/page/Entry.module.css";
import { PlainPage } from "./PlainPage";
import p from "./Plain.module.css";

function DocPage({ title, lead, children }: { title: string; lead: string; children: ReactNode }) {
  return (
    <PlainPage wide>
      <article className={p.doc}>
        <h1 className={p.docTitle}>{title}</h1>
        <p className={p.docLead}>{lead}</p>
        <div className={p.docBody}>{children}</div>
        <Link href="/" className={`${e.secondary} ${p.docBack}`}><span>Back to StreamerDraft</span></Link>
      </article>
    </PlainPage>
  );
}

export function RulesPage() {
  return (
    <DocPage title="Competition rules" lead="The GTA 6 referral competition: who can enter, how to win, and how the winner's picked.">
      <RulesContent />
    </DocPage>
  );
}

export function PrivacyPage() {
  return (
    <DocPage title="Privacy" lead="What we collect when you join StreamerDraft, why, who else handles it, and your rights.">
      <PrivacyContent />
    </DocPage>
  );
}

// An address that doesn't exist (an old link, or a typo): instead of the
// framework's plain white "404" page, our own, with a way back
export function NotFoundPage() {
  return (
    <PlainPage>
      <article className={p.doc}>
        <h1 className={p.docTitle}>This page isn&apos;t here</h1>
        <p className={p.docLead}>The link might be old, or have a typo in it.</p>
        <Link href="/" className={`${e.primary} ${p.docBack}`}><span>Go to StreamerDraft</span></Link>
      </article>
    </PlainPage>
  );
}
