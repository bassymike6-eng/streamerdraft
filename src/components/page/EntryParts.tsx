// src/components/page/EntryParts.tsx
//
// WHAT THIS IS
// Small pieces about someone's entry, used in more than one place (the
// "You're in" pop-up, the Road to 300 pop-up and the confirm page):
//   Eligibility    can they win? (UK residents only)
//   ReferralStats  how their own referrals are doing (only theirs: there's no
//                  public leaderboard, the winner's revealed live on stream)
//   Icon           the little line icons these use
// (The referral link itself, with Copy and Share, is ShareLink.tsx.)

import type { CSSProperties, ReactNode } from "react";
import type { Referrals } from "./entry";
import e from "./Entry.module.css";

export const CLOSES = "Mon 16 Nov";

const ICONS: Record<string, ReactNode> = {
  trophy: <><path d="M8 4h8v5a4 4 0 0 1-8 0V4z" /><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7M10 17h4" /></>,
  globe: <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.4 2.4 3.5 5.2 3.5 8.5S14.4 18.1 12 20.5M12 3.5C9.6 5.9 8.5 8.7 8.5 12s1.1 6.1 3.5 8.5" /></>,
  mail: <><rect x="3.5" y="5.5" width="17" height="13" rx="3" /><path d="M4.5 7.5l7.5 5.5 7.5-5.5" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  alert: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5v5.5" /><circle cx="12" cy="16.3" r=".6" className={e.dot} /></>,
  link: <><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3.2-3.2a4.5 4.5 0 0 0-6.4-6.4L11.8 5.8" /><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3.2 3.2a4.5 4.5 0 0 0 6.4 6.4l1.4-1.4" /></>,
  // the scout commitment: weeks, calls, a shout-out
  calendar: <><rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  phone: <><rect x="3" y="6.5" width="12.5" height="11" rx="3" /><path d="M15.5 10.5l5-3v9l-5-3" /></>,
  megaphone: <><path d="M4 10v4a1.5 1.5 0 0 0 1.5 1.5H7l9 4.5V4L7 8.5H5.5A1.5 1.5 0 0 0 4 10z" /><path d="M7 15.5l1.5 4.5M19 9.5a3 3 0 0 1 0 5" /></>,
  doc: <><path d="M7 3.5h7l4.5 4.5v10A2.5 2.5 0 0 1 16 20.5H7A2.5 2.5 0 0 1 4.5 18V6A2.5 2.5 0 0 1 7 3.5z" /><path d="M13.5 3.5V8.5h5M8.5 12.5h7M8.5 16h5" /></>,
};
export type IconName = keyof typeof ICONS;

export function Icon({ name }: { name: IconName }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true">{ICONS[name]}</svg>;
}

// The green circle with a tick (valid fields, confirmed entries)
export function Tick({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="11" className={e.tickDisc} />
      <path d="M7.2 12.4l3.1 3.1 6.5-6.8" className={e.tickMark} />
    </svg>
  );
}

// Can they win? Only UK residents can (src/lib/stats.ts: uk_eligible).
// eligible null (we can't tell yet): says nothing.
export function Eligibility({ eligible, className, style }: { eligible: boolean | null; className?: string; style?: CSSProperties }) {
  if (eligible === null) return null;
  return (
    <div className={`${e.note} ${className ?? ""}`} data-tone={eligible ? "ok" : "warn"} style={style}>
      <Icon name={eligible ? "trophy" : "globe"} />
      <div>
        <p className={e.noteTitle}>{eligible ? "You're in the running for GTA 6" : "You can't win the prize"}</p>
        <p className={e.noteText}>
          {eligible
            ? `Bring the most people in by ${CLOSES} to win: GTA 6 if we hit 300, a £25 prize if not. Revealed live on stream.`
            : "The competition's only open to UK residents. You're still in the draft, and anyone can join through your link."}
        </p>
      </div>
    </div>
  );
}

// 2 counted / 1 waiting / 0 outside the UK. Nobody else's numbers, and no
// place in a ranking: that's what keeps the stream reveal a surprise.
// (The same for streamers and scouts: both can win, F5.)
export function ReferralStats({ referrals, eligible, className, style }: {
  referrals: Referrals | null;
  eligible: boolean | null;
  className?: string;
  style?: CSSProperties;
}) {
  const r = referrals ?? { counted: 0, pending: 0, outsideUk: 0 };
  // Outside the UK: nothing to "count" towards a win. Just how many people
  // have joined through their link.
  if (eligible === false) {
    const joined = r.counted + r.pending + r.outsideUk;
    return (
      <div className={className} style={style}>
        <div className={e.tiles} data-one="">
          <p className={e.tile}><b>{joined}</b><span>{joined === 1 ? "person has joined through your link" : "people have joined through your link"}</span></p>
        </div>
        <p className={e.place}>Referrals only count towards the prize for UK residents.</p>
      </div>
    );
  }
  const place =
    r.counted > 0
      ? "Keep going: whoever has the most when it closes wins."
      : r.pending > 0
        ? "Nearly there: they count once they've confirmed their email."
        : "Share your link to get your first referral.";
  return (
    <div className={className} style={style}>
      <div className={e.tiles}>
        <p className={e.tile} data-tone="ok"><b>{r.counted}</b><span>counted</span></p>
        <p className={e.tile}><b>{r.pending}</b><span>waiting to confirm</span></p>
        <p className={e.tile}><b>{r.outsideUk}</b><span>outside the UK</span></p>
      </div>
      <p className={e.place}>{place}</p>
    </div>
  );
}
