// src/components/page/JoinSheet.tsx
//
// WHAT THIS IS
// Everything behind the Join and Join as a scout buttons, in a pop-up that grows
// out of the button (Sheet.tsx). The page has two: role "prospect" (Join the
// draft) and role "scout" (Join as a scout). What it shows depends on where
// they're at (entry.ts):
//
//   not joined   THE FORM
//                  streamer: email, name, 18+, UK, updates, Register interest
//                  scout: the two-step scout sign-up (ScoutForm.tsx)
//   pending      CHECK YOUR EMAIL: "Email sent to you@..." (or "it didn't send"),
//                resend, start again with a different email. It's waiting, and
//                the moment they confirm (in any tab, or on their phone) it
//                closes by itself (SitePage.tsx)
//   confirmed    YOU'RE IN (streamers and scouts alike: both can win, F5): can
//                they win (UK only), their link with Copy and Share, and how
//                THEIR referrals are doing (nobody else's: no public
//                leaderboard, the winner's revealed live on stream). A scout
//                we've turned down (the dashboard) sees a note saying so.
// Once someone's in (either role), there's only one button on the page, for
// their entry, so the pending and confirmed views follow the ENTRY's role.
//
// WHAT WE ASK FOR, AND WHAT WE DON'T (YET)
// Just enough to hold their place: an email, and a name to call them (and to
// shout out on stream if they win).
// No channel, platform or socials: plenty of people who join won't stream yet
// (or they make other content), and every extra box loses sign-ups. We ask
// for those when the site launches properly, by email, once they're in.
//
// THE FORM, IN DETAIL
// - Each box gets a green tick as soon as what's in it is right (checked here
//   in the browser with the same rules as the server, src/lib/validation.ts)
// - Mistakes show under the box once they've left it (not while typing)
// - The SERVER still checks everything. Its messages land under the right box
//   (e.g. "Temporary email addresses can't be used"), or in a red note above
//   the button for anything that isn't about one box (too many tries, the
//   human check, our side breaking, no connection)
// - Text is 17px: iPhones zoom the whole page in on any box with text under
//   16px when you tap it. 16px and up, they don't. (We don't turn zooming
//   off: people who need to zoom still can.)

import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { saveEntry, useEntry, type Entry, type EntryRole } from "./entry";
import { Eligibility, Icon, ReferralStats, Tick } from "./EntryParts";
import type { Doc } from "./Footer";
import { DraftCard } from "./DraftCard";
import { AGE_PROBLEM, Banner, Check, emailProblem, Field, FieldError, nameProblem, type BannerText } from "./FormParts";
import { savedReferral, useReferral } from "./referral";
import { ScoutForm } from "./ScoutForm";
import { Sheet, sheetOrder, slot } from "./Sheet";
import { ShareLink } from "./ShareLink";
import { Turnstile, type TurnstileHandle } from "./Turnstile";
import { uiSound, unlockUiSound } from "./uiSound";
import e from "./Entry.module.css";

// The pop-up's title and the line under it, by role and where they're at
const HEADINGS: Record<EntryRole, Record<Entry["status"], { title: string; subtitle: string }>> = {
  prospect: {
    none: { title: "Join the draft", subtitle: "You're registering your interest as a streamer." },
    pending: { title: "Check your email", subtitle: "Your entry's pending until you confirm it." },
    confirmed: { title: "You're in the draft", subtitle: "Entry confirmed. Now bring people in." },
  },
  scout: {
    none: { title: "Join as a scout", subtitle: "Draft a small streamer and help them grow." },
    pending: { title: "Check your email", subtitle: "Your sign-up's pending until you confirm it." },
    confirmed: { title: "You're a scout", subtitle: "Entry confirmed. Now bring people in." },
  },
};

const COOLDOWN = 60; // seconds between confirmation emails (the server's rule too)

