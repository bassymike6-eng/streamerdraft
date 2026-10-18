"use client";

// src/components/admin/EmailComposer.tsx
//
// WHAT THIS IS
// Sending the launch email (or a news email) from the dashboard. Two parts:
//
//   EmailComposer   "Write an email" (a panel, like someone's details):
//                     who to         Launch email (everyone confirmed) or
//                                    News and offers (only those who ticked it)
//                     subject, message ({name} = their name), an optional button
//                     the preview    EXACTLY what they'll get (their name, their
//                                    own Unsubscribe link at the bottom)
//                     Send me a test one copy to you first
//                     Send to 175 people   asks once more, then it's off
//   SentEmails      what you've sent: "Sent 120 of 175", Paused (and why),
//                   Resume, Done. Updates itself while one's sending.
//
// Your draft's kept in this browser until you send it, so closing the panel
// (or the tab) loses nothing. How the sending works: src/lib/broadcast.ts.

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { broadcastEmail, type EmailList } from "@/lib/broadcast-email";
import { isWebLink, previewPage } from "@/lib/email-layout";
import { CONTACT_EMAIL } from "@/lib/site";
import { send, useAdmin, useTools } from "./data";
import { dateTime, plural } from "./labels";
import { Empty, Icon, Pill, Problem } from "./parts";
import a from "./Admin.module.css";

export type SentEmail = {
  id: number; list: EmailList; subject: string; status: "sending" | "paused" | "done"; problem: string | null;
  createdAt: string; finishedAt: string | null; total: number; sent: number; skipped: number;
};
export type EmailsReply = {
  sends: SentEmail[];
  lists: { launch: number; news: number; unsubscribed: number };
  devMode: boolean; // no Resend key, on your computer: emails are printed in the terminal
  missingKey: boolean; // no Resend key on the LIVE site: nothing can send
};

const LISTS: { id: EmailList; name: string; who: string }[] = [
  { id: "launch", name: "Launch email", who: "Everyone who's confirmed" },
  { id: "news", name: "News and offers", who: "Only those who ticked it" },
];

// ── The draft, kept in this browser until it's sent ────────────────
const DRAFT_KEY = "sd.admin.emailDraft";
const TEST_KEY = "sd.admin.testTo";
// (the same as a Draft, with every box a plain string while you type)
type Written = { list: EmailList; subject: string; body: string; buttonLabel: string; buttonUrl: string };
const EMPTY: Written = { list: "launch", subject: "", body: "Hey {name},\n\n", buttonLabel: "", buttonUrl: "" };

function loadDraft(): Written {
  try {
    const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null");
    if (saved && typeof saved.body === "string") return { ...EMPTY, ...saved };
  } catch {
    // nothing saved, or storage blocked
  }
  return EMPTY;
}
const keep = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // storage blocked: the draft just won't survive a refresh
  }
};

// What's wrong with it, if anything (the server checks the same)
function draftProblem(d: Written): string | null {
  if (!d.subject.trim()) return "Write a subject.";
  if (!d.body.trim() || d.body.trim() === "Hey {name},") return "Write the message.";
  if (d.buttonLabel.trim() && !isWebLink(d.buttonUrl.trim())) return "The button needs a link starting https://";
  if (!d.buttonLabel.trim() && d.buttonUrl.trim()) return "Give the button some words, or clear its link.";
  return null;
}

