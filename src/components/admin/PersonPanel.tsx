"use client";

// src/components/admin/PersonPanel.tsx
//
// WHAT THIS IS
// Everything about one person, and what you can do about them. Slides in
// from the right on a computer; fills the screen on a phone.
// (GET / PATCH / DELETE /api/admin/signups/[id])
//
//   Name, email (copy), who they are at a glance
//   Red flags            each one, and what it means
//   Scout                their answers, and Looks good / Turn down / Undo
//                        (ScoutActions.tsx)
//   Their stream         (streamers) platform, channel, category
//   Referrals            who recruited them, their recruits, who shares their IP
//                        (tap any of them to jump to that person)
//   Details              dates, countries, news and offers
//   Your note            private: only you see it
//   Competition          Disqualify (with a reason) / Reinstate
//   Delete               for "delete my data" requests: asks twice
//
// Close: the ✕, Escape, tapping outside, or Back.

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { send, useAdmin, useTools, type Detail, type Person } from "./data";
import { AUDIENCE, CONTENT, HOURS, OFFERS, PLATFORMS, countryName, dateTime, flagsOf, label, plural, roleAndNumber, ukStatus, weeks } from "./labels";
import { Icon, Loading, OutLink, PersonButton, PersonPills, Pill, Problem } from "./parts";
import { ScoutActions } from "./ScoutActions";
import a from "./Admin.module.css";

export function PersonPanel({ id, onClose }: { id: number; onClose: () => void }) {
  const { data, error } = useAdmin<Detail>(`/api/admin/signups/${id}`);
  const panel = useRef<HTMLElement>(null);

  // Escape closes it
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => ev.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // The page behind doesn't scroll while it's open
  useEffect(() => {
    const was = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = was;
    };
  }, []);

  // Keyboard and screen readers start at the top of the panel (each person)
  useEffect(() => {
    panel.current?.focus();
    panel.current?.scrollTo({ top: 0 });
  }, [id]);

  return (
    <div className={a.panelLayer}>
      <div className={a.scrim} onClick={onClose} aria-hidden="true" />
      <aside ref={panel} className={a.panel} role="dialog" aria-modal="true" aria-label={data?.signup.displayName ?? "Person"} tabIndex={-1}>
        <div className={a.panelBar}>
          <button type="button" className={a.iconButton} onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        {data ? <Details key={id} detail={data} onClose={onClose} /> : error ? <Problem text={error} /> : <Loading rows={6} />}
      </aside>
    </div>
  );
}

