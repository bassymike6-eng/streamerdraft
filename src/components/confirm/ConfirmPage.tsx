"use client";

// src/components/confirm/ConfirmPage.tsx
//
// WHAT THIS IS
// The page the confirmation email's button opens: /confirm?token=...
//
//   loading     "is this link OK?" (GET /api/confirm), grey loading shapes
//   ready       Hey Alice, confirm your entry:
//                 [ Competition rules ]     opens the rules (their own pop-up,
//                                           growing out of this box)
//                 [ ] I've read and accept  can't be ticked until they've
//                     the competition rules opened the rules
//                 [ Confirm my entry ]      can't be pressed until it's ticked
//   done        Entry #47 confirmed: in the UK or not (only UK residents can
//               win), their referral link with Copy and Share
//   expired / invalid / error   what happened, and what to do
//
// The red light that runs round the page's boxes runs round the NEXT thing to
// do: the rules first, then (once they've opened them) the Confirm button.
// (Opening the rules from the footer counts too.)
//
// The look, header and footer come from PlainPage (src/components/plain), the
// frame every page without the intro shares.
//
// ONCE THEY'RE CONFIRMED
// We save it in this browser (entry.ts: saveConfirmed), so if they've got the
// site open in another tab, it updates there straight away: the "Check your
// email" pop-up closes and the "You're in" notification drops in. (On another
// device, that tab notices within a few seconds by asking the server.)

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { saveConfirmed } from "@/components/page/entry";
import { Eligibility, Icon, Tick } from "@/components/page/EntryParts";
import type { Doc } from "@/components/page/Footer";
import { PrivacySheet } from "@/components/page/Privacy";
import { RulesSheet } from "@/components/page/Rules";
import { DraftCard } from "@/components/page/DraftCard";
import { ShareLink } from "@/components/page/ShareLink";
import { uiSound, unlockUiSound } from "@/components/page/uiSound";
import { PlainPage } from "@/components/plain/PlainPage";
import e from "@/components/page/Entry.module.css";
import c from "./Confirm.module.css";

type Role = "prospect" | "scout";
type Done = { status: "confirmed" | "already_confirmed"; role: Role; number: number; displayName: string; email: string; referralCode: string; ukEligible: boolean };
type View =
  | { kind: "loading" }
  | { kind: "ready"; role: Role; displayName: string }
  | { kind: "done"; done: Done }
  | { kind: "problem"; title: string; text: string };

const tokenFromUrl = () => new URLSearchParams(window.location.search).get("token") ?? "";

// Saves it in this browser (and tells any open tab of the site)
const remember = (done: Done) =>
  saveConfirmed({
    token: tokenFromUrl(), // this device's key, if it's not the one they joined from
    email: done.email,
    role: done.role,
    name: done.displayName,
    number: done.number,
    code: done.referralCode,
    eligible: done.ukEligible,
  });

const PROBLEMS: Record<string, { title: string; text: string }> = {
  expired: { title: "This link has expired", text: "Links work for 48 hours. Join again with the same email and we'll send you a fresh one." },
  invalid: { title: "This link doesn't work", text: "It may be an old one: if you asked for another email, use the link in the newest one. Or join again with the same email for a fresh link." },
  error: { title: "Something went wrong on our side", text: "Your link's probably fine. Refresh the page in a moment." },
  offline: { title: "Couldn't reach StreamerDraft", text: "Check your connection, then refresh the page." },
};

