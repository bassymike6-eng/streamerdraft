"use client";

// src/components/admin/ScoutActions.tsx
//
// WHAT THIS IS
// What you can do about a scout, on their card (Scouts tab) and in their
// details (PersonPanel.tsx). Signing up makes someone a scout, so there's
// nothing to approve: you just look, and act if something's off.
//
//   new            [ Looks good ]  [ Turn down ]     Looks good = a tick for you,
//                                                   so you know who you've seen
//   checked        [ Un-tick ]     [ Turn down ]
//   turned down    [ Undo: make them a scout again ]
//
// TURN DOWN opens a little form first: why (only you see it), and the exact
// email they'll get (src/lib/turn-down-email.ts), then "Turn down and email
// them". They're emailed the first time only, and only if they'd confirmed
// their email. They stay in the competition either way.

import { useMemo, useState, type FormEvent } from "react";
import { previewPage } from "@/lib/email-layout";
import { turnDownEmail, TURN_DOWN_SUBJECT } from "@/lib/turn-down-email";
import { send, useTools, type Person } from "./data";
import { dateTime } from "./labels";
import { Icon, Problem } from "./parts";
import a from "./Admin.module.css";

export function ScoutActions({ person, inCard = false }: { person: Person; inCard?: boolean }) {
  const tools = useTools();
  const [turning, setTurning] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const name = person.displayName;

  // Send a change, then refresh everything and say what happened
  const change = async (what: string, body: object, done: (reply: { emailed?: boolean }) => string) => {
    setBusy(what);
    setProblem(null);
    try {
      const reply = await send<{ emailed?: boolean }>(`/api/admin/signups/${person.id}`, "PATCH", body, tools.loggedOut);
      tools.changed();
      tools.toast(done(reply));
      setTurning(false);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "That didn't work. Try again.");
    } finally {
      setBusy(null);
    }
  };

  if (turning) {
    return (
      <TurnDownForm
        person={person}
        busy={busy === "down"}
        problem={problem}
        onCancel={() => {
          setTurning(false);
          setProblem(null);
        }}
        onConfirm={(reason) =>
          change("down", { scoutTurnedDown: true, reason: reason || undefined }, (reply) =>
            reply.emailed ? `Turned down ${name}, and emailed them`
              : person.confirmed ? `Turned down ${name}, but the email didn't send`
                : `Turned down ${name}`
          )
        }
      />
    );
  }

  const buttons = (
    <div className={a.buttons}>
      {person.scoutTurnedDown ? (
        <button type="button" className={a.secondary} disabled={!!busy}
          onClick={() => change("undo", { scoutTurnedDown: false }, () =>
            person.confirmed ? `${name}'s a scout again. They had the email, so let them know` : `${name}'s a scout again`)}>
          {busy === "undo" ? "Saving" : "Undo: make them a scout again"}
        </button>
      ) : (
        <>
          {person.scoutChecked ? (
            !inCard && (
              <button type="button" className={a.secondary} disabled={!!busy}
                onClick={() => change("check", { scoutChecked: false }, () => `Un-ticked ${name}`)}>
                {busy === "check" ? "Saving" : "Un-tick"}
              </button>
            )
          ) : (
            <button type="button" className={a.primary} disabled={!!busy}
              onClick={() => change("check", { scoutChecked: true }, () => `Checked ${name}: looks good`)}>
              <Icon name="check" />{busy === "check" ? "Saving" : "Looks good"}
            </button>
          )}
          <button type="button" className={a.dangerQuiet} disabled={!!busy} onClick={() => setTurning(true)}>Turn down</button>
        </>
      )}
      {inCard && <button type="button" className={a.secondary} onClick={() => tools.openPerson(person.id)}>Open</button>}
    </div>
  );

  if (inCard) {
    return (
      <>
        {problem && <Problem text={problem} />}
        {buttons}
      </>
    );
  }

  return (
    <div className={a.actionBox} data-tone={person.scoutTurnedDown ? "bad" : person.scoutChecked ? "ok" : undefined}>
      <p>
        {person.scoutTurnedDown ? (
          <>
            <b>Turned down {dateTime(person.scoutTurnedDownAt)}</b>
            {person.scoutTurnedDownReason ? `: ${person.scoutTurnedDownReason}` : ""}. They won&apos;t be one of the scouts at launch, but they&apos;re still in the competition.
          </>
        ) : person.scoutChecked ? (
          <><b>Checked {dateTime(person.scoutCheckedAt)}.</b> Looks good.</>
        ) : (
          <><b>New: you haven&apos;t checked them yet.</b> They&apos;re a scout already. Tick Looks good once you have, or turn them down if something&apos;s off.</>
        )}
      </p>
      {problem && <Problem text={problem} />}
      {buttons}
    </div>
  );
}

function TurnDownForm({ person, busy, problem, onCancel, onConfirm }: {
  person: Person;
  busy: boolean;
  problem: string | null;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  // The exact email they'll get (only if they'd confirmed: otherwise none goes)
  const email = useMemo(
    () => (person.confirmed ? turnDownEmail({ displayName: person.displayName, eligible: person.eligible }, window.location.origin) : null),
    [person.confirmed, person.displayName, person.eligible]
  );

  const go = (ev: FormEvent) => {
    ev.preventDefault();
    onConfirm(reason.trim());
  };

  return (
    <form className={a.actionBox} data-tone="bad" onSubmit={go}>
      <p>
        <b>Turn down {person.displayName}?</b> They won&apos;t be one of the scouts at launch, and can&apos;t sign up as a
        scout again with this email. They stay in the competition. You can undo it.{" "}
        {person.confirmed
          ? "They'll get the email below."
          : "They haven't confirmed their email, so they won't get an email about it."}
      </p>
      <input
        className={a.input}
        value={reason}
        onChange={(ev) => setReason(ev.target.value)}
        maxLength={200}
        placeholder="Why? Only you see this, e.g. the links don't work"
        aria-label="Why (only you see this)"
        autoFocus
      />
      {email && (
        <details className={a.emailPreview}>
          <summary>The email: &ldquo;{TURN_DOWN_SUBJECT}&rdquo;</summary>
          <iframe title="The email they'll get" srcDoc={previewPage(email.html)} sandbox="" />
        </details>
      )}
      {problem && <Problem text={problem} />}
      <div className={a.buttons}>
        <button type="submit" className={a.danger} disabled={busy}>
          {busy ? "Turning down" : person.confirmed ? "Turn down and email them" : "Turn down"}
        </button>
        <button type="button" className={a.secondary} onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </form>
  );
}
