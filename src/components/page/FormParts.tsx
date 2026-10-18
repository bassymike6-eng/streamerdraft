// src/components/page/FormParts.tsx
//
// WHAT THIS IS
// The building blocks both sign-up forms are made of (the streamer one in
// JoinSheet.tsx, the scout application in ScoutForm.tsx), so they look and
// behave the same:
//
//   Field       a labelled text box, with a green tick once what's in it is right
//   FieldError  the red line under a box that says what's wrong
//   Check       a tick box row (18+, UK, news), in a grouped card like iOS Settings
//   Chips       pick-any buttons ("What do you make?"): tap to tick, tap again to untick
//   Segmented   pick-one, like iOS's segmented control ("4 weeks | 6 weeks | 8 weeks")
//   Banner      the red note above the button, for anything that isn't about one box
// and the checks both forms share (emailProblem, nameProblem), written to match
// the server's rules (src/lib/validation.ts).
//
// Ticking and picking make a soft tick (uiSound.ts): a little higher for on,
// lower for off, like a switch.
//
// UNDER THE HOOD, REAL FORM CONTROLS
// Chips are real checkboxes and Segmented is real radio buttons, just drawn
// differently. So keyboards (Tab, Space, the arrow keys) and screen readers
// work exactly as they would with plain ones.

import { cloneElement, type CSSProperties, type InputHTMLAttributes, type ReactElement, type ReactNode, type RefObject } from "react";
import { Icon, Tick } from "./EntryParts";
import { sheetOrder, slot } from "./Sheet";
import { uiSound } from "./uiSound";
import e from "./Entry.module.css";

// ---- The checks both forms share (the same rules as the server's) ----
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export function emailProblem(value: string): string | null {
  const v = value.trim();
  if (!v) return "Add your email.";
  if (v.length > 254) return "That email is too long.";
  if (!EMAIL_SHAPE.test(v)) return "Enter a valid email address, like name@example.com.";
  return null;
}
export function nameProblem(value: string): string | null {
  const v = value.trim();
  if (!v) return "Add a name or handle.";
  if (v.length < 2) return "At least 2 characters.";
  if (v.length > 30) return "30 characters at most.";
  return null;
}
export const AGE_PROBLEM = "You need to be 18 or over to join.";

// ---- The red note above the button ----
export type BannerText = { title: string; text: string } | null;
export function Banner({ banner }: { banner: BannerText }) {
  if (!banner) return null;
  return (
    <div className={e.banner} role="alert">
      <Icon name="alert" />
      <div>
        <p className={e.bannerTitle}>{banner.title}</p>
        <p className={e.bannerText}>{banner.text}</p>
      </div>
    </div>
  );
}

// ---- One labelled box ----
// label, the box (with its green tick when it's right), and a hint or the mistake.
// `id` must be unique on the page (both forms are on it at once): e.g. "scout-email".
export function Field({ id, n, label, optional, hint, ok, error, input }: {
  id: string;
  n: number; // its turn to fill in (sheetOrder)
  label: string;
  optional?: boolean; // says "Optional" next to the label
  hint?: string;
  ok: boolean;
  error: string | null;
  input: ReactElement<InputHTMLAttributes<HTMLInputElement>>;
}) {
  return (
    <div className={e.field}>
      <FieldLabel htmlFor={id} n={n} label={label} optional={optional} />
      <div className={`${slot.box} ${e.control}`} style={sheetOrder(n)} data-ok={ok || undefined} data-invalid={error ? true : undefined}>
        {/* the input, with its id and error wiring added */}
        {cloneElement(input, {
          id,
          "aria-invalid": error ? true : undefined,
          "aria-describedby": error ? `${id}-error` : hint ? `${id}-hint` : undefined,
        })}
        <Tick className={e.tick} />
      </div>
      {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : hint && <Hint id={`${id}-hint`} n={n}>{hint}</Hint>}
    </div>
  );
}

// A field's label, with "Optional" on the right if it is
export function FieldLabel({ htmlFor, id, n, label, optional }: { htmlFor?: string; id?: string; n: number; label: string; optional?: boolean }) {
  const Tag = htmlFor ? "label" : "p"; // a label for one box; plain words over a group (chips, segments)
  return (
    <Tag id={id} htmlFor={htmlFor} className={`${slot.text} ${e.label}`} style={sheetOrder(n)}>
      {label}
      {optional && <span className={e.optional}>Optional</span>}
    </Tag>
  );
}

export function Hint({ id, n, children }: { id: string; n: number; children: ReactNode }) {
  return <p id={id} className={`${slot.text} ${e.hint}`} style={sheetOrder(n)}>{children}</p>;
}

