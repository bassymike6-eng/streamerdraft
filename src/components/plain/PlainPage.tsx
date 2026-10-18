"use client";

// src/components/plain/PlainPage.tsx
//
// WHAT THIS IS
// The frame for every page that ISN'T the home page (no intro): the confirm
// page, the competition rules and the privacy policy.
//
//   StreamerDraft                (the logo: back to the home page)
//   ...the page...
//   [ © 2026  Competition rules  Privacy  ···  socials ]   (Footer.tsx)
//
// It gives them the same look as the home page: dark at night, bright in the
// day (the visitor's own clock, detect.ts, with ?look= and ?hour= still
// working), the same colours, and the red lights running round the boxes.
//
// `stage`: "skeleton" while the page is still loading what it shows (the
// confirm page checking its link), "content" once it's there.
// `onDoc`: open the rules and privacy as pop-ups from the footer, instead of
// going to their pages (the confirm page does, so you don't lose your place).

import Link from "next/link";
import { useRef, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { lookFor } from "@/components/launch/detect";
import { Footer, type Doc } from "@/components/page/Footer";
import type { PageStage } from "@/components/page/SitePage";
import { useBoxLights } from "@/components/page/useBoxLights";
import { BRAND_FONT, fontStack } from "@/lib/brand-font";
import p from "./Plain.module.css";

// The look, read once in the browser (null on the server: nothing shows until it's known)
const useLook = () => useSyncExternalStore(() => () => {}, () => lookFor(window.location.search), () => null);

export function PlainPage({ stage = "content", onDoc, wide = false, children }: {
  stage?: PageStage;
  onDoc?: (doc: Doc, from: HTMLElement) => void;
  wide?: boolean; // a wider column, for reading (the rules and privacy pages)
  children: ReactNode;
}) {
  const look = useLook();
  const root = useRef<HTMLDivElement>(null);
  useBoxLights(root, look ? stage : "hidden");

  return (
    <div
      ref={root}
      className={p.root}
      data-look={look ?? undefined}
      data-stage={stage}
      style={{ "--font-display": fontStack(BRAND_FONT) } as CSSProperties}
    >
      <header className={p.header}>
        <Link href="/" className={p.logo}>StreamerDraft</Link>
      </header>
      <main className={p.main} data-wide={wide || undefined}>{children}</main>
      <Footer onDoc={onDoc} />
    </div>
  );
}
