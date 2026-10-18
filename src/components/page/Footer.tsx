"use client";

// src/components/page/Footer.tsx
//
// WHAT THIS IS
// The footer on every page: one wide capsule, like a stretched-out Dynamic
// Island, with the red light running round it like the page's other boxes.
// Everything in it sits on ONE line, on every screen, with nothing to scroll:
//
//   computers   © 2026 StreamerDraft   Competition rules   Privacy   Sound  ···  Discord  Instagram  TikTok  X  (● Watch live)
//   phones      Rules        Privacy        (speaker)        Socials ●
//
// ON PHONES: FOUR THINGS, AND A "SOCIALS" POP-UP
// There isn't room for everything across a phone. Squashing it made it hard
// to tap, stacking it made a tall box that pushed the page off the screen, and
// sliding it sideways meant half of it was hidden. So the footer keeps the
// four things people come to a footer for (the rules, privacy, sound on /
// off), and everything to follow us by goes in one "Socials" pop-up: Watch
// live (when there's a stream link: the red dot on the button says so), each
// social, and the ©. One tap away, all in view, nothing to scroll.
//
// THE TWO PAGES
// Competition rules and Privacy open as pop-ups (Sheet.tsx) where the page can
// do that (pass `onDoc`): on the home page, so nobody has to sit through the
// intro again to get back, and on the confirm page. Everywhere else they're
// plain links to /rules and /privacy.
//
// THE SOCIALS come from src/lib/socials.ts. Any without a link are left out.
//
// SOUND: the site's sounds on or off (the intro and the page's little sounds),
// remembered on this device (soundSet.ts). A speaker, crossed out when off.

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { setSoundOn } from "@/components/launch/soundSet";
import { SOCIALS, STREAM } from "@/lib/socials";
import { Sheet, sheetOrder, slot } from "./Sheet";
import { uiSound, unlockUiSound, useSoundOn } from "./uiSound";
import f from "./Footer.module.css";

export type Doc = "rules" | "privacy";
// (short: what it says on a phone, where every centimetre counts)
const DOCS: { doc: Doc; label: string; short: string; href: string }[] = [
  { doc: "rules", label: "Competition rules", short: "Rules", href: "/rules" },
  { doc: "privacy", label: "Privacy", short: "Privacy", href: "/privacy" },
];
const YEAR = new Date().getFullYear();

// The little "opens somewhere else" arrow on the social links
const OUT = <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5h6.5V10M12.5 3.5 4 12" /></svg>;

// A speaker: with sound waves when on, crossed out when off
function SpeakerIcon({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M3.5 7.5h3l4-3.5v12l-4-3.5h-3z" />
      {on ? <path d="M13.5 7.2a4 4 0 0 1 0 5.6M15.6 5a7 7 0 0 1 0 10" /> : <path d="M13.5 7.5l5 5M18.5 7.5l-5 5" />}
    </svg>
  );
}

