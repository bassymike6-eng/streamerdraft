// src/components/page/entry.ts
//
// WHAT THIS IS
// Where this visitor is at with joining, for every part of the page that
// cares (the Join button, the sign-up, Road to 300):
//   none       not joined yet
//   pending    joined, but hasn't confirmed their email yet
//   confirmed  joined and confirmed: their entry counts
// plus what we know about their entry: their email and name, their #number,
// their referral code (their link: /r/<code>), whether they're in the UK
// (so can win), and how their referrals are doing. Only THEIR numbers: there's
// no public leaderboard (the winner's revealed live on stream).
//
// WHERE IT COMES FROM
// 1. The sign-up form saves it in this browser (localStorage) when they join,
//    with the PRIVATE status key the server gave this browser.
// 2. useEntrySync() (below) asks the server "where's my entry at?" with that
//    key: every few seconds while it's pending (so the page notices the moment
//    they confirm, even on their phone), and now and then once it's confirmed
//    (so their referral numbers stay fresh).
// 3. The confirm page saves it too, with the email link's token as this
//    device's key (so a phone that only ever confirmed still sees its numbers).
//    Every open tab hears about it straight away (the browser's "storage" event).
//
// PREVIEWING THE OTHER STATES (no sign-up needed, and nothing's saved)
//   ?entry=pending              joined, waiting on the email
//   ?entry=pending&sent=no      ...and the email didn't send
//   ?entry=confirmed            confirmed, in the UK
//   ?entry=confirmed&uk=no      confirmed, outside the UK (can't win)
//   ...&role=scout              the same, as a scout
//   ...&role=scout&turned=yes   a scout we've turned down (the dashboard)

import { useEffect, useMemo, useSyncExternalStore } from "react";

export type EntryRole = "prospect" | "scout";
export type EntryStatus = "none" | "pending" | "confirmed";
export type Referrals = { counted: number; pending: number; outsideUk: number };

export type Entry = {
  status: EntryStatus;
  role: EntryRole;
  key: string | null; // a private key: the sign-up's status key, or the email link's token (confirm page)
  email: string | null;
  name: string | null; // their name or handle
  emailSent: boolean | null; // did the confirmation email go? (null: we don't know)
  number: number | null; // their #number, once confirmed
  code: string | null; // their referral code, once confirmed
  eligible: boolean | null; // in the UK, so can win and count as a referral (null: don't know yet)
  referrals: Referrals | null;
  turnedDown?: boolean | null; // scouts: we've turned them down as a scout (still in the competition)
  preview?: boolean; // from ?entry= (nothing real behind it)
};

const NONE: Entry = {
  status: "none", role: "prospect", key: null, email: null, name: null, emailSent: null,
  number: null, code: null, eligible: null, referrals: null,
};

const KEY = "sd.entry";
const CHANGED = "sd-entry-changed"; // the event this tab fires when it saves a change

// What we read: the URL's preview settings and what's saved, as one string
// (so React can tell when it changes)
function snapshot(): string {
  try {
    return `${window.location.search}|${localStorage.getItem(KEY) ?? ""}`;
  } catch {
    return window.location.search; // storage blocked (e.g. some private modes)
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange); // another tab saved a change
  window.addEventListener(CHANGED, onChange); // this tab did
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGED, onChange);
  };
}

const text = (value: unknown) => (typeof value === "string" && value ? value : null);
const whole = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);
const yesNo = (value: unknown) => (typeof value === "boolean" ? value : null);

function parse(raw: string): Entry {
  const cut = raw.indexOf("|");
  const search = cut < 0 ? raw : raw.slice(0, cut);
  const saved = cut < 0 ? "" : raw.slice(cut + 1);
  const params = new URLSearchParams(search);
  const role: EntryRole = params.get("role") === "scout" ? "scout" : "prospect";

  // ?entry=... previews
  const preview = params.get("entry");
  if (preview === "none") return { ...NONE, role, preview: true };
  if (preview === "pending" || preview === "confirmed") {
    const confirmed = preview === "confirmed";
    return {
      status: preview, role, key: null, preview: true,
      email: "you@example.com", name: "You",
      emailSent: params.get("sent") !== "no",
      number: confirmed ? 47 : null,
      code: confirmed ? "k7x2qp" : null,
      eligible: params.get("uk") !== "no",
      referrals: confirmed ? { counted: 2, pending: 1, outsideUk: 0 } : null,
      turnedDown: params.get("turned") === "yes",
    };
  }

  // What's saved in this browser
  try {
    const data = JSON.parse(saved);
    const status = data?.status;
    if (status === "pending" || status === "confirmed") {
      const r = data.referrals;
      return {
        status,
        role: data.role === "scout" ? "scout" : "prospect",
        key: text(data.key),
        email: text(data.email),
        name: text(data.name),
        emailSent: yesNo(data.emailSent),
        number: whole(data.number),
        code: text(data.code),
        eligible: yesNo(data.eligible),
        referrals: r && whole(r.counted) !== null ? { counted: r.counted, pending: whole(r.pending) ?? 0, outsideUk: whole(r.outsideUk) ?? 0 } : null,
        turnedDown: yesNo(data.turnedDown),
      };
    }
  } catch {
    // nothing saved, or something we can't read: not joined
  }
  return NONE;
}