function Facts({ children }: { children: ReactNode }) {
  return <dl className={a.facts}>{children}</dl>;
}
function Fact({ name, children }: { name: string; children: ReactNode }) {
  if (children === null || children === undefined || children === "" || children === false) return null;
  return <div><dt>{name}</dt><dd>{children}</dd></div>;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={a.panelSection}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function Details({ detail, onClose }: { detail: Detail; onClose: () => void }) {
  const p = detail.signup;
  const tools = useTools();
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  // Every change: send it, then refresh everything and say what happened
  const change = async (what: string, body: unknown, done: string, method: "PATCH" | "DELETE" = "PATCH") => {
    setBusy(what);
    setProblem(null);
    try {
      await send(`/api/admin/signups/${p.id}`, method, body, tools.loggedOut);
      tools.changed();
      tools.toast(done);
      return true;
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "That didn't work. Try again.");
      return false;
    } finally {
      setBusy(null);
    }
  };

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(p.email);
      tools.toast("Email copied");
    } catch {
      setProblem("Couldn't copy. Select the email and copy it yourself.");
    }
  };

  const flags = flagsOf(p);

  return (
    <div className={a.details}>
      <header className={a.who}>
        <h2>{p.displayName}</h2>
        <p className={a.email}>
          <a href={`mailto:${p.email}`}>{p.email}</a>
          <button type="button" className={a.iconButton} onClick={copyEmail} aria-label="Copy email"><Icon name="copy" /></button>
        </p>
        <PersonPills person={p} />
      </header>

      {problem && <Problem text={problem} />}

      {flags.length > 0 && (
        <Section title="Red flags">
          <ul className={a.flagList}>
            {flags.map((flag) => (
              <li key={flag.key}>
                <Icon name="flag" />
                <span><b>{flag.name}</b>{flag.meaning}</span>
              </li>
            ))}
          </ul>
          <p className={a.hint}>A flag means have a look, not definitely cheating.</p>
        </Section>
      )}

      {p.role === "scout" ? <ScoutAnswers p={p} /> : (
        <Section title="Their stream">
          <Facts>
            <Fact name="Platform">{label(PLATFORMS, p.platform)}</Fact>
            <Fact name="Channel">{p.channelUrl && <OutLink href={p.channelUrl} />}</Fact>
            <Fact name="What they stream">{p.streamCategory}</Fact>
          </Facts>
        </Section>
      )}

      <Section title="Referrals">
        <Facts>
          <Fact name="Recruited by">
            {p.recruiterId ? (
              <button type="button" className={a.textButton} onClick={() => tools.openPerson(p.recruiterId!)}>
                {p.recruiterName ?? "Someone"} <Icon name="chevron" />
              </button>
            ) : "Nobody: came straight to the site"}
          </Fact>
          <Fact name="Their recruit code">{p.referralCode}</Fact>
          <Fact name="Their recruits">
            {p.recruitsTotal === 0
              ? "None yet"
              : `${p.recruitsCounted} counted, ${p.recruitsPending} waiting to confirm, ${p.recruitsOutsideUk} outside the UK`}
          </Fact>
        </Facts>
        {detail.recruits.length > 0 && (
          <div className={a.subList}>
            <h4>People they recruited</h4>
            {detail.recruits.map((r) => <PersonButton key={r.id} person={r} extra={<RecruitStatus r={r} />} />)}
          </div>
        )}
        {detail.sameIpFingerprint.length > 0 && (
          <div className={a.subList}>
            <h4>Signed up from the same IP ({detail.sameIpFingerprint.length})</h4>
            {detail.sameIpFingerprint.map((r) => <PersonButton key={r.id} person={r} />)}
          </div>
        )}
      </Section>

      {p.feedback && (
        <Section title="What they told us">
          <blockquote className={a.quote}>{p.feedback}</blockquote>
        </Section>
      )}

      <Section title="Details">
        <Facts>
          <Fact name="Who">{roleAndNumber(p)}</Fact>
          <Fact name="Joined">{dateTime(p.createdAt)}</Fact>
          <Fact name="Confirmed their email">{p.confirmedAt ? dateTime(p.confirmedAt) : "Not yet"}</Fact>
          {p.role === "prospect" && <Fact name="Accepted the rules">{p.rulesAcceptedAt ? dateTime(p.rulesAcceptedAt) : "Not yet"}</Fact>}
          <Fact name="Where">{ukStatus(p)}</Fact>
          <Fact name="IP when they joined">{countryName(p.ipCountry)}</Fact>
          {p.confirmIpCountry && <Fact name="IP when they confirmed">{countryName(p.confirmIpCountry)}</Fact>}
          {p.ipFingerprint && (
            <Fact name="IP fingerprint">
              <code>{p.ipFingerprint}</code>{p.ipGroupSize > 1 ? `, shared with ${plural(p.ipGroupSize - 1, "other")}` : ""}
            </Fact>
          )}
          <Fact name="News and offers">
            {p.unsubscribedAt ? `Unsubscribed ${dateTime(p.unsubscribedAt)}` : p.marketingOptIn ? "Yes, ticked the box" : "No"}
          </Fact>
          <Fact name="Database id">{p.id}</Fact>
        </Facts>
      </Section>

      <NoteForm key={`${p.id}-${p.adminNote ?? ""}`} p={p} busy={busy} change={change} />

      <Section title="Competition">
        {p.disqualified ? (
          <div className={a.actionBox} data-tone="bad">
            <p>
              <b>Disqualified {dateTime(p.disqualifiedAt)}</b>
              {p.disqualifiedReason ? `: ${p.disqualifiedReason}` : ""}. They don&apos;t count in the Road to 300, or as anyone&apos;s referral.
            </p>
            <button type="button" className={a.secondary} disabled={!!busy}
              onClick={() => change("dq", { disqualified: false }, `Reinstated ${p.displayName}`)}>
              {busy === "dq" ? "Reinstating" : "Reinstate"}
            </button>
          </div>
        ) : (
          <DisqualifyForm p={p} busy={busy} change={change} />
        )}
      </Section>

      <DeleteBox p={p} busy={busy} change={change} onClose={onClose} />
    </div>
  );
}

type Change = (what: string, body: unknown, done: string, method?: "PATCH" | "DELETE") => Promise<boolean>;

function RecruitStatus({ r }: { r: Person }) {
  const counts = r.confirmed && r.ukEligible && !r.disqualified;
  return (
    <span className={a.recruitStatus}>
      {r.flagged && <Pill tone="flag">Flagged</Pill>}
      {counts ? "Counts" : r.disqualified ? "Disqualified" : !r.ukEligible ? "Outside the UK" : "Waiting to confirm"}
    </span>
  );
}