export function Footer({ onDoc, barClass = "", insideClass = "", style }: {
  onDoc?: (doc: Doc, from: HTMLElement) => void; // open as a pop-up (else: links to the pages)
  barClass?: string; // e.g. the home page's loading-box classes, so it loads in with the page
  insideClass?: string;
  style?: CSSProperties;
}) {
  const socials = SOCIALS.filter((link) => link.href);
  const hasSocials = socials.length > 0 || !!STREAM.href; // (phones: the Socials pop-up)
  const [socialsOpen, setSocialsOpen] = useState(false);
  const socialsButton = useRef<HTMLButtonElement>(null);
  const row = useRef<HTMLDivElement>(null);
  const soundOn = useSoundOn();
  const toggleSound = (from: HTMLElement) => {
    if (soundOn) {
      uiSound("tick-off", from); // (the last sound before it goes quiet)
      setSoundOn(false);
    } else {
      setSoundOn(true);
      unlockUiSound();
      uiSound("tick-on", from);
    }
  };

  // Is there more to see to the left / right? (fades that edge: Footer.module.css)
  useEffect(() => {
    const el = row.current;
    if (!el) return;
    const check = () => {
      const max = el.scrollWidth - el.clientWidth;
      el.toggleAttribute("data-more-before", el.scrollLeft > 2);
      el.toggleAttribute("data-more-after", el.scrollLeft < max - 2);
    };
    check();
    el.addEventListener("scroll", check, { passive: true });
    const sized = new ResizeObserver(check);
    sized.observe(el);
    return () => {
      el.removeEventListener("scroll", check);
      sized.disconnect();
    };
  }, []);

  const copy = `© ${YEAR} StreamerDraft`;
  return (
    <footer className={f.footer}>
      <div className={`${barClass} ${f.bar}`} style={style}>
        {/* the red light round it (useBoxLights.ts) */}
        <canvas className={f.light} data-box-light="" aria-hidden="true" />
        {/* (two layers: the page's fill-in class on the outer one, our layout on the inner) */}
        <div className={insideClass}>
          <div className={f.inside}>
            {/* the one line */}
            <div ref={row} className={f.row} data-copy-inline={hasSocials ? undefined : ""}>
              {/* on computers, at the far end (on phones it's in the Socials pop-up) */}
              {STREAM.href && (
                <a className={f.live} href={STREAM.href} target="_blank" rel="noopener noreferrer">
                  <i aria-hidden="true" />
                  {STREAM.label}
                </a>
              )}

              <nav className={f.docs} aria-label="Competition rules and privacy">
                {DOCS.map(({ doc, label, short, href }) => {
                  const words = (
                    <>
                      <span className={f.long}>{label}</span>
                      <span className={f.short}>{short}</span>
                    </>
                  );
                  return onDoc ? (
                    <button key={doc} type="button" className={f.link} onClick={(ev) => onDoc(doc, ev.currentTarget)} aria-haspopup="dialog" aria-label={label}>
                      {words}
                    </button>
                  ) : (
                    <Link key={doc} href={href} className={f.link} aria-label={label}>{words}</Link>
                  );
                })}
              </nav>

              <button type="button" className={`${f.link} ${f.sound}`} onClick={(ev) => toggleSound(ev.currentTarget)} aria-pressed={soundOn} title={soundOn ? "Turn sound off" : "Turn sound on"}>
                <SpeakerIcon on={soundOn} />
                <span className={f.soundWord}>Sound</span>
              </button>

              {/* phones only: everything to follow us by, in a pop-up */}
              {hasSocials && (
                <button
                  ref={socialsButton}
                  type="button"
                  className={`${f.link} ${f.socialsButton}`}
                  onClick={() => setSocialsOpen(true)}
                  aria-haspopup="dialog"
                  aria-label={STREAM.href ? "Socials and the live stream" : undefined}
                >
                  Socials
                  {STREAM.href && <i className={f.liveDot} aria-hidden="true" />}
                </button>
              )}

              {socials.length > 0 && (
                <nav className={f.socials} aria-label="StreamerDraft on social media">
                  <i className={f.divider} aria-hidden="true" />
                  {socials.map((link) => (
                    <a key={link.label} className={f.link} href={link.href} target="_blank" rel="noopener noreferrer">
                      {link.label}
                      {OUT}
                    </a>
                  ))}
                </nav>
              )}

              {/* first on computers (Footer.module.css); on phones it's in the Socials pop-up */}
              <p className={f.copy}>{copy}</p>
            </div>
          </div>
        </div>
      </div>

      {hasSocials && (
        <Sheet
          open={socialsOpen}
          onClose={() => setSocialsOpen(false)}
          origin={socialsButton}
          title="Socials"
          subtitle="Follow us for news and the road to 300."
        >
          <div className={f.sheet}>
            {STREAM.href && (
              <a className={`${slot.box} ${f.sheetLive}`} style={sheetOrder(1)} href={STREAM.href} target="_blank" rel="noopener noreferrer">
                <i aria-hidden="true" />
                {STREAM.label}
              </a>
            )}
            {socials.length > 0 && (
              <ul className={`${slot.box} ${f.sheetGroup}`} style={sheetOrder(2)}>
                {socials.map((link) => (
                  <li key={link.label}>
                    <a className={f.sheetRow} href={link.href} target="_blank" rel="noopener noreferrer">
                      {link.label}
                      {OUT}
                    </a>
                  </li>
                ))}
              </ul>
            )}
            <p className={`${slot.text} ${f.sheetCopy}`} style={sheetOrder(3)}>{copy}</p>
          </div>
        </Sheet>
      )}
    </footer>
  );
}
