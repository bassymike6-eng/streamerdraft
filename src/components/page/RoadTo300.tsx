// src/components/page/RoadTo300.tsx
//
// WHAT THIS IS
// Road to 300 and How it works, together in one box under the voice note.
// The box keeps it to the essentials:
//   ● Road to 300                    [See more]
//   47 /300            At 300, top referrer wins GTA 6
//   [=======-----------------------------]
//   ((•)) Stream    ◎ Get scouted    ↗ Grow
// Tap it and the box itself grows into a pop-up (Sheet.tsx) with a little more:
//   - the count, how many to go and when it closes
//   - YOUR entry: not in yet / pending (confirm your email) / confirmed,
//     with your referral link once you're confirmed (entry.ts)
//   - the three steps, a line each
//
// The count comes from /api/stats (src/lib/stats.ts, via useStats.ts): the
// streamers who've CONFIRMED their entry. It's asked for when the page's
// content loads in, then every 30 seconds. When it arrives, the track fills and
// the number counts up to it (and on from there when it changes). If it can't
// be fetched, it shows a dash and an empty track, rather than a wrong number.
// "Top referrer": whoever brings the most people in with their link wins. If
// we hit 300 by the close, that's GTA 6; if not, a £25 prize (the rules).

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { prefersReducedMotion } from "@/components/launch/detect";
import { useEntry, type Entry } from "./entry";
import { CLOSES } from "./EntryParts";
import type { Doc } from "./Footer";
import { Sheet, sheetOrder, slot } from "./Sheet";
import { ShareLink } from "./ShareLink";
import type { Road } from "./useStats";
import s from "./Page.module.css";
import e from "./Entry.module.css";

export type { Road } from "./useStats";
const order = (n: number) => ({ "--n": n }) as CSSProperties;

// How it works: the three steps (a word each in the box, a line each in the pop-up)
const STEPS: { short: string; title: string; text: string; icon: ReactNode }[] = [
  {
    short: "Stream",
    title: "Stream as usual",
    text: "Your platform, your schedule, your style.",
    icon: <><circle cx="12" cy="12" r="2.4" /><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14" /></>,
  },
  {
    short: "Get scouted",
    title: "Get scouted",
    text: "Bigger creators pick the talent they rate and draft you.",
    icon: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  },
  {
    short: "Grow",
    title: "Grow all season",
    text: "Feedback calls and a boost to their audience, the whole way.",
    icon: <><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></>,
  },
];

// Counts up to `target`: from 0 the first time, then on from wherever it is
// (quick at first, settling at the end)
function useCountUp(target: number | null, seconds = 1.1) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (target === null) return;
    const start = performance.now();
    const begin = from.current;
    const length = prefersReducedMotion() ? 0 : seconds * Math.min(1, 0.35 + Math.abs(target - begin) / 40);
    let frame = 0;
    const tick = (now: number) => {
      const t = length > 0 ? Math.min(1, (now - start) / 1000 / length) : 1;
      const value = Math.round(begin + (target - begin) * (1 - Math.pow(1 - t, 3)));
      from.current = value;
      setShown(value);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, seconds]);
  return shown;
}

// how full the track is (at least a sliver once anyone's in, so it's visible)
const shareOf = (count: number, goal: number) => (count > 0 ? Math.max(0.03, Math.min(1, count / goal)) : 0);

// ---- Your entry: the little status label in the box, and its icon ----
const STATUS_WORDS: Record<Entry["status"], Record<Entry["role"], string>> = {
  none: { prospect: "", scout: "" },
  pending: { prospect: "Entry pending", scout: "Sign-up pending" },
  confirmed: { prospect: "Entry confirmed", scout: "Scout confirmed" },
};

function StatusIcon({ status }: { status: Entry["status"] }) {
  if (status === "confirmed") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" className={s.iconFill} /><path d="M7.5 12.4l3 3 6-6.4" className={s.iconTick} /></svg>;
  }
  if (status === "pending") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.2" /><path d="M12 7.2V12l3.2 2" /></svg>;
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.2" strokeDasharray="3 3.2" /></svg>;
}

export function RoadTo300({ road, n, onJoin, onDoc }: {
  road: Road;
  n: number;
  onJoin?: () => void;
  onDoc?: (doc: Doc, from: HTMLElement) => void; // "Competition rules" (opens over this pop-up)
}) {
  const box = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const entry = useEntry();
  const known = road && road !== "failed" ? road : null;
  const shown = useCountUp(known ? known.count : null);
  const goal = known?.goal ?? 300;
  const share = known ? shareOf(known.count, goal) : 0;
  const status = STATUS_WORDS[entry.status][entry.role];

  return (
    <>
      <button
        ref={box}
        type="button"
        className={`${s.slot} ${s.slotBox} ${s.liveBox}`}
        style={order(n)}
        data-pop={n}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={`Road to ${goal}: ${known ? `${known.count} of ${goal} people in` : "the count"}. At ${goal}, the top referrer wins GTA 6. See more, and how it works.`}
      >
        <canvas className={s.boxLight} data-box-light="" aria-hidden="true" />
        <span className={`${s.inside} ${s.liveIn}`} aria-hidden="true">
          <span className={s.liveTop}>
            <span className={s.liveName}>
              <span className={s.liveDot} />
              Road to {goal}
            </span>
            <span className={s.more}>
              See more
              <svg viewBox="0 0 16 16"><path d="M9.5 2.5h4v4M13.5 2.5L9 7M6.5 13.5h-4v-4M2.5 13.5L7 9" /></svg>
            </span>
          </span>
          <span className={s.liveCount}>
            <span className={s.roadNumber} data-failed={road === "failed" || undefined}>
              {road === "failed" ? "–" : shown}
              <small>/{goal}</small>
            </span>
            {status ? (
              <span className={s.liveStatus} data-status={entry.status}>
                <StatusIcon status={entry.status} />
                {status}
              </span>
            ) : (
              <span className={s.livePrize}>At {goal}, top referrer wins GTA&nbsp;6</span>
            )}
          </span>
          <span className={s.roadTrack}>
            <span className={s.roadFill} style={{ "--share": share } as CSSProperties} />
          </span>
          <span className={s.liveSteps}>
            {STEPS.map((step) => (
              <span key={step.short}>
                <svg viewBox="0 0 24 24">{step.icon}</svg>
                {step.short}
              </span>
            ))}
          </span>
        </span>
      </button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        origin={box}
        ready={road !== null}
        title={`Road to ${goal}`}
        subtitle={`Hit ${goal} by ${CLOSES} and the top referrer wins GTA 6. Under ${goal}, it's a £25 prize. Revealed live on stream.`}
      >
        <RoadDetails
          road={road}
          entry={entry}
          onJoin={() => {
            setOpen(false);
            onJoin?.();
          }}
          onRules={(from) => onDoc?.("rules", from)}
        />
      </Sheet>
    </>
  );
}