export function useEntry(): Entry {
  const raw = useSyncExternalStore(subscribe, snapshot, () => "");
  return useMemo(() => parse(raw), [raw]);
}

// The one function that changes what's saved. Pass the changes: they're laid
// over what's there (or, with { fresh: true }, over a blank entry). Pass null
// to forget the entry (back to "not joined").
export function saveEntry(changes: Partial<Entry> | null, { fresh = false } = {}) {
  try {
    if (changes === null) {
      localStorage.removeItem(KEY);
    } else {
      const current = fresh ? NONE : parse(`|${localStorage.getItem(KEY) ?? ""}`);
      const next: Entry = { ...current, ...changes };
      delete next.preview;
      localStorage.setItem(KEY, JSON.stringify(next));
    }
  } catch {
    // storage blocked: it just won't remember them on this device
  }
  window.dispatchEvent(new Event(CHANGED));
}

// The confirm page calls this once they've confirmed. If this browser is the
// one they joined from (same email), their entry here becomes confirmed (and
// keeps its key). Otherwise (they confirmed on another device, or someone
// else's entry was saved here) it's saved fresh, with the email link's token
// as this device's key. Either way, every open tab hears about it straight away.
export function saveConfirmed(c: { email: string; role: EntryRole; name: string; number: number; code: string; eligible: boolean; token: string }) {
  let sameEmail = false;
  try {
    const current = parse(`|${localStorage.getItem(KEY) ?? ""}`);
    sameEmail = !!current.email && current.email.toLowerCase() === c.email.toLowerCase();
  } catch {
    // storage blocked: nothing to match
  }
  const confirmed = { status: "confirmed" as const, role: c.role, email: c.email, name: c.name, number: c.number, code: c.code, eligible: c.eligible, emailSent: true };
  if (sameEmail) saveEntry(confirmed);
  else saveEntry({ ...confirmed, key: c.token }, { fresh: true });
}

// Their referral link, e.g. "streamerdraft.co.uk/r/k7x2qp" (shown without https://)
export function referralLink(code: string): { href: string; shown: string } {
  const href = `${window.location.origin}/r/${code}`;
  return { href, shown: href.replace(/^https?:\/\//, "") };
}

// ---- Keeping it fresh ----
const PENDING_EVERY = 4000; // ms: waiting for them to confirm
const CONFIRMED_EVERY = 30000; // ms: their referral numbers

// What /api/entry sends back (src/lib/stats.ts: getEntryStatus)
type ServerEntry = {
  status: "pending" | "confirmed";
  role: EntryRole;
  displayName: string;
  number: number | null;
  ukEligible: boolean;
  referralCode: string | null;
  referrals: Referrals;
  turnedDown?: boolean; // scouts we've turned down
};

// Is this key still the one saved here? (While we were waiting for the server,
// they may have tapped "Wrong email?" or joined again: then the answer's about
// an entry that's gone, and saving it would bring it back.)
function stillSaved(key: string): boolean {
  try {
    return parse(`|${localStorage.getItem(KEY) ?? ""}`).key === key;
  } catch {
    return false;
  }
}

// Asks the server once, and saves what it says
async function refresh(entry: Entry) {
  if (entry.key) {
    const response = await fetch(`/api/entry?key=${encodeURIComponent(entry.key)}`, { cache: "no-store" });
    if (!stillSaved(entry.key)) return; // (moved on while we waited)
    if (response.status === 404) {
      // Nobody has this key any more: they joined again somewhere else (which
      // gives a new key). Pending: forget it here, so they can join again.
      // Confirmed: keep it, they just can't refresh the private bits from here.
      if (entry.status === "pending") saveEntry(null);
      else saveEntry({ key: null });
      return;
    }
    if (!response.ok) return; // a blip: try again next time
    const data = await response.json();
    const e = data?.entry as ServerEntry | undefined;
    if (!e || !stillSaved(entry.key)) return;
    saveEntry({
      status: e.status,
      role: e.role,
      name: e.displayName,
      number: e.number,
      eligible: e.ukEligible,
      code: e.referralCode ?? entry.code,
      referrals: e.referrals,
      turnedDown: e.turnedDown ?? false,
    });
  }
}

// Use once, on the page. Keeps the saved entry in step with the server:
//   pending    every 4 seconds while the page is on screen, and straight away
//              when they come back to it (from their email app, say)
//   confirmed  every 30 seconds, and when they come back to it
export function useEntrySync(entry: Entry) {
  const { status, key, preview } = entry;
  useEffect(() => {
    if (preview || status === "none" || !key) return;
    const current = { ...entry };
    let busy = false;
    const check = () => {
      if (busy || document.visibilityState !== "visible") return;
      busy = true;
      refresh(current)
        .catch(() => {}) // offline for a moment: the next check tries again
        .finally(() => {
          busy = false;
        });
    };
    check();
    const timer = window.setInterval(check, status === "pending" ? PENDING_EVERY : CONFIRMED_EVERY);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
    // only what decides how (and whether) to check: the rest is read fresh each time
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, key, preview]);
}