export function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className={e.error}>
      <Icon name="alert" />
      {children}
    </p>
  );
}

// ---- A tick box row ----
// (a real checkbox underneath, so keyboards and screen readers work)
export function Check({ checked, onChange, label, hint, invalid, inputRef, describedBy }: {
  checked: boolean;
  onChange: (on: boolean) => void;
  label: ReactNode;
  hint?: string;
  invalid?: boolean;
  inputRef?: RefObject<HTMLInputElement | null>;
  describedBy?: string; // the id of its error, when there is one
}) {
  return (
    <label className={e.check} data-invalid={invalid || undefined}>
      <input
        ref={inputRef}
        type="checkbox"
        checked={checked}
        onChange={(ev) => {
          onChange(ev.target.checked);
          uiSound(ev.target.checked ? "tick-on" : "tick-off", ev.target.closest("label"));
        }}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? describedBy : undefined}
      />
      <span className={e.box} aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M6.5 12.5l3.6 3.6 7.4-8" /></svg>
      </span>
      <span className={e.checkText}>
        {label}
        {hint && <small>{hint}</small>}
      </span>
    </label>
  );
}

export type Choice<T extends string | number> = { value: T; label: string };

// ---- Pick any (chips) ----
// A row of capsules that wrap onto more lines. Ticked ones fill in (ink on
// the page's colour, like Apple's filter buttons) with a little tick.
export function Chips<T extends string>({ id, n, label, hint, choices, value, onChange, error, firstRef }: {
  id: string;
  n: number;
  label: string;
  hint?: string;
  choices: Choice<T>[];
  value: T[];
  onChange: (next: T[]) => void;
  error: string | null;
  firstRef?: RefObject<HTMLInputElement | null>; // so the form can move the cursor here
}) {
  const toggle = (choice: T, on: boolean) =>
    // keep them in the order they're shown, whatever order they were tapped in
    onChange(choices.map((c) => c.value).filter((v) => (v === choice ? on : value.includes(v))));
  return (
    <fieldset className={e.group} aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}>
      <legend className={`${slot.text} ${e.label}`} style={sheetOrder(n)}>{label}</legend>
      <div className={e.chips} data-invalid={error ? true : undefined}>
        {choices.map((c, i) => (
          <label key={c.value} className={`${slot.box} ${e.chip}`} style={sheetOrder(n)}>
            <input
              ref={i === 0 ? firstRef : undefined}
              type="checkbox"
              name={id}
              checked={value.includes(c.value)}
              onChange={(ev) => {
                toggle(c.value, ev.target.checked);
                uiSound(ev.target.checked ? "tick-on" : "tick-off", ev.target.closest("label"));
              }}
            />
            <span className={e.chipIn}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12.5l4 4 8-9" /></svg>
              {c.label}
            </span>
          </label>
        ))}
      </div>
      {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : hint && <Hint id={`${id}-hint`} n={n}>{hint}</Hint>}
    </fieldset>
  );
}

// ---- Pick one (segmented control) ----
// A grey track with the options side by side; the picked one sits on a lifted
// "thumb" that slides across to whichever you tap. Nothing picked yet: no thumb.
export function Segmented<T extends string | number>({ id, n, label, hint, choices, value, onChange, error, firstRef }: {
  id: string;
  n: number;
  label: string;
  hint?: string;
  choices: Choice<T>[];
  value: T | null;
  onChange: (next: T) => void;
  error: string | null;
  firstRef?: RefObject<HTMLInputElement | null>;
}) {
  const picked = choices.findIndex((c) => c.value === value);
  return (
    <fieldset className={e.group} aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}>
      <legend className={`${slot.text} ${e.label}`} style={sheetOrder(n)}>{label}</legend>
      <div
        className={`${slot.box} ${e.segmented}`}
        style={{ ...sheetOrder(n), "--count": choices.length, "--picked": Math.max(picked, 0) } as CSSProperties}
        data-picked={picked >= 0 || undefined}
        data-invalid={error ? true : undefined}
      >
        <span className={e.thumb} aria-hidden="true" />
        {choices.map((c, i) => (
          <label key={String(c.value)} className={e.segment}>
            <input
              ref={i === 0 ? firstRef : undefined}
              type="radio"
              name={id}
              checked={value === c.value}
              onChange={(ev) => {
                onChange(c.value);
                uiSound("tick-on", ev.target.closest("label"));
              }}
            />
            <span>{c.label}</span>
          </label>
        ))}
      </div>
      {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : hint && <Hint id={`${id}-hint`} n={n}>{hint}</Hint>}
    </fieldset>
  );
}
