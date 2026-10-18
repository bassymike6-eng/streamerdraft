"use client";

// src/components/admin/parts.tsx
//
// WHAT THIS IS
// Small pieces the admin dashboard's tabs share:
//   Icon          line icons (same 24px grid as the rest of the site)
//   Card          a box with a title
//   Pill          a little label with a coloured dot (never colour alone:
//                 there's always a word too)
//   PersonPills   who someone is at a glance: streamer or scout, confirmed,
//                 disqualified, red flags, scouts checked or turned down
//   PersonButton  one person in a list: tap to open their details
//   OutLink       a link from someone's answers (their channel), opens in a new tab
//   Loading / Problem   while it loads, and if it didn't

import type { ReactNode } from "react";
import { COLOURS } from "./charts";
import { useTools, type Person, type ShortPerson } from "./data";
import { dateTime, flagsOf, roleAndNumber } from "./labels";
import a from "./Admin.module.css";

const ICONS = {
  overview: <><path d="M4 19.5h16" /><path d="M6.5 16v-5M11 16V6.5M15.5 16v-7.5M20 16v-3" /></>,
  people: <><circle cx="9" cy="8.5" r="3.2" /><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" /><path d="M15.5 5.6a3.2 3.2 0 0 1 0 6M17.5 14.3c1.7.6 2.7 2.2 3 4.7" /></>,
  scouts: <><circle cx="7" cy="14.5" r="3.5" /><circle cx="17" cy="14.5" r="3.5" /><path d="M10.5 14.5h3M5 11.5l2-6h2.5M19 11.5l-2-6h-2.5" /></>,
  trophy: <><path d="M8 4h8v5a4 4 0 0 1-8 0V4z" /><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7M10 17h4" /></>,
  flag: <><path d="M5.5 20.5V4.5" /><path d="M5.5 5c4-2 7 2 13 0v8c-6 2-9-2-13 0" /></>,
  search: <><circle cx="10.5" cy="10.5" r="6" /><path d="M15 15l5 5" /></>,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  download: <><path d="M12 4v11M7.5 10.5L12 15l4.5-4.5" /><path d="M5 19.5h14" /></>,
  external: <><path d="M14 4.5h5.5V10M19.5 4.5L11 13" /><path d="M17 14v3.5A2 2 0 0 1 15 19.5H6.5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2H10" /></>,
  check: <path d="M5.5 12.5l4.2 4.2 8.8-9.2" />,
  alert: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5v5.5M12 16.3v.2" /></>,
  logout: <><path d="M14 4.5H7A2.5 2.5 0 0 0 4.5 7v10A2.5 2.5 0 0 0 7 19.5h7" /><path d="M11 12h9.5M17 8.5l3.5 3.5-3.5 3.5" /></>,
  copy: <><rect x="8.5" y="8.5" width="11" height="11" rx="2.5" /><path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" /></>,
  chevron: <path d="M9.5 6l6 6-6 6" />,
  back: <path d="M14.5 6l-6 6 6 6" />,
};
export type IconName = keyof typeof ICONS;

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return <svg viewBox="0 0 24 24" className={`${a.icon} ${className ?? ""}`} aria-hidden="true">{ICONS[name]}</svg>;
}

export function Card({ title, sub, action, children, className, wide }: {
  title?: ReactNode;
  sub?: ReactNode; // a line under the title: who's counted ("Streamers only")
  action?: ReactNode; // top right: a button or a switch
  children: ReactNode;
  className?: string;
  wide?: boolean; // the whole row
}) {
  return (
    <section className={`${a.card} ${className ?? ""}`} data-wide={wide || undefined}>
      {(title || action) && (
        <header className={a.cardHead}>
          <div>
            {title && <h2 className={a.cardTitle}>{title}</h2>}
            {sub && <div className={a.cardSub}>{sub}</div>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export type Tone = "ok" | "wait" | "bad" | "flag" | "streamer" | "scout" | "plain";

export function Pill({ tone = "plain", children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  const dot = tone === "streamer" ? COLOURS.streamers : tone === "scout" ? COLOURS.scouts : undefined;
  return (
    <span className={a.pill} data-tone={tone} title={title}>
      {tone === "flag" ? <Icon name="flag" /> : <i style={dot ? { background: dot } : undefined} aria-hidden="true" />}
      {children}
    </span>
  );
}

// Who someone is, at a glance
export function PersonPills({ person, role = true }: { person: Person; role?: boolean }) {
  const flags = flagsOf(person);
  return (
    <span className={a.pills}>
      {role && <Pill tone={person.role === "scout" ? "scout" : "streamer"}>{roleAndNumber(person)}</Pill>}
      {person.disqualified ? (
        <Pill tone="bad">Disqualified</Pill>
      ) : person.confirmed ? (
        <Pill tone="ok">Confirmed</Pill>
      ) : (
        <Pill tone="wait">Not confirmed yet</Pill>
      )}
      {person.role === "scout" && (person.scoutTurnedDown
        ? <Pill tone="bad">Turned down</Pill>
        : person.scoutChecked ? <Pill tone="ok">Checked</Pill> : <Pill>New</Pill>)}
      {flags.length > 0 && (
        <Pill tone="flag" title={flags.map((f) => f.name).join(", ")}>
          {flags.length === 1 ? flags[0].name : `${flags.length} flags`}
        </Pill>
      )}
    </span>
  );
}

// One person in a list (Flags, someone's recruits...): tap to open them
export function PersonButton({ person, extra }: { person: ShortPerson; extra?: ReactNode }) {
  const { openPerson } = useTools();
  return (
    <button type="button" className={a.personButton} onClick={() => openPerson(person.id)}>
      <span className={a.personWords}>
        <b>{person.displayName}</b>
        <span>{person.email}</span>
      </span>
      <span className={a.personMeta}>
        {extra}
        {!extra && <span>{person.role === "scout" ? "Scout" : "Streamer"}, {person.confirmed ? "confirmed" : "not confirmed"}</span>}
        <span className={a.faint}>{dateTime(person.createdAt)}</span>
      </span>
      <Icon name="chevron" className={a.chev} />
    </button>
  );
}

// A web link from their answers, only if it really is one (http or https)
function safeUrl(text: string | null | undefined): string | null {
  if (!text) return null;
  const withScheme = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(withScheme);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

export function OutLink({ href }: { href: string | null | undefined }) {
  const url = safeUrl(href);
  if (!url) return <span>{href}</span>;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={a.outLink}>
      {url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
      <Icon name="external" />
    </a>
  );
}

export function Loading({ rows = 3 }: { rows?: number }) {
  return (
    <div className={a.loading} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => <span key={i} style={{ animationDelay: `${i * 0.08}s` }} />)}
    </div>
  );
}

export function Problem({ text }: { text: string }) {
  return (
    <p className={a.problem} role="alert"><Icon name="alert" />{text}</p>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className={a.empty}>{children}</p>;
}