export function ConfirmPage() {
  const [view, setView] = useState<View>({ kind: "loading" });
  // The rules or the privacy policy, open as a pop-up, and what it grew out of
  // (the rules box, or the link in the footer)
  const [doc, setDoc] = useState<Doc | null>(null);
  const docFrom = useRef<HTMLElement | null>(null);
  const [rulesSeen, setRulesSeen] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<{ title: string; text: string } | null>(null);

  const openDoc = (which: Doc, from: HTMLElement) => {
    docFrom.current = from;
    setDoc(which);
    if (which === "rules") setRulesSeen(true); // opened the rules: now they can tick
  };

  const finish = (done: Done) => {
    setView({ kind: "done", done });
    remember(done);
  };

  // Is the link OK? (looking only: nothing's confirmed until they press the button)
  useEffect(() => {
    const token = tokenFromUrl();
    if (!token) {
      // (a moment later, so it's an answer arriving, like the others)
      const t = window.setTimeout(() => setView({ kind: "problem", ...PROBLEMS.invalid }), 0);
      return () => window.clearTimeout(t);
    }
    let cancelled = false;
    fetch(`/api/confirm?token=${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (cancelled) return;
        if (data?.ok && data.status === "ready") setView({ kind: "ready", role: data.role, displayName: data.displayName });
        else if (data?.ok && data.status === "already_confirmed") {
          setView({ kind: "done", done: data });
          remember(data);
        }
        else setView({ kind: "problem", ...(PROBLEMS[data?.status] ?? PROBLEMS.error) });
      })
      .catch(() => !cancelled && setView({ kind: "problem", ...PROBLEMS.offline }));
    return () => {
      cancelled = true;
    };
  }, []);

  const confirm = async (event: FormEvent) => {
    event.preventDefault();
    if (view.kind !== "ready" || busy) return;
    if (!accepted) return; // (everyone accepts the rules: scouts can win too)
    unlockUiSound(); // (this tap allows the "you're in" sound once the server answers)
    setBanner(null);
    setBusy(true);
    try {
      const response = await fetch("/api/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: tokenFromUrl(), rulesAccepted: accepted }),
      });
      const data = await response.json().catch(() => null);
      if (data?.ok) {
        finish(data);
        uiSound("success"); // the whole draft call (uiSound.ts)
        return;
      }
      uiSound("error");
      if (data?.status === "expired" || data?.status === "invalid") setView({ kind: "problem", ...PROBLEMS[data.status] });
      else if (data?.status === "rules_required") setBanner({ title: "Tick the box first", text: data.error });
      else if (response.status === 429) setBanner({ title: "Too many tries", text: "Give it a few minutes, then try again." });
      else setBanner({ title: "Something went wrong on our side", text: "Try again in a moment." });
    } catch {
      uiSound("error");
      setBanner({ title: "Couldn't reach StreamerDraft", text: "Check your connection, then try again." });
    } finally {
      setBusy(false);
    }
  };

  // what the running light goes round: the next thing to do
  const next = view.kind !== "ready" ? null : rulesSeen ? "button" : "rules";

  return (
    <PlainPage stage={view.kind === "loading" ? "skeleton" : "content"} onDoc={openDoc}>
      {view.kind === "loading" && (
        <div className={c.skeleton} aria-busy="true" aria-label="Loading">
          <span className={c.skLine} style={{ width: "34%" }} />
          <span className={c.skTitle} />
          <span className={c.skLine} />
          <span className={c.skLine} style={{ width: "72%" }} />
          <span className={c.skBox} />
          <span className={c.skBox} />
          <span className={c.skButton} />
        </div>
      )}

      {view.kind === "ready" && (
        <form className={`${e.view} ${c.panel}`} onSubmit={confirm} noValidate>
          <p className={c.hello}>Hey {view.displayName},</p>
          <h1 className={c.title}>Confirm your entry</h1>
          <p className={c.lead}>
            Read the competition rules, tick the box and you&apos;re in{view.role === "scout" ? " as a scout" : ""}. Your referral link comes straight after.
          </p>

          <>
              <button
                type="button"
                className={c.rulesBox}
                onClick={(ev) => openDoc("rules", ev.currentTarget)}
                aria-haspopup="dialog"
              >
                <canvas className={c.light} data-box-light="" data-on={next === "rules" || undefined} aria-hidden="true" />
                <span className={c.rulesIcon}><Icon name="doc" /></span>
                <span className={c.rulesWords}>
                  <b>Competition rules</b>
                  <span>{rulesSeen ? "Opened. Tap to read them again." : "Ten short rules. Open them to tick the box."}</span>
                </span>
                {rulesSeen ? <Tick className={c.rulesTick} /> : <span className={c.read}>Read</span>}
              </button>

              <label className={`${e.checks} ${c.accept}`} data-locked={!rulesSeen || undefined}>
                <span className={e.check}>
                  <input
                    type="checkbox"
                    checked={accepted}
                    disabled={!rulesSeen}
                    onChange={(ev) => setAccepted(ev.target.checked)}
                    aria-describedby="accept-hint"
                  />
                  <span className={e.box} aria-hidden="true">
                    <svg viewBox="0 0 24 24"><path d="M6.5 12.5l3.6 3.6 7.4-8" /></svg>
                  </span>
                  <span className={e.checkText}>
                    I&apos;ve read and accept the competition rules
                    <small id="accept-hint">{rulesSeen ? "Including: UK residents only can win, one entry each, closes Mon 16 Nov." : "Open the rules first, then you can tick this."}</small>
                  </span>
                </span>
              </label>
          </>

          {banner && (
            <div className={e.banner} role="alert">
              <Icon name="alert" />
              <div>
                <p className={e.bannerTitle}>{banner.title}</p>
                <p className={e.bannerText}>{banner.text}</p>
              </div>
            </div>
          )}

          <button type="submit" className={`${e.primary} ${e.submit} ${c.confirm}`} disabled={busy || !accepted} aria-busy={busy}>
            <canvas className={c.light} data-box-light="" data-color="white" data-on={next === "button" || undefined} aria-hidden="true" />
            <span>
              {busy && <i className={e.spinner} aria-hidden="true" />}
              {busy ? "Confirming" : "Confirm my entry"}
            </span>
          </button>
        </form>
      )}

      {view.kind === "done" && <Confirmed done={view.done} />}

      {view.kind === "problem" && (
        <div className={`${e.view} ${c.panel}`}>
          <span className={c.problemIcon}><Icon name="alert" /></span>
          <h1 className={c.title}>{view.title}</h1>
          <p className={c.lead}>{view.text}</p>
          <Link href="/" className={`${e.primary} ${e.submit}`}><span>Go to StreamerDraft</span></Link>
        </div>
      )}

      {/* the rules and the privacy policy, as pop-ups */}
      <RulesSheet
        open={doc === "rules"}
        onClose={() => setDoc(null)}
        origin={docFrom}
        footer={<button type="button" className={`${e.primary} ${c.rulesDone}`} onClick={() => setDoc(null)}><span>Done</span></button>}
      />
      <PrivacySheet
        open={doc === "privacy"}
        onClose={() => setDoc(null)}
        origin={docFrom}
        footer={<button type="button" className={`${e.primary} ${c.rulesDone}`} onClick={() => setDoc(null)}><span>Done</span></button>}
      />
    </PlainPage>
  );
}

// ---- Confirmed ----
function Confirmed({ done }: { done: Done }) {
  const scout = done.role === "scout";
  return (
    <div className={`${e.view} ${c.panel}`}>
      <Tick className={c.bigTick} />
      <h1 className={c.title}>
        {scout ? `Scout #${done.number} confirmed` : `Entry #${done.number} confirmed`}
      </h1>
      <p className={c.lead}>
        {done.status === "already_confirmed"
          ? `${done.displayName}, you'd already confirmed: you're in ${scout ? "as a scout" : "the draft"}.`
          : `${done.displayName}, you're in ${scout ? "as a scout" : "the draft"}.`}
      </p>

      <Eligibility eligible={done.ukEligible} />

      <section className={c.section} aria-label="Your referral link">
        <h2 className={e.head}>Your referral link</h2>
        <ShareLink code={done.referralCode} />
        <p className={e.small}>
          {done.ukEligible
            ? "A referral counts when someone joins through your link, confirms their email and lives in the UK. Whoever brings in the most by Mon 16 Nov wins: we reveal it live on stream."
            : "Anyone can join through your link. Referrals only count towards the prize for UK residents."}
        </p>
      </section>

      <DraftCard role={done.role} number={done.number} name={done.displayName} code={done.referralCode} />

      <Link href="/" className={`${e.secondary} ${c.home}`}><span>Back to StreamerDraft</span></Link>
    </div>
  );
}