// ---- The pop-up ----
export function JoinSheet({ role, open, onClose, origin, onDoc }: {
  role: EntryRole; // which form it shows: the streamer sign-up or the scout sign-up
  open: boolean;
  onClose: () => void;
  origin: RefObject<HTMLElement | null>;
  onDoc: (doc: Doc, from: HTMLElement) => void; // the rules or privacy, as a pop-up over this one
}) {
  const entry = useEntry();
  // When the last confirmation email went (for the Resend countdown)
  const [sentAt, setSentAt] = useState<number | null>(null);
  // "You'd already signed up, so we sent a fresh link" (just after joining again)
  const [notice, setNotice] = useState<string | null>(null);

  // Not in yet: this pop-up's own form. In: their entry, whichever role it is.
  const heading = HEADINGS[entry.status === "none" ? role : entry.role][entry.status];
  const joined = (message: string | null, sent: boolean) => {
    setSentAt(sent ? Date.now() : null); // (nothing went: no wait before trying again)
    setNotice(message);
  };

  return (
    <Sheet open={open} onClose={onClose} origin={origin} title={heading.title} subtitle={heading.subtitle}>
      {/* The scout sign-up stays put (just hidden) once it's sent, so if
          they tap "Wrong email?" everything they wrote is still there */}
      {role === "scout" && (
        <div className={e.view} hidden={entry.status !== "none"}>
          <ScoutForm open={open} shown={entry.status === "none"} onPrivacy={(from) => onDoc("privacy", from)} onApplied={joined} />
        </div>
      )}
      {/* key: a fresh view (and its own fill-in) whenever where they're at changes */}
      <div key={entry.status} className={e.view}>
        {entry.status === "none" && role === "prospect" && (
          <JoinForm open={open} onPrivacy={(from) => onDoc("privacy", from)} onJoined={joined} />
        )}
        {entry.status === "pending" && (
          <Pending
            entry={entry}
            sentAt={sentAt}
            notice={notice}
            onSent={(at) => setSentAt(at)}
            onStartAgain={() => {
              setNotice(null);
              setSentAt(null);
              saveEntry(null);
            }}
          />
        )}
        {entry.status === "confirmed" && <YoureIn entry={entry} onRules={(from) => onDoc("rules", from)} />}
      </div>
    </Sheet>
  );
}

// ---- 1. The sign-up form ----

