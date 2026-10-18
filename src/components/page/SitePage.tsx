// src/components/page/SitePage.tsx
//
// WHAT THIS IS
// The StreamerDraft page the intro opens into (F2). One centred column, Apple
// style, that fits on one phone screen:
//
//   header   the logo (the intro's title docks here, then the page keeps it,
//            so it scrolls with the page: no bar floating over the top), and
//            across from it ( ● Launching soon ): it's a waitlist for now
//   hero     "Nobody's watching. Yet." + what it is
//            ( Join the draft )( Join as a scout )   side by side, the same height:
//              red for streamers (most people), grey for bigger creators
//            once they're in (either one): ( Entry pending ), one wide button for their entry
//   hub      everything live, in one place you can take in at a glance:
//            ( the voice note, as THE Dynamic Island )   VoiceNote.tsx
//            [ Road to 300 + How it works, one box ]     RoadTo300.tsx
//            (tap a box: it grows into a pop-up with more)
//   footer   one wide capsule: Competition rules, Privacy, socials, Watch live
//            (one line everywhere: on phones it scrolls sideways)    Footer.tsx
//            (the rules and privacy open as pop-ups here, so nobody has to
//            sit through the intro again to read them)
// No leaderboard: the winner's revealed live on stream, so the site never
// shows who's winning. Each person sees only their own referrals.
// Phones: one column, sized so it all fits on one screen. Wider-than-tall
// screens (from 760px) and computers: the hero on the left, the hub on the right.
//
// JOINING (F2)
// Join the draft grows into the streamer sign-up, Join as a scout into the scout
// sign-up (both JoinSheet.tsx). Once they've sent either, the two buttons
// become one, and its words follow where they're at:
//   streamer   Entry pending -> Entry confirmed
//   scout      Sign-up pending -> Scout confirmed
// (Signing up as a scout makes you a scout: there's no application to wait on.)
// While they're pending, the page keeps asking the server (entry.ts). The
// moment they confirm (here, in another tab, or on their phone), the "Check
// your email" pop-up closes by itself and a notification drops in from the
// top: they're in, now share the link (the most referrals wins).
//
// THE LOADING BOXES ARE THE PAGE ITSELF
// stage comes from the intro:
//   hidden    not showing yet
//   skeleton  loading: every part is drawn as a grey box in its real place,
//             with red lights running round the capsules and widgets
//   content   the real content takes each box's place (REVEAL in timeline.ts):
//             "Nobody's watching." -> a beat -> "Yet." slams in -> then each
//             capsule and widget fills in, one after another, each with a pop
// The lights stay on once it's loaded. The order things fill in is PAGE_ORDER
// in timeline.ts (shared with the sounds, so every pop lands on its part).

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { PAGE_ORDER, revealAt } from "@/components/launch/timeline";
import { useEntry, useEntrySync, type EntryRole, type EntryStatus } from "./entry";
import { Tick } from "./EntryParts";
import { Footer, type Doc } from "./Footer";
import { Gear } from "./Gear";
import { HangingPhones } from "./HangingPhones";
import { JoinSheet } from "./JoinSheet";
import { PrivacySheet } from "./Privacy";
import { keepReferral } from "./referral";
import { RoadTo300 } from "./RoadTo300";
import { RulesSheet } from "./Rules";
import { useBoxLights } from "./useBoxLights";
import { useStats } from "./useStats";
import { preloadUiSounds, uiSound } from "./uiSound";
import { VoiceNote } from "./VoiceNote";
import s from "./Page.module.css";
import e from "./Entry.module.css";

export type PageStage = "hidden" | "skeleton" | "content";

// --n: the order each part fills in (and fades in while loading)
const order = (n: number) => ({ "--n": n }) as CSSProperties;