// ---- The pop-up's insides ----
function RoadDetails({ road, entry, onJoin, onRules }: { road: Road; entry: Entry; onJoin: () => void; onRules: (from: HTMLElement) => void }) {
  const known = road && road !== "failed" ? road : null;
  const goal = known?.goal ?? 300;
  const scout = entry.role === "scout";
  const counted = entry.referrals?.counted ?? 0;

  const words = {
    none: { title: "You're not in yet", text: `Join to get your own referral link. Whoever brings the most people in by ${CLOSES} wins.` },
    pending: { title: scout ? "Sign-up pending" : "Entry pending", text: `Confirm your email to lock your entry in. We sent it to ${entry.email ?? "your inbox"} (check spam too).` },
    confirmed: entry.eligible === false
      ? { title: scout ? "Scout confirmed" : "Entry confirmed", text: `You're in${scout ? " as a scout" : " the draft"}. The prize is for UK residents only, but anyone can join through your link.` }
      : { title: scout ? "Scout confirmed" : "Entry confirmed", text: `You're in. ${counted === 1 ? "1 referral counted" : `${counted} referrals counted`} so far: the more people you bring in, the better your chance of winning.` },
  }[entry.status];

  return (
    <div className={s.details}>
      {/* the count */}
      <section className={`${slot.box} ${s.card}`} style={sheetOrder(2)} aria-label="The count">
        <div className={s.cardIn}>
          <p className={s.bigCount}>
            {road === "failed" ? "–" : known ? known.count : 0}
            <small>/{goal}</small>
          </p>
          <p className={s.cardLabel}>streamers and scouts confirmed so far</p>
          <span className={`${s.roadTrack} ${s.roadTrackBig}`} aria-hidden="true">
            <span className={s.roadFill} style={{ "--share": known ? shareOf(known.count, goal) : 0 } as CSSProperties} />
          </span>
          <p className={s.cardFoot}>
            <span>{known ? `${Math.max(0, goal - known.count)} to go` : " "}</span>
            <span>Closes {CLOSES}</span>
          </p>
        </div>
      </section>

      {/* your entry */}
      <section aria-label="Your entry">
        <h3 className={`${slot.text} ${s.detailsHead}`} style={sheetOrder(3)}>Your entry</h3>
        <div className={`${slot.box} ${s.card}`} style={sheetOrder(4)}>
          <div className={s.cardIn}>
            <div className={s.entryRow} data-status={entry.status}>
              <StatusIcon status={entry.status} />
              <div>
                <p className={s.entryTitle}>{words.title}</p>
                <p className={s.entryText}>{words.text}</p>
              </div>
            </div>
            {entry.status === "none" && (
              <button type="button" className={s.cardButton} onClick={onJoin}>Join the draft</button>
            )}
            {entry.status === "pending" && (
              <button type="button" className={s.cardButton} onClick={onJoin}>Check your email</button>
            )}
            {entry.status === "confirmed" && entry.code && (
              <div className={`${e.view} ${s.entryShare}`}>
                <ShareLink code={entry.code} />
                <button type="button" className={`${e.quiet} ${s.entryMore}`} onClick={onJoin}><span>Your referrals</span></button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* how it works */}
      <section aria-label="How it works">
        <h3 className={`${slot.text} ${s.detailsHead}`} style={sheetOrder(5)}>How it works</h3>
        <ol className={s.stepList}>
          {STEPS.map((step, i) => (
            <li key={step.title} className={s.stepRow}>
              <span className={`${slot.box} ${s.stepIcon}`} style={sheetOrder(6 + i)} aria-hidden="true">
                <svg viewBox="0 0 24 24">{step.icon}</svg>
              </span>
              <span className={`${slot.text} ${s.stepWords}`} style={sheetOrder(6 + i)}>
                <b>{step.title}</b>
                {step.text}
              </span>
            </li>
          ))}
        </ol>
      </section>

      {/* the full rules, over this pop-up */}
      <button type="button" className={`${slot.box} ${e.secondary} ${s.rulesLink}`} style={sheetOrder(9)} onClick={(ev) => onRules(ev.currentTarget)} aria-haspopup="dialog">
        <span>Competition rules</span>
      </button>
    </div>
  );
}