function ScoutAnswers({ p }: { p: Person }) {
  const offers = (p.scoutOffers ?? []).filter((o) => o !== "other").map((o) => label(OFFERS, o));
  if (p.scoutOfferOther) offers.push(`“${p.scoutOfferOther}”`);
  return (
    <Section title="Scout">
      <ScoutActions person={p} />
      <Facts>
        <Fact name="Their links">
          {p.platformUrls && p.platformUrls.length > 0 && (
            <span className={a.linkList}>{p.platformUrls.map((url) => <OutLink key={url} href={url} />)}</span>
          )}
        </Fact>
        <Fact name="Audience">{label(AUDIENCE, p.audienceSize)}</Fact>
        <Fact name="What they make">{(p.contentTypes ?? []).map((c) => label(CONTENT, c)).join(", ")}</Fact>
        <Fact name="Can help with">{offers.join(", ")}</Fact>
        <Fact name="Backs a streamer for">{p.scoutWeeks ? weeks(p.scoutWeeks) : null}</Fact>
        <Fact name="Hours a month">{p.scoutHours ? label(HOURS, p.scoutHours) : null}</Fact>
        <Fact name="Agreed to the commitment">{p.commitmentAcceptedAt ? dateTime(p.commitmentAcceptedAt) : null}</Fact>
      </Facts>
      {p.scoutPitch && <blockquote className={a.quote}>{p.scoutPitch}</blockquote>}
    </Section>
  );
}

function NoteForm({ p, busy, change }: { p: Person; busy: string | null; change: Change }) {
  const [note, setNote] = useState(p.adminNote ?? "");
  const dirty = note.trim() !== (p.adminNote ?? "");
  const save = (ev: FormEvent) => {
    ev.preventDefault();
    if (dirty) change("note", { note: note.trim() }, note.trim() ? "Note saved" : "Note cleared");
  };
  return (
    <Section title="Your note">
      <form className={a.noteForm} onSubmit={save}>
        <textarea
          value={note}
          onChange={(ev) => setNote(ev.target.value)}
          maxLength={1000}
          rows={3}
          placeholder="Only you see this. e.g. DM'd them on TikTok"
          aria-label="Your note"
        />
        {dirty && (
          <button type="submit" className={a.secondary} disabled={!!busy}>{busy === "note" ? "Saving" : "Save note"}</button>
        )}
      </form>
    </Section>
  );
}

function DisqualifyForm({ p, busy, change }: { p: Person; busy: string | null; change: Change }) {
  const [reason, setReason] = useState("");
  const go = (ev: FormEvent) => {
    ev.preventDefault();
    change("dq", { disqualified: true, reason: reason.trim() || undefined }, `Disqualified ${p.displayName}`);
  };
  return (
    <form className={a.actionBox} onSubmit={go}>
      <p>Disqualified people can&apos;t win, drop out of the Road to 300, and stop counting as anyone&apos;s referral. You can reinstate them.</p>
      <input
        className={a.input}
        value={reason}
        onChange={(ev) => setReason(ev.target.value)}
        maxLength={200}
        placeholder="Why? e.g. signed up their own fake recruits"
        aria-label="Reason"
      />
      <button type="submit" className={a.danger} disabled={!!busy}>{busy === "dq" ? "Disqualifying" : "Disqualify"}</button>
    </form>
  );
}

function DeleteBox({ p, busy, change, onClose }: { p: Person; busy: string | null; change: Change; onClose: () => void }) {
  const [sure, setSure] = useState(false);
  const remove = async () => {
    if (await change("delete", { confirm: true }, `Deleted ${p.displayName}`, "DELETE")) onClose();
  };
  return (
    <Section title="Delete">
      {!sure ? (
        <div className={a.actionBox}>
          <p>For &ldquo;delete my data&rdquo; requests. Removes everything about them.</p>
          <button type="button" className={a.dangerQuiet} onClick={() => setSure(true)}>Delete {p.displayName}</button>
        </div>
      ) : (
        <div className={a.actionBox} data-tone="bad" role="alert">
          <p><b>This can&apos;t be undone.</b> Everything about {p.displayName} goes. Anyone they recruited stays, but stops counting for them.</p>
          <div className={a.buttons}>
            <button type="button" className={a.danger} disabled={!!busy} onClick={remove}>{busy === "delete" ? "Deleting" : "Delete for good"}</button>
            <button type="button" className={a.secondary} onClick={() => setSure(false)}>Cancel</button>
          </div>
        </div>
      )}
    </Section>
  );
}