// The main button's words (and icon), by role and where they're at
const PENDING_ICON = <svg viewBox="0 0 24 24" className={s.joinIcon} aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>;
const DONE_ICON = <svg viewBox="0 0 24 24" className={s.joinIcon} aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M8 12.3l2.7 2.7 5.3-5.6" /></svg>;
const JOIN: Record<EntryRole, Record<EntryStatus, { label: string; icon: ReactNode }>> = {
  prospect: {
    none: { label: "Join the draft", icon: null },
    pending: { label: "Entry pending", icon: PENDING_ICON },
    confirmed: { label: "Entry confirmed", icon: DONE_ICON },
  },
  scout: {
    none: { label: "Join the draft", icon: null }, // (not in yet: the button's always Join)
    pending: { label: "Sign-up pending", icon: PENDING_ICON },
    confirmed: { label: "Scout confirmed", icon: DONE_ICON },
  },
};
// The notification that drops in when they confirm
const TOAST: Record<EntryRole, { title: string; text: string; said: string }> = {
  prospect: {
    title: "You're in the draft",
    text: "Share your link and help us hit 300 for GTA 6.",
    said: "Entry confirmed. You're in the draft. Share your link and help us hit 300 for GTA 6.",
  },
  scout: {
    title: "You're a scout",
    text: "Share your link and help us hit 300 for GTA 6.",
    said: "Scout confirmed. You're a scout. Share your link and help us hit 300 for GTA 6.",
  },
};

type Open = "join" | "scout" | null;
const SWAP_MS = 380; // closing one pop-up before the next one grows (Sheet's shrink is 420)
const TOAST_MS = 9000;