export function EmailComposer({ onClose, lists, devMode, missingKey }: { onClose: () => void; lists: EmailsReply["lists"]; devMode: boolean; missingKey: boolean }) {
  const tools = useTools();
  const [draft, setDraft] = useState<Written>(loadDraft);
  const [testTo, setTestTo] = useState(() => {
    try {
      return localStorage.getItem(TEST_KEY) ?? CONTACT_EMAIL;
    } catch {
      return CONTACT_EMAIL;
    }
  });
  const [sure, setSure] = useState(false); // the "send it to everyone?" step
  const [busy, setBusy] = useState<null | "test" | "send">(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [testNote, setTestNote] = useState<string | null>(null);

  const count = lists[draft.list];
  const issue = draftProblem(draft);
  const set = (change: Partial<Written>) => {
    setDraft((was) => {
      const next = { ...was, ...change };
      keep(DRAFT_KEY, JSON.stringify(next));
      return next;
    });
    setSure(false);
  };

  // The preview: exactly the email, as "Sam" (everyone gets their own name)
  const preview = useMemo(() => broadcastEmail(draft, "Sam", "#unsubscribe", window.location.origin), [draft]);

  // Escape closes it (not while it's busy sending)
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => ev.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busy]);
  useEffect(() => {
    const was = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = was;
    };
  }, []);

  const sendTest = async () => {
    if (issue) return setProblem(issue);
    setBusy("test");
    setProblem(null);
    setTestNote(null);
    try {
      const reply = await send<{ devMode?: boolean }>("/api/admin/emails/test", "POST", { ...draft, to: testTo.trim() }, tools.loggedOut);
      keep(TEST_KEY, testTo.trim());
      setTestNote(reply.devMode ? "Printed in the terminal (dev mode: nothing's really sent)." : `Sent to ${testTo.trim()}. Check your inbox (and spam).`);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "The test didn't send.");
    } finally {
      setBusy(null);
    }
  };

  const sendAll = async (ev: FormEvent) => {
    ev.preventDefault();
    if (issue) return setProblem(issue);
    if (!sure) return setSure(true);
    setBusy("send");
    setProblem(null);
    try {
      await send("/api/admin/emails", "POST", { ...draft, confirm: true }, tools.loggedOut);
      keep(DRAFT_KEY, null); // sent: start fresh next time
      tools.changed();
      tools.toast(`Sending to ${plural(count, "person", "people")}`);
      onClose();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "It didn't send.");
      setSure(false);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={a.panelLayer}>
      <div className={a.scrim} onClick={() => !busy && onClose()} aria-hidden="true" />
      <aside className={`${a.panel} ${a.composerPanel}`} role="dialog" aria-modal="true" aria-label="Write an email">
        <div className={a.panelBar}>
          <button type="button" className={a.iconButton} onClick={onClose} disabled={!!busy} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        <form className={a.details} onSubmit={sendAll}>
          <header className={a.who}>
            <h2>Write an email</h2>
            <p className={a.hint}>Everyone gets it with their own name, and their own Unsubscribe link at the bottom.</p>
          </header>

          {devMode && (
            <p className={a.devNote}><Icon name="alert" />Dev mode: nothing&apos;s really sent. The emails are printed in the terminal running the site.</p>
          )}
          {missingKey && (
            <p className={a.devNote}><Icon name="alert" />RESEND_API_KEY isn&apos;t set on this server, so nothing can be sent yet. Add it, restart, then send.</p>
          )}

          <fieldset className={a.panelSection}>
            <legend>Who to</legend>
            <div className={a.listPick}>
              {LISTS.map((list) => (
                <label key={list.id} data-on={draft.list === list.id || undefined}>
                  <input type="radio" name="list" value={list.id} checked={draft.list === list.id} onChange={() => set({ list: list.id })} />
                  <b>{list.name}</b>
                  <span>{plural(lists[list.id], "person", "people")}: {list.who.toLowerCase()}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className={a.field}>
            <span>Subject</span>
            <input className={a.input} value={draft.subject} onChange={(ev) => set({ subject: ev.target.value })} maxLength={150} placeholder="e.g. StreamerDraft is live" />
          </label>

          <label className={a.field}>
            <span>Message</span>
            <textarea className={a.textarea} value={draft.body} onChange={(ev) => set({ body: ev.target.value })} maxLength={10000} rows={10} />
            <small>A blank line starts a new paragraph. {"{name}"} becomes their name. Links work as you type them.</small>
          </label>

          <div className={a.buttonFields}>
            <label className={a.field}>
              <span>Button words (optional)</span>
              <input className={a.input} value={draft.buttonLabel} onChange={(ev) => set({ buttonLabel: ev.target.value })} maxLength={40} placeholder="e.g. Go to StreamerDraft" />
            </label>
            <label className={a.field}>
              <span>Button link</span>
              <input className={a.input} value={draft.buttonUrl} onChange={(ev) => set({ buttonUrl: ev.target.value })} maxLength={500} inputMode="url" placeholder="https://" />
            </label>
          </div>

          <section className={a.panelSection}>
            <h3>What they&apos;ll get</h3>
            <div className={a.emailPreview} data-open="">
              <p className={a.previewSubject}><b>{draft.subject || "(no subject yet)"}</b><span>From StreamerDraft</span></p>
              <iframe title="Preview of the email" srcDoc={previewPage(preview.html)} sandbox="" />
            </div>
          </section>

          <section className={a.panelSection}>
            <h3>Send yourself a test first</h3>
            <div className={a.testRow}>
              <input className={a.input} type="email" value={testTo} onChange={(ev) => setTestTo(ev.target.value)} placeholder="you@example.com" aria-label="Send the test to" />
              <button type="button" className={a.secondary} onClick={sendTest} disabled={!!busy || !testTo.trim()}>
                {busy === "test" ? "Sending" : "Send test"}
              </button>
            </div>
            {testNote && <p className={a.hint}>{testNote}</p>}
          </section>

          {!devMode && !missingKey && count > 100 && (
            <p className={a.limitNote}>
              <Icon name="alert" />
              <span>
                Resend&apos;s free plan sends 100 emails a day, confirm emails included. For {plural(count, "person", "people")},
                upgrade Resend first. Otherwise it pauses at the limit, and you press Resume the next day.
              </span>
            </p>
          )}

          {problem && <Problem text={problem} />}

          {sure ? (
            <div className={a.actionBox} data-tone="bad" role="alert">
              <p><b>Send &ldquo;{draft.subject}&rdquo; to {plural(count, "person", "people")}?</b> It can&apos;t be unsent.</p>
              <div className={a.buttons}>
                <button type="submit" className={a.danger} disabled={!!busy}>{busy === "send" ? "Starting" : "Yes, send it"}</button>
                <button type="button" className={a.secondary} onClick={() => setSure(false)} disabled={!!busy}>Not yet</button>
              </div>
            </div>
          ) : (
            <button type="submit" className={`${a.primary} ${a.sendButton}`} disabled={!!busy || count === 0}>
              {count === 0 ? "Nobody's on this list yet" : `Send to ${plural(count, "person", "people")}`}
            </button>
          )}
        </form>
      </aside>
    </div>
  );
}

// ── What you've sent ────────────────────────────────────────────────
export function SentEmails({ data }: { data: EmailsReply | null }) {
  const tools = useTools();
  const [busy, setBusy] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  if (!data) return null;
  if (data.sends.length === 0) return <Empty>Nothing sent yet.</Empty>;

  const resume = async (id: number) => {
    setBusy(id);
    setProblem(null);
    try {
      await send(`/api/admin/emails/${id}/resume`, "POST", {}, tools.loggedOut);
      tools.changed();
      tools.toast("Carrying on");
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "That didn't work.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      {problem && <Problem text={problem} />}
      <ul className={a.sentList}>
        {data.sends.map((email) => (
          <li key={email.id}>
            <span className={a.downloadWords}>
              <b>{email.subject}</b>
              <span>{email.list === "launch" ? "Launch email" : "News and offers"}, {dateTime(email.createdAt)}</span>
            </span>
            <span className={a.sentProgress}>
              {email.status === "done" ? <Pill tone="ok">Done</Pill> : email.status === "sending" ? <Pill tone="wait">Sending</Pill> : <Pill tone="bad">Paused</Pill>}
              <span>
                Sent {email.sent.toLocaleString("en-GB")} of {email.total.toLocaleString("en-GB")}
                {email.skipped > 0 ? `, ${email.skipped} unsubscribed first` : ""}
              </span>
              {email.status !== "done" && (
                <span className={a.sentTrack} aria-hidden="true"><span style={{ width: `${email.total ? (100 * (email.sent + email.skipped)) / email.total : 0}%` }} /></span>
              )}
            </span>
            {email.status === "paused" && (
              <div className={a.sentProblem}>
                <p>{email.problem}</p>
                <button type="button" className={a.secondary} onClick={() => resume(email.id)} disabled={busy === email.id}>
                  {busy === email.id ? "Starting" : "Resume"}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

// The emails data, refreshing every 3 seconds while one's sending
export function useEmails() {
  return useAdmin<EmailsReply>("/api/admin/emails", {
    every: (data) => (data?.sends.some((s) => s.status === "sending") ? 3000 : undefined),
  });
}