function JoinForm({ open, onJoined, onPrivacy }: {
  open: boolean;
  onJoined: (message: string | null, sent: boolean) => void;
  onPrivacy: (from: HTMLElement) => void;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [adult, setAdult] = useState(false);
  const [uk, setUk] = useState(false);
  const [updates, setUpdates] = useState(false);
  // Which boxes they've been in and left (only then do we point out mistakes)
  const [left, setLeft] = useState({ email: false, name: false, adult: false });
  // The server's word on a box, until they change what's in it
  const [server, setServer] = useState<{ email?: string; name?: string; adult?: string }>({});
  const [banner, setBanner] = useState<BannerText>(null);
  const [busy, setBusy] = useState(false);
  const referral = useReferral();

  const emailRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const adultRef = useRef<HTMLInputElement>(null);
  const human = useRef<TurnstileHandle>(null);

  // On a computer, the cursor goes straight into the email box once it's open.
  // (Not on phones: the keyboard jumping up mid-animation is jarring.)
  useEffect(() => {
    if (!open || !window.matchMedia("(pointer: fine)").matches) return;
    const t = window.setTimeout(() => emailRef.current?.focus({ preventScroll: true }), 650);
    return () => window.clearTimeout(t);
  }, [open]);

  const emailIssue = server.email ?? emailProblem(email);
  const nameIssue = server.name ?? nameProblem(name);
  const adultIssue = server.adult ?? (adult ? null : AGE_PROBLEM);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    unlockUiSound(); // (the "sent" sound comes once the server answers)
    setBanner(null);
    setLeft({ email: true, name: true, adult: true });

    // Anything wrong we can see from here: point at the first one
    if (emailIssue || nameIssue || adultIssue) uiSound("error");
    if (emailIssue) return emailRef.current?.focus();
    if (nameIssue) return nameRef.current?.focus();
    if (adultIssue) return adultRef.current?.focus();

    // Cloudflare wants a tick in its "Verify you are human" box first
    if (human.current?.needsTick()) {
      uiSound("error");
      setBanner({ title: "One more thing", text: "Tick “Verify you are human” just above, then press Register interest." });
      return;
    }

    setBusy(true);
    try {
      const turnstileToken = await human.current?.token();
      const response = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: "prospect",
          email: email.trim(),
          displayName: name.trim(),
          ageConfirmed: adult,
          basedInUk: uk,
          marketingOptIn: updates,
          ref: savedReferral() ?? undefined,
          turnstileToken,
        }),
      });
      const data = await response.json().catch(() => null);

      if (response.ok && data?.ok) {
        // In! (or already signed up and not confirmed: a fresh link went out)
        saveEntry({
          status: "pending",
          role: data.role === "scout" ? "scout" : "prospect",
          key: data.statusKey,
          email: data.email,
          name: name.trim(),
          emailSent: data.emailSent !== false,
          number: null, code: null, eligible: null, referrals: null,
        });
        onJoined(data.status === "resent" ? data.message ?? null : null, data.emailSent !== false);
        uiSound(data.emailSent !== false ? "sent" : "error");
        return; // the view switches to "Check your email"
      }

      uiSound("error");
      human.current?.reset(); // its token's used up: get a fresh one for the next try
      const fields = (data?.fields ?? {}) as Record<string, string[] | undefined>;
      if (data?.status === "already_confirmed") {
        setServer({ email: "This email's already in the draft and confirmed. Use a different one to join again." });
        emailRef.current?.focus();
        // (role_taken, "this email's already signed up to scout", comes as fields.email: next)
      } else if (fields.email || fields.displayName || fields.ageConfirmed) {
        setServer({ email: fields.email?.[0], name: fields.displayName?.[0], adult: fields.ageConfirmed?.[0] });
        if (fields.email) emailRef.current?.focus();
        else if (fields.displayName) nameRef.current?.focus();
      } else if (data?.status === "human_check_failed") {
        setBanner({ title: "The human check didn't go through", text: "Give it a second, then press Register interest again. Still stuck? Refresh the page." });
      } else if (response.status === 429) {
        setBanner({ title: "Too many tries", text: "Give it a few minutes, then try again." });
      } else if (response.status >= 500 || !data) {
        setBanner({ title: "Something went wrong on our side", text: "Your details look fine. Try again in a moment." });
      } else {
        setBanner({ title: "That didn't work", text: data.error ?? "Check your details and try again." });
      }
    } catch {
      uiSound("error");
      human.current?.reset();
      setBanner({ title: "Couldn't reach StreamerDraft", text: "Check your connection, then try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className={e.form} onSubmit={submit} noValidate>
      {referral && (
        <p className={`${slot.text} ${e.via}`} style={sheetOrder(2)}>
          <Icon name="link" />
          You&apos;re joining through a friend&apos;s link.
        </p>
      )}

      <Field
        id="join-email"
        n={3}
        label="Email"
        ok={!emailIssue}
        error={left.email || server.email ? emailIssue : null}
        input={
          <input
            ref={emailRef}
            className={e.input}
            type="email"
            name="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="next"
            placeholder="johndoe@example.com"
            maxLength={254}
            value={email}
            onChange={(ev) => {
              setEmail(ev.target.value);
              setServer((was) => ({ ...was, email: undefined }));
            }}
            onBlur={() => email && setLeft((was) => ({ ...was, email: true }))}
            onKeyDown={(ev) => {
              // Enter in the email box goes on to the name box, rather than sending
              if (ev.key === "Enter") {
                ev.preventDefault();
                nameRef.current?.focus();
              }
            }}
          />
        }
      />

      <Field
        id="join-name"
        n={4}
        label="Name or handle"
        hint="What we'll call you. If you win, it's the name we shout out on stream."
        ok={!nameIssue}
        error={left.name || server.name ? nameIssue : null}
        input={
          <input
            ref={nameRef}
            className={e.input}
            type="text"
            name="nickname"
            autoComplete="nickname"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            placeholder="e.g. John Doe"
            maxLength={30}
            value={name}
            onChange={(ev) => {
              setName(ev.target.value);
              setServer((was) => ({ ...was, name: undefined }));
            }}
            onBlur={() => name && setLeft((was) => ({ ...was, name: true }))}
          />
        }
      />

      <div className={`${slot.box} ${e.checks}`} style={sheetOrder(5)}>
        <div>
          <Check
            inputRef={adultRef}
            checked={adult}
            onChange={(on) => {
              setAdult(on);
              setServer((was) => ({ ...was, adult: undefined }));
            }}
            invalid={left.adult && !!adultIssue}
            describedBy="adult-error"
            label="I'm 18 or over"
          />
          <Check
            checked={uk}
            onChange={setUk}
            label="I live in the UK"
            hint="Anyone can join. Only UK residents can win the prize, and only UK sign-ups count as referrals."
          />
          <Check
            checked={updates}
            onChange={setUpdates}
            label="Send me news and offers"
            hint="Extra news, events and offers from StreamerDraft. Emails about your entry and launch day come either way."
          />
        </div>
      </div>
      {left.adult && adultIssue && <FieldError id="adult-error">{adultIssue}</FieldError>}

      {/* the human check: invisible for nearly everyone (Turnstile.tsx) */}
      <Turnstile ref={human} className={e.human} />

      <Banner banner={banner} />

      <button type="submit" className={`${slot.box} ${e.primary} ${e.submit}`} style={sheetOrder(6)} disabled={busy} aria-busy={busy}>
        <span>
          {busy && <i className={e.spinner} aria-hidden="true" />}
          {busy ? "Registering" : "Register interest"}
        </span>
      </button>
      <p className={`${slot.text} ${e.small}`} style={sheetOrder(7)}>
        We&apos;ll email you a link to confirm your entry, and again when StreamerDraft launches.{" "}
        <button type="button" className={e.inlineLink} onClick={(ev) => onPrivacy(ev.currentTarget)} aria-haspopup="dialog">Privacy</button>
      </p>
    </form>
  );
}

// ---- 2. Check your email ----
function Pending({ entry, sentAt, notice, onSent, onStartAgain }: {
  entry: Entry;
  sentAt: number | null;
  notice: string | null;
  onSent: (at: number) => void; // when the last email went (for the countdown)
  onStartAgain: () => void;
}) {
  const failed = entry.emailSent === false;
  const scout = entry.role === "scout";
  const button = "Confirm my entry"; // what the email's button says (confirmation.ts)
  const [banner, setBanner] = useState<BannerText>(null);
  const [busy, setBusy] = useState(false);
  const [justSent, setJustSent] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const wait = sentAt ? Math.max(0, COOLDOWN - Math.floor((now - sentAt) / 1000)) : 0;

  // the countdown on the Resend button
  useEffect(() => {
    if (!sentAt) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [sentAt]);

  const resend = async () => {
    if (busy || wait > 0) return;
    unlockUiSound();
    setBanner(null);
    setBusy(true);
    try {
      if (entry.preview || !entry.key) {
        onSent(Date.now()); // a preview: pretend it went
        setJustSent(true);
        return;
      }
      const response = await fetch("/api/entry/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: entry.key }),
      });
      const data = await response.json().catch(() => null);
      if (response.ok && data?.ok) {
        if (data.status === "already_confirmed") return; // the page is about to notice by itself
        saveEntry({ emailSent: data.emailSent !== false });
        if (data.emailSent !== false) {
          onSent(Date.now());
          setJustSent(true);
          uiSound("sent");
        } else {
          setBanner({ title: "It didn't send again", text: "Our email service isn't answering. Try again in a few minutes." });
        }
      } else if (data?.status === "too_soon") {
        // one went out recently: count down to when the next one can
        const left = Number(data.retryAfterSeconds) || COOLDOWN;
        setNow(Date.now());
        onSent(Date.now() - (COOLDOWN - left) * 1000);
        setBanner({ title: "One a minute", text: "We just sent one: it can take a minute to arrive. You can send another when the countdown ends." });
      } else if (data?.status === "unknown") {
        saveEntry(null); // this browser's key no longer works: start again
      } else if (response.status === 429) {
        setBanner({ title: "Too many tries", text: "Give it a few minutes, then try again." });
      } else {
        setBanner({ title: "Something went wrong on our side", text: "Try again in a moment." });
      }
    } catch {
      setBanner({ title: "Couldn't reach StreamerDraft", text: "Check your connection, then try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={e.stack}>
      {notice && <p className={`${slot.text} ${e.small}`} style={sheetOrder(2)}>{notice}</p>}

      <div className={`${slot.box} ${e.card}`} style={sheetOrder(2)}>
        <div className={e.cardIn}>
          <div className={e.sent} data-tone={failed ? "bad" : "ok"}>
            <span className={e.sentIcon}>
              <Icon name="mail" />
              {failed ? <span className={e.badge} data-tone="bad">!</span> : <Tick className={e.badgeTick} />}
            </span>
            <div className={e.sentWords}>
              <p className={e.sentLabel}>{failed ? "We couldn't send the email to" : justSent ? "Sent again to" : "Email sent to"}</p>
              <p className={e.sentTo}>{entry.email ?? "your email"}</p>
            </div>
          </div>

          <div className={e.rule} />

          <div className={e.status}>
            <span className={e.statusIcon} data-status="pending"><Icon name="clock" /></span>
            <div>
              <p className={e.statusTitle}>{scout ? "Sign-up pending" : "Entry pending"}</p>
              <p className={e.statusText}>
                {failed
                  ? `Your details are saved. Send the email again, then tap ${button} in it.`
                  : <>Open the email and tap <b>{button}</b>. This updates by itself when you do.</>}
              </p>
              {!failed && <p className={e.waiting}><i aria-hidden="true" />Waiting for you to confirm</p>}
            </div>
          </div>
        </div>
      </div>

      <Banner banner={banner} />

      <div className={e.row}>
        <button
          type="button"
          className={`${slot.box} ${failed ? e.primary : e.secondary} ${e.grow}`}
          style={sheetOrder(3)}
          onClick={resend}
          disabled={busy || wait > 0}
        >
          <span>
            {busy && <i className={e.spinner} aria-hidden="true" />}
            {wait > 0 ? `Resend in ${wait}s` : failed ? "Send it again" : "Resend email"}
          </span>
        </button>
        <button type="button" className={`${slot.box} ${e.quiet}`} style={sheetOrder(4)} onClick={onStartAgain}>
          <span>Wrong email?</span>
        </button>
      </div>

      <p className={`${slot.text} ${e.small}`} style={sheetOrder(5)}>
        Can&apos;t see it? Check your spam or junk folder. The link works for 48 hours.
      </p>
    </div>
  );
}

// ---- 3. You're in ----
// The same for streamers and scouts: both can win (F5)
function YoureIn({ entry, onRules }: { entry: Entry; onRules: (from: HTMLElement) => void }) {
  const scout = entry.role === "scout";
  const title = scout
    ? entry.number ? `Scout #${entry.number} confirmed` : "Scout confirmed"
    : entry.number ? `Entry #${entry.number} confirmed` : "Entry confirmed";
  const said = scout ? "you're in as a scout." : "you're in the draft.";
  return (
    <div className={e.stack}>
      <div className={`${slot.box} ${e.card}`} style={sheetOrder(2)}>
        <div className={`${e.cardIn} ${e.inHead}`}>
          <Tick className={e.bigTick} />
          <div>
            <p className={e.inTitle}>{title}</p>
            <p className={e.inText}>{entry.name ? `${entry.name}, ${said}` : said.charAt(0).toUpperCase() + said.slice(1)}</p>
          </div>
        </div>
      </div>

      {/* turned down on the dashboard: they've had an email, this says the same */}
      {scout && entry.turnedDown && (
        <div className={`${slot.box} ${e.note}`} data-tone="warn" style={sheetOrder(3)}>
          <Icon name="alert" />
          <div>
            <p className={e.noteTitle}>You&apos;re not one of our scouts</p>
            <p className={e.noteText}>We emailed you about it. You&apos;re still in the competition, and your link still works.</p>
          </div>
        </div>
      )}

      <Eligibility eligible={entry.eligible} className={slot.box} style={sheetOrder(3)} />

      {entry.code && (
        <section aria-label="Your referral link">
          <h3 className={`${slot.text} ${e.head}`} style={sheetOrder(4)}>Your referral link</h3>
          <div className={slot.box} style={sheetOrder(5)}>
            <ShareLink code={entry.code} />
          </div>
        </section>
      )}

      {entry.code && <DraftCard role={entry.role} number={entry.number} name={entry.name} code={entry.code} n={6} />}

      <section aria-label="Your referrals">
        <h3 className={`${slot.text} ${e.head}`} style={sheetOrder(6)}>Your referrals</h3>
        <ReferralStats className={slot.box} style={sheetOrder(7)} referrals={entry.referrals} eligible={entry.eligible} />
        {entry.eligible !== false && (
          <p className={`${slot.text} ${e.small}`} style={sheetOrder(8)}>
            A referral counts when someone joins through your link, confirms their email and lives in the UK.
          </p>
        )}
      </section>

      <button type="button" className={`${slot.box} ${e.secondary}`} style={sheetOrder(9)} onClick={(ev) => onRules(ev.currentTarget)} aria-haspopup="dialog">
        <span>Competition rules</span>
      </button>
    </div>
  );
}