export function SitePage({ stage, logo }: {
  stage: PageStage;
  logo?: ReactNode; // the logo (LaunchIntro passes the docked title's twin)
}) {
  const page = useRef<HTMLDivElement>(null);
  const join = useRef<HTMLButtonElement>(null);
  const scout = useRef<HTMLButtonElement>(null);
  useBoxLights(page, stage);

  const entry = useEntry();
  useEntrySync(entry);
  // Fresh numbers straight away when they confirm (they're one of the 300 now)
  const { road } = useStats(stage === "content", revealAt(PAGE_ORDER.road) + 0.35, entry.status);

  // A referral link brought them here (/r/code -> /?ref=code): pick it up (referral.ts)
  useEffect(() => keepReferral(), []);

  // The page's little sounds (uiSound.ts): fetched once the page is showing
  useEffect(() => {
    if (stage === "content") preloadUiSounds();
  }, [stage]);

  // Which sign-up pop-up is open? (the Road to 300 and voice note ones look after themselves)
  const [open, setOpen] = useState<Open>(null);
  const swap = useRef(0);
  useEffect(() => () => window.clearTimeout(swap.current), []);
  // Close whatever's open, then open `next` once it's out of the way
  const openSoon = (next: Open) => {
    window.clearTimeout(swap.current);
    setOpen(null);
    swap.current = window.setTimeout(() => setOpen(next), SWAP_MS);
  };

  // The rules or the privacy policy, as a pop-up over whatever's open (the
  // footer, the sign-up and Road to 300 can all open them), and what it grew out of
  const [doc, setDoc] = useState<Doc | null>(null);
  const docFrom = useRef<HTMLElement | null>(null);
  const openDoc = (which: Doc, from: HTMLElement) => {
    docFrom.current = from;
    setDoc(which);
  };
  const done = <button type="button" className={`${e.primary} ${e.sheetDone}`} onClick={() => setDoc(null)}><span>Done</span></button>;

  // Just confirmed (pending -> confirmed, while the page is open)? Close the
  // "Check your email" pop-up and drop the notification in.
  // (Worked out while rendering, React's way of reacting to a change in what we read.)
  const [seen, setSeen] = useState<EntryStatus>(entry.status);
  const [toast, setToast] = useState(false);
  if (entry.status !== seen) {
    setSeen(entry.status);
    if (seen === "pending" && entry.status === "confirmed" && !entry.preview) {
      setToast(true);
      if (open) setOpen(null);
    }
  }
  useEffect(() => {
    if (!toast) return;
    uiSound("success"); // the whole draft call: they're in (uiSound.ts)
    const t = window.setTimeout(() => setToast(false), TOAST_MS);
    return () => window.clearTimeout(t);
  }, [toast]);

  const joined = entry.status !== "none";
  const joinWords = JOIN[entry.role][entry.status];
  // Their entry's pop-up (once they're in, both buttons lead to it)
  const mine: Open = entry.role === "scout" ? "scout" : "join";
  const toastWords = TOAST[entry.role];

  return (
    <div ref={page} className={s.page} data-stage={stage} aria-busy={stage !== "content"}>
      {/* the streaming gear, behind everything (Gear.tsx) */}
      <Gear />
      <header className={s.header}>
        {/* exactly where the intro's title docked (same size, same spot) */}
        <span className={s.logo} role="img" aria-label="StreamerDraft">{logo}</span>
        {/* the site isn't open yet: this page is the way in early */}
        <p className={`${s.slot} ${s.slotBox} ${s.soon}`}>
          <span className={s.inside}>
            <i className={s.soonDot} aria-hidden="true" />
            <b>Launching soon</b>
            <span className={s.soonMore}>Get in before it opens</span>
          </span>
        </p>
      </header>

      <main className={s.main}>
        <section className={s.hero}>
          <h1 className={s.headline}>
            {/* .ink: the words themselves, so they can move without moving their loading box */}
            <span className={`${s.slot} ${s.slotText} ${s.line1}`}><span className={s.ink}>Nobody&apos;s watching.</span></span>
            <span className={`${s.slot} ${s.slotText} ${s.line2}`}><span className={s.ink}>Yet.</span></span>
          </h1>
          <p className={`${s.slot} ${s.slotText} ${s.sub}`} style={order(PAGE_ORDER.sub)}>
            Small streamers keep streaming as usual. Bigger creators find you, scout you, draft you and help you grow for a whole season.
          </p>

          {/* the two ways in, side by side. Once they're in: one button, for their entry */}
          <div className={s.actions} data-joined={joined || undefined}>
            <button
              ref={join}
              type="button"
              className={`${s.slot} ${s.slotBox} ${s.join}`}
              style={order(PAGE_ORDER.join)}
              data-pop={PAGE_ORDER.join}
              onClick={() => setOpen(joined ? mine : "join")}
              aria-haspopup="dialog"
              data-status={entry.status}
            >
              {/* a white light on the red button (it turns white as the button fills in) */}
              <canvas className={s.boxLight} data-box-light="" data-color="white" data-at={revealAt(PAGE_ORDER.join)} aria-hidden="true" />
              <span className={s.inside}>
                {/* key: the words swap in with a little rise when they change */}
                <span key={entry.status} className={s.joinLabel}>
                  {joinWords.icon}
                  {joinWords.label}
                </span>
              </span>
            </button>
            {!joined && (
              <button
                ref={scout}
                type="button"
                className={`${s.slot} ${s.slotBox} ${s.scout}`}
                style={order(PAGE_ORDER.scout)}
                data-pop={PAGE_ORDER.scout}
                onClick={() => setOpen("scout")}
                aria-haspopup="dialog"
              >
                <canvas className={s.boxLight} data-box-light="" aria-hidden="true" />
                <span className={s.inside}>Join as a scout</span>
              </button>
            )}
            {/* computers: the headphones hang on Join (part of the gear) */}
            <HangingPhones button={join} />
          </div>
        </section>

        {/* the hub: the voice note, then Road to 300 + How it works */}
        <section className={s.hub} aria-label="The story and the count">
          <VoiceNote n={PAGE_ORDER.voice} />
          <RoadTo300 road={road} n={PAGE_ORDER.road} onJoin={() => openSoon(joined ? mine : "join")} onDoc={openDoc} />
        </section>
      </main>

      <Footer onDoc={openDoc} barClass={`${s.slot} ${s.slotBox}`} insideClass={s.inside} style={order(PAGE_ORDER.footer)} />

      {/* The two sign-ups. Each grows out of its button; once they're in there's
          only the one button, so the scout one shrinks back into that */}
      <JoinSheet role="prospect" open={open === "join"} onClose={() => setOpen(null)} origin={join} onDoc={openDoc} />
      <JoinSheet role="scout" open={open === "scout"} onClose={() => setOpen(null)} origin={joined ? join : scout} onDoc={openDoc} />
      <RulesSheet open={doc === "rules"} onClose={() => setDoc(null)} origin={docFrom} footer={done} />
      <PrivacySheet open={doc === "privacy"} onClose={() => setDoc(null)} origin={docFrom} footer={done} />

      {/* "You're in": drops in from the top once they've confirmed (always here,
          hidden until then, so it can slide away again too) */}
      <div className={s.toast} data-show={toast || undefined}>
        <button
          type="button"
          className={s.toastIn}
          tabIndex={toast ? 0 : -1}
          onClick={() => {
            setToast(false);
            setOpen(mine);
          }}
        >
          <Tick className={s.toastTick} />
          <span className={s.toastWords}>
            <b>{toastWords.title}</b>
            <span>{toastWords.text}</span>
          </span>
          <span className={s.toastAction}>Share</span>
        </button>
      </div>
      {/* for screen readers: said once, when it drops in */}
      <p className={s.srOnly} role="status">{toast ? toastWords.said : ""}</p>
    </div>
  );
}
