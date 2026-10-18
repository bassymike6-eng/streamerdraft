// src/components/page/ScoutForm.tsx
//
// WHAT THIS IS
// The scout sign-up: for bigger creators who want to draft a small streamer
// and help them grow. It's what "Join as a scout" grows into (JoinSheet.tsx
// shows it; after sending, the same pop-up turns into "Check your email",
// then "You're a scout").
//
// NOT AN APPLICATION (F5): signing up makes you a scout, and like streamers,
// scouts accept the rules when they confirm and can win the competition. We
// check every scout sign-up on the dashboard: if something doesn't look right,
// we turn them down there, and they get an email (src/lib/turn-down-email.ts).
//
// TWO STEPS, SO IT NEVER FEELS LIKE A WALL OF BOXES
//   1. About you        email, name, their channels and socials (1 to 5 links),
//                       audience size, what they make
//   2. How you'd scout  what they can help with (+ "Something else"), how many
//                       weeks they'll help each streamer for (4, 6 or 8), the
//                       commitment, why they want to scout (optional), 18+ / UK
//                       / news, then Sign up
// Continue checks step 1 before moving on; Back keeps everything they typed.
//
// THE COMMITMENT (what they tick "I'm in" to), for every streamer they draft:
//   4, 6 or 8 weeks helping them grow    (their pick, above it)
//   2 feedback calls about their streams
//   1 shout-out to their followers: share the streamer's stream or a clip
//
// THE SAME HABITS AS THE STREAMER FORM (FormParts.tsx)
// Green ticks once a box is right; mistakes only once they've left a box (or
// pressed Continue / Send); the server checks everything again, and its word
// lands under the right box, on the right step. Text is 17px (no iPhone zoom).
// The human check (Turnstile.tsx) only loads on step 2, when it's needed.

import { useEffect, useRef, useState, type FormEvent } from "react";
import { saveEntry } from "./entry";
import { Icon, Tick } from "./EntryParts";
import {
  Banner, Check, Chips, emailProblem, Field, FieldError, FieldLabel, Hint, nameProblem, Segmented,
  type BannerText, type Choice,
} from "./FormParts";
import { savedReferral, useReferral } from "./referral";
import { sheetOrder, slot } from "./Sheet";
import { Turnstile, type TurnstileHandle } from "./Turnstile";
import { uiSound, unlockUiSound } from "./uiSound";
import e from "./Entry.module.css";

// ---- The choices (the values are what the server and database expect: validation.ts) ----
type Audience = "under_10k" | "10k_50k" | "50k_100k" | "100k_plus";
type Content = "streaming" | "short_form" | "videos" | "podcasts" | "other";
type Offer = "obs_setup" | "multistreaming" | "clipping" | "raids" | "collabs" | "feedback" | "socials" | "intros" | "other";
type Weeks = 4 | 6 | 8;

const AUDIENCE: Choice<Audience>[] = [
  { value: "under_10k", label: "Under 10k" },
  { value: "10k_50k", label: "10k–50k" },
  { value: "50k_100k", label: "50k–100k" },
  { value: "100k_plus", label: "100k+" },
];
const CONTENT: Choice<Content>[] = [
  { value: "streaming", label: "Streams" },
  { value: "short_form", label: "Short videos" },
  { value: "videos", label: "Videos" },
  { value: "podcasts", label: "Podcasts" },
  { value: "other", label: "Something else" },
];
const OFFERS: Choice<Offer>[] = [
  { value: "obs_setup", label: "Stream setup" },
  { value: "multistreaming", label: "Multistreaming" },
  { value: "clipping", label: "Clips & editing" },
  { value: "raids", label: "Raids & shout-outs" },
  { value: "collabs", label: "Collabs" },
  { value: "feedback", label: "Feedback on streams" },
  { value: "socials", label: "Growing on socials" },
  { value: "intros", label: "Intros to creators" },
  { value: "other", label: "Something else" },
];
const WEEKS: Choice<Weeks>[] = [
  { value: 4, label: "4 weeks" },
  { value: 6, label: "6 weeks" },
  { value: 8, label: "8 weeks" },
];

// ---- Their links ----
const MAX_LINKS = 5; // the server's limit too
const OTHER_MAX = 120;
const PITCH_MAX = 200;
// One example per box, so it's clear any platform goes
const LINK_EXAMPLES = ["twitch.tv/johndoe", "youtube.com/@johndoe", "tiktok.com/@johndoe", "instagram.com/johndoe", "x.com/johndoe"];

// The same rule as the server's (validation.ts): add https:// if it's missing,
// then it has to be a web address ending like ".tv" or ".com"
function asLink(value: string): URL | null {
  const v = value.trim();
  if (!v || v.length > 200) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
    return /^https?:$/.test(url.protocol) && /\.[a-z]{2,}$/i.test(url.hostname) ? url : null;
  } catch {
    return null;
  }
}
// The platform's name, shown in the box once the link's right (words, not logos)
const PLATFORMS: [RegExp, string][] = [
  [/(^|\.)twitch\.tv$/, "Twitch"],
  [/(^|\.)(youtube\.com|youtu\.be)$/, "YouTube"],
  [/(^|\.)tiktok\.com$/, "TikTok"],
  [/(^|\.)instagram\.com$/, "Instagram"],
  [/(^|\.)(x\.com|twitter\.com)$/, "X"],
  [/(^|\.)kick\.com$/, "Kick"],
  [/(^|\.)facebook\.com$/, "Facebook"],
  [/(^|\.)threads\.(net|com)$/, "Threads"],
  [/(^|\.)snapchat\.com$/, "Snapchat"],
  [/(^|\.)bsky\.app$/, "Bluesky"],
  [/(^|\.)(discord\.gg|discord\.com)$/, "Discord"],
];
function platformOf(url: URL | null): string | null {
  if (!url) return null;
  const host = url.hostname.toLowerCase();
  return PLATFORMS.find(([shape]) => shape.test(host))?.[1] ?? null;
}
// Two ways of typing the same link count as the same link
const sameLink = (url: URL) => `${url.hostname.replace(/^www\./, "")}${url.pathname.replace(/\/$/, "")}`.toLowerCase();

type Link = { key: number; value: string };
type Step = 1 | 2;

// Which step each of the server's field names is on (for its mistakes)
const STEP_OF: Record<string, Step> = {
  email: 1, displayName: 1, platformUrls: 1, audienceSize: 1, contentTypes: 1,
  scoutOffers: 2, scoutOfferOther: 2, scoutWeeks: 2, scoutPitch: 2, commitmentAccepted: 2, ageConfirmed: 2,
};
type Problems = Partial<Record<keyof typeof STEP_OF, string>>;

// The nearest box that scrolls (the pop-up's body), to go back to the top on a new step
function scrollParent(el: HTMLElement | null): HTMLElement | null {
  for (let at = el?.parentElement; at; at = at.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(at).overflowY)) return at;
  }
  return null;
}

export function ScoutForm({ open, shown, onApplied, onPrivacy }: {
  open: boolean;
  shown: boolean; // false once it's sent (it's kept, hidden, for "Wrong email?")
  onApplied: (message: string | null, sent: boolean) => void;
  onPrivacy: (from: HTMLElement) => void;
}) {
  const [step, setStep] = useState<Step>(1);

  // Step 1
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const nextKey = useRef(1);
  const [links, setLinks] = useState<Link[]>([{ key: 0, value: "" }]);
  const [audience, setAudience] = useState<Audience | null>(null);
  const [content, setContent] = useState<Content[]>([]);
  // Step 2
  const [offers, setOffers] = useState<Offer[]>([]);
  const [other, setOther] = useState("");
  const [weeks, setWeeks] = useState<Weeks | null>(null);
  const [pitch, setPitch] = useState("");
  const [committed, setCommitted] = useState(false);
  const [adult, setAdult] = useState(false);
  const [uk, setUk] = useState(false);
  const [updates, setUpdates] = useState(false);

  // Which boxes they've been in and left, or tried to move on from (only then
  // do we point out mistakes), and the server's word on a box until they change it
  const [left, setLeft] = useState<Record<string, boolean>>({});
  const [server, setServer] = useState<Problems>({});
  const [banner, setBanner] = useState<BannerText>(null);
  const [busy, setBusy] = useState(false);
  const referral = useReferral();

  // Back after "Wrong email?": start on step 1, where the email is, with
  // everything else as they left it (React's way of reacting to a prop
  // change: during render, not in an effect)
  const [wasShown, setWasShown] = useState(shown);
  if (shown !== wasShown) {
    setWasShown(shown);
    if (shown) {
      setStep(1);
      setBanner(null);
      setServer({});
    }
  }

  const form = useRef<HTMLFormElement>(null);
  const stepHead = useRef<HTMLHeadingElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const linkRefs = useRef<(HTMLInputElement | null)[]>([]);
  const audienceRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLInputElement>(null);
  const offersRef = useRef<HTMLInputElement>(null);
  const otherRef = useRef<HTMLInputElement>(null);
  const weeksRef = useRef<HTMLInputElement>(null);
  const commitRef = useRef<HTMLInputElement>(null);
  const adultRef = useRef<HTMLInputElement>(null);
  const human = useRef<TurnstileHandle>(null);

  // On a computer, the cursor goes straight into the email box once it's open
  useEffect(() => {
    if (!open || !window.matchMedia("(pointer: fine)").matches) return;
    const t = window.setTimeout(() => emailRef.current?.focus({ preventScroll: true }), 650);
    return () => window.clearTimeout(t);
  }, [open]);

  // ---- What's wrong, box by box ----
  const parsed = links.map((link) => asLink(link.value));
  const linkProblems = links.map((link, i) => {
    if (!link.value.trim()) return null; // an empty box is just left out
    const url = parsed[i];
    if (!url) return link.value.trim().length > 200 ? "That link is too long." : "That doesn't look like a link. Try twitch.tv/yourname";
    const firstSame = parsed.findIndex((other) => other && sameLink(other) === sameLink(url));
    return firstSame < i ? "You've added this one already." : null;
  });
  const anyLink = parsed.some(Boolean);
  const problems: Problems = {
    email: server.email ?? emailProblem(email) ?? undefined,
    displayName: server.displayName ?? nameProblem(name) ?? undefined,
    platformUrls: server.platformUrls ?? (anyLink ? undefined : "Add a link to your channel or socials."),
    audienceSize: server.audienceSize ?? (audience ? undefined : "Pick your audience size."),
    contentTypes: server.contentTypes ?? (content.length ? undefined : "Pick at least one."),
    scoutOffers: server.scoutOffers ?? (offers.length ? undefined : "Pick at least one thing you can help with."),
    scoutOfferOther: server.scoutOfferOther ?? (offers.includes("other") && !other.trim() ? "Say what else you can help with." : undefined),
    scoutWeeks: server.scoutWeeks ?? (weeks ? undefined : "Pick 4, 6 or 8 weeks."),
    commitmentAccepted: server.commitmentAccepted ?? (committed ? undefined : "Tick “I'm in” to agree to the commitment."),
    ageConfirmed: server.ageConfirmed ?? (adult ? undefined : "You need to be 18 or over to sign up."),
    scoutPitch: server.scoutPitch,
  };
  // Shown only once they've left the box (or pressed Continue / Send)
  const mistake = (key: keyof Problems) => (left[key] || server[key] ? problems[key] ?? null : null);
  const forget = (key: keyof Problems) => setServer((was) => ({ ...was, [key]: undefined }));

  // Where to put the cursor for each problem, in the order they appear
  const focusFor: Record<string, () => void> = {
    email: () => emailRef.current?.focus(),
    displayName: () => nameRef.current?.focus(),
    platformUrls: () => {
      const bad = linkProblems.findIndex(Boolean);
      linkRefs.current[bad >= 0 ? bad : 0]?.focus();
    },
    audienceSize: () => audienceRef.current?.focus(),
    contentTypes: () => contentRef.current?.focus(),
    scoutOffers: () => offersRef.current?.focus(),
    scoutOfferOther: () => otherRef.current?.focus(),
    scoutWeeks: () => weeksRef.current?.focus(),
    commitmentAccepted: () => commitRef.current?.focus(),
    ageConfirmed: () => adultRef.current?.focus(),
  };
  const stepKeys = (which: Step) => Object.keys(STEP_OF).filter((key) => STEP_OF[key] === which);
  // A link with a mistake in it counts as a step 1 problem too
  const stepProblem = (which: Step) =>
    stepKeys(which).find((key) => problems[key as keyof Problems] || (key === "platformUrls" && linkProblems.some(Boolean)));

  // ---- Moving between the steps ----
  const goTo = (next: Step) => {
    setBanner(null);
    setStep(next);
    // back to the top of the pop-up, and tell screen readers where they are
    // (the heading gets the focus quietly: no keyboard popping up on phones)
    window.requestAnimationFrame(() => {
      const scroller = scrollParent(form.current);
      if (scroller) scroller.scrollTop = 0;
      stepHead.current?.focus({ preventScroll: true });
    });
  };

  const touchStep = (which: Step) =>
    setLeft((was) => ({ ...was, ...Object.fromEntries(stepKeys(which).map((key) => [key, true])), links: which === 1 || was.links }));

  const continueOn = () => {
    touchStep(1);
    const first = stepProblem(1);
    if (first) {
      uiSound("error");
      return focusFor[first]?.();
    }
    uiSound("step"); // the draft call's first note (uiSound.ts)
    goTo(2);
  };

  // ---- Sending it ----
  const send = async () => {
    if (busy) return;
    unlockUiSound(); // (the "sent" sound comes once the server answers)
    setBanner(null);
    touchStep(2);
    const first = stepProblem(2);
    if (first) {
      uiSound("error");
      return focusFor[first]?.();
    }
    // (step 1 was fine when they left it, but the server may have had its say since)
    if (stepProblem(1)) {
      uiSound("error");
      touchStep(1);
      return goTo(1);
    }
    if (human.current?.needsTick()) {
      uiSound("error");
      setBanner({ title: "One more thing", text: "Tick “Verify you are human” just above, then press Sign up." });
      return;
    }

    setBusy(true);
    try {
      const turnstileToken = await human.current?.token();
      const response = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: "scout",
          email: email.trim(),
          displayName: name.trim(),
          // the links they filled in, as typed (the server tidies them the same way)
          platformUrls: links.map((link) => link.value.trim()).filter(Boolean),
          audienceSize: audience,
          contentTypes: content,
          scoutOffers: offers,
          scoutOfferOther: offers.includes("other") ? other.trim() : undefined,
          scoutWeeks: weeks,
          scoutPitch: pitch.trim() || undefined,
          commitmentAccepted: committed,
          ageConfirmed: adult,
          basedInUk: uk,
          marketingOptIn: updates,
          ref: savedReferral() ?? undefined,
          turnstileToken,
        }),
      });
      const data = await response.json().catch(() => null);

      if (response.ok && data?.ok) {
        // Sent! (or they'd signed up before and not confirmed: a fresh link went out)
        saveEntry({
          status: "pending",
          role: data.role === "prospect" ? "prospect" : "scout",
          key: data.statusKey,
          email: data.email,
          name: name.trim(),
          emailSent: data.emailSent !== false,
          number: null, code: null, eligible: null, referrals: null,
        });
        onApplied(data.status === "resent" ? data.message ?? null : null, data.emailSent !== false);
        uiSound(data.emailSent !== false ? "sent" : "error"); // the call's first two notes, unfinished
        return; // the pop-up switches to "Check your email"
      }

      uiSound("error");
      human.current?.reset(); // its token's used up: get a fresh one for the next try
      const fields = (data?.fields ?? {}) as Record<string, string[] | undefined>;
      const said = Object.keys(STEP_OF).filter((key) => fields[key]?.[0]);
      if (data?.status === "already_confirmed") {
        setServer({ email: "This email's already signed up and confirmed. Use a different one to sign up again." });
        touchStep(1);
        goTo(1);
      } else if (said.length > 0) {
        // the server's word under each box it was about; go to the first one's step
        setServer(Object.fromEntries(said.map((key) => [key, fields[key]![0]])));
        const where = STEP_OF[said[0]];
        touchStep(where);
        if (where !== step) goTo(where);
        else window.requestAnimationFrame(() => focusFor[said[0]]?.());
      } else if (data?.status === "human_check_failed") {
        setBanner({ title: "The human check didn't go through", text: "Give it a second, then press Sign up again. Still stuck? Refresh the page." });
      } else if (response.status === 429) {
        setBanner({ title: "Too many tries", text: "Give it a few minutes, then try again." });
      } else if (response.status >= 500 || !data) {
        setBanner({ title: "Something went wrong on our side", text: "Your answers are still here. Try again in a moment." });
      } else {
        setBanner({ title: "That didn't work", text: data.error ?? "Check your answers and try again." });
      }
    } catch {
      uiSound("error");
      human.current?.reset();
      setBanner({ title: "Couldn't reach StreamerDraft", text: "Check your connection, then try again." });
    } finally {
      setBusy(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (step === 1) continueOn();
    else void send();
  };

  // ---- Links: add, change, remove ----
  const setLink = (key: number, value: string) => {
    setLinks((was) => was.map((link) => (link.key === key ? { ...link, value } : link)));
    forget("platformUrls");
  };
  const addLink = () => {
    const key = nextKey.current++;
    setLinks((was) => [...was, { key, value: "" }]);
    window.requestAnimationFrame(() => linkRefs.current[links.length]?.focus());
  };
  const removeLink = (key: number, index: number) => {
    setLinks((was) => was.filter((link) => link.key !== key));
    forget("platformUrls");
    window.requestAnimationFrame(() => linkRefs.current[Math.max(0, index - 1)]?.focus());
  };

  const titles = { 1: "About you", 2: "How you'd scout" };

  return (
    <form ref={form} className={e.form} onSubmit={submit} noValidate>
      {/* Where they are: two bars, like a progress bar in two halves */}
      <div className={`${slot.box} ${e.progress}`} style={sheetOrder(2)} data-step={step} aria-hidden="true">
        <span data-on="" />
        <span data-on={step === 2 || undefined} />
      </div>
      <h3 ref={stepHead} tabIndex={-1} className={`${slot.text} ${e.stepHead}`} style={sheetOrder(2)}>
        {titles[step]}{" "}
        <span className={e.stepOf}>Step {step} of 2</span>
      </h3>

      {/* key: a fresh fill-in for each step */}
      <div key={step} className={e.formPart}>
        {step === 1 ? (
          <>
            {referral && (
              <p className={`${slot.text} ${e.via}`} style={sheetOrder(3)}>
                <Icon name="link" />
                You&apos;re signing up through a friend&apos;s link.
              </p>
            )}

            <Field
              id="scout-email"
              n={3}
              label="Email"
              ok={!problems.email}
              error={mistake("email")}
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
                    forget("email");
                  }}
                  onBlur={() => email && setLeft((was) => ({ ...was, email: true }))}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter") {
                      ev.preventDefault();
                      nameRef.current?.focus();
                    }
                  }}
                />
              }
            />

            <Field
              id="scout-name"
              n={4}
              label="Name or handle"
              hint="What streamers will know you as."
              ok={!problems.displayName}
              error={mistake("displayName")}
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
                  enterKeyHint="next"
                  placeholder="e.g. John Doe"
                  maxLength={30}
                  value={name}
                  onChange={(ev) => {
                    setName(ev.target.value);
                    forget("displayName");
                  }}
                  onBlur={() => name && setLeft((was) => ({ ...was, displayName: true }))}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter") {
                      ev.preventDefault();
                      linkRefs.current[0]?.focus();
                    }
                  }}
                />
              }
            />

            {/* Their channels and socials: one box to start, up to 5 */}
            <div className={e.field}>
              <FieldLabel id="scout-links-label" n={5} label="Your channels and socials" />
              <div className={e.links}>
                {links.map((link, i) => {
                  const problem = left[`link${link.key}`] || left.links ? linkProblems[i] : null;
                  const platform = platformOf(parsed[i]);
                  const ok = !!parsed[i] && !linkProblems[i];
                  return (
                    <div key={link.key} className={e.linkRow}>
                      <div
                        className={`${slot.box} ${e.control}`}
                        style={sheetOrder(5)}
                        data-ok={ok || undefined}
                        data-invalid={problem || (i === 0 && mistake("platformUrls") && !linkProblems.some(Boolean)) ? true : undefined}
                      >
                        <input
                          ref={(el) => {
                            linkRefs.current[i] = el;
                          }}
                          className={e.input}
                          // the platform's name sits on the right: keep the text clear of it
                          style={ok && platform ? { paddingRight: `${62 + platform.length * 8}px` } : undefined}
                          type="url"
                          name={`link-${i + 1}`}
                          inputMode="url"
                          autoComplete={i === 0 ? "url" : "off"}
                          autoCapitalize="none"
                          autoCorrect="off"
                          spellCheck={false}
                          enterKeyHint={i < links.length - 1 ? "next" : "go"}
                          placeholder={LINK_EXAMPLES[i] ?? LINK_EXAMPLES[0]}
                          maxLength={200}
                          value={link.value}
                          aria-label={i === 0 ? "Your channels and socials: link 1" : `Link ${i + 1}`}
                          aria-invalid={problem ? true : undefined}
                          aria-describedby={problem ? `scout-link-${link.key}-error` : "scout-links-hint"}
                          onChange={(ev) => {
                            setLink(link.key, ev.target.value);
                            setLeft((was) => ({ ...was, [`link${link.key}`]: false }));
                          }}
                          onBlur={() => link.value && setLeft((was) => ({ ...was, [`link${link.key}`]: true }))}
                          onKeyDown={(ev) => {
                            if (ev.key === "Enter" && i < links.length - 1) {
                              ev.preventDefault();
                              linkRefs.current[i + 1]?.focus();
                            }
                          }}
                        />
                        {ok && platform && <span className={e.platform}>{platform}</span>}
                        <Tick className={e.tick} />
                      </div>
                      {i > 0 && (
                        <button type="button" className={e.removeLink} onClick={() => removeLink(link.key, i)} aria-label={`Remove link ${i + 1}`}>
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 12h10" /></svg>
                        </button>
                      )}
                      {problem && <FieldError id={`scout-link-${link.key}-error`}>{problem}</FieldError>}
                    </div>
                  );
                })}
              </div>
              {mistake("platformUrls") && !linkProblems.some(Boolean) && (
                <FieldError id="scout-links-error">{mistake("platformUrls")}</FieldError>
              )}
              {links.length < MAX_LINKS && (
                <button type="button" className={`${slot.text} ${e.addLink}`} style={sheetOrder(5)} onClick={addLink}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6.5v11M6.5 12h11" /></svg>
                  Add another link
                </button>
              )}
              <Hint id="scout-links-hint" n={5}>Where streamers can find you. Your biggest one first.</Hint>
            </div>

            <Segmented
              id="scout-audience"
              n={6}
              label="Audience size"
              hint="Followers or subscribers on your biggest platform."
              choices={AUDIENCE}
              value={audience}
              onChange={(next) => {
                setAudience(next);
                forget("audienceSize");
              }}
              error={mistake("audienceSize")}
              firstRef={audienceRef}
            />

            <Chips
              id="scout-content"
              n={7}
              label="What do you make?"
              hint="Pick all that fit."
              choices={CONTENT}
              value={content}
              onChange={(next) => {
                setContent(next);
                forget("contentTypes");
              }}
              error={mistake("contentTypes")}
              firstRef={contentRef}
            />

            <Banner banner={banner} />

            <button type="submit" className={`${slot.box} ${e.primary} ${e.submit}`} style={sheetOrder(8)}>
              <span>Continue</span>
            </button>
          </>
        ) : (
          <>
            <div className={e.offers}>
              <Chips
                id="scout-offers"
                n={3}
                label="What can you help with?"
                hint={offers.includes("other") ? undefined : "Pick everything you'd be up for."}
                choices={OFFERS}
                value={offers}
                onChange={(next) => {
                  setOffers(next);
                  forget("scoutOffers");
                }}
                error={mistake("scoutOffers")}
                firstRef={offersRef}
              />
              {/* "Something else": say what */}
              {offers.includes("other") && (
                <Field
                  id="scout-other"
                  n={3}
                  label="What else?"
                  ok={!problems.scoutOfferOther}
                  error={mistake("scoutOfferOther")}
                  input={
                    <input
                      ref={otherRef}
                      className={e.input}
                      type="text"
                      name="other-help"
                      autoComplete="off"
                      enterKeyHint="next"
                      placeholder="e.g. thumbnails, sponsorship tips"
                      maxLength={OTHER_MAX}
                      value={other}
                      onChange={(ev) => {
                        setOther(ev.target.value);
                        forget("scoutOfferOther");
                      }}
                      onBlur={() => setLeft((was) => ({ ...was, scoutOfferOther: true }))}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter") ev.preventDefault();
                      }}
                    />
                  }
                />
              )}
            </div>

            <Segmented
              id="scout-weeks"
              n={4}
              label="How long can you help each streamer for?"
              hint="Pick what you can really give. Shorter is fine."
              choices={WEEKS}
              value={weeks}
              onChange={(next) => {
                setWeeks(next);
                forget("scoutWeeks");
              }}
              error={mistake("scoutWeeks")}
              firstRef={weeksRef}
            />

            {/* The commitment: what they're agreeing to, with their weeks in it */}
            <div className={e.field}>
              <p className={`${slot.text} ${e.label}`} style={sheetOrder(5)}>Your commitment</p>
              <div className={`${slot.box} ${e.commit}`} style={sheetOrder(5)} data-invalid={mistake("commitmentAccepted") ? true : undefined}>
                <div className={e.commitIn}>
                  <p className={e.commitHead}>For every streamer you draft</p>
                  <ul className={e.commitList}>
                    <li>
                      <Icon name="calendar" />
                      <span><b>{weeks ? `${weeks} weeks` : "4, 6 or 8 weeks"}</b> helping them grow</span>
                    </li>
                    <li>
                      <Icon name="phone" />
                      <span><b>2 feedback calls</b> about their streams</span>
                    </li>
                    <li>
                      <Icon name="megaphone" />
                      <span><b>1 shout-out</b> to your followers: share their stream or a clip</span>
                    </li>
                  </ul>
                </div>
                <Check
                  inputRef={commitRef}
                  checked={committed}
                  onChange={(on) => {
                    setCommitted(on);
                    forget("commitmentAccepted");
                  }}
                  invalid={!!mistake("commitmentAccepted")}
                  describedBy="scout-commit-error"
                  label="I'm in"
                  hint="I'll do this for every streamer I draft."
                />
              </div>
              {mistake("commitmentAccepted") && <FieldError id="scout-commit-error">{mistake("commitmentAccepted")}</FieldError>}
            </div>

            {/* Why they want to scout: optional */}
            <div className={e.field}>
              <FieldLabel htmlFor="scout-pitch" n={6} label="Why do you want to scout?" optional />
              <div className={`${slot.box} ${e.control} ${e.area}`} style={sheetOrder(6)}>
                <textarea
                  id="scout-pitch"
                  className={e.input}
                  name="pitch"
                  rows={3}
                  maxLength={PITCH_MAX}
                  placeholder="e.g. I wish someone had done this for me when I started."
                  value={pitch}
                  onChange={(ev) => {
                    setPitch(ev.target.value);
                    forget("scoutPitch");
                  }}
                  aria-describedby="scout-pitch-count"
                />
                <span id="scout-pitch-count" className={e.count} data-near={pitch.length > PITCH_MAX - 20 || undefined}>
                  {pitch.length}/{PITCH_MAX}
                </span>
              </div>
              {server.scoutPitch && <FieldError id="scout-pitch-error">{server.scoutPitch}</FieldError>}
            </div>

            <div className={`${slot.box} ${e.checks}`} style={sheetOrder(7)}>
              <div>
                <Check
                  inputRef={adultRef}
                  checked={adult}
                  onChange={(on) => {
                    setAdult(on);
                    forget("ageConfirmed");
                  }}
                  invalid={!!mistake("ageConfirmed")}
                  describedBy="scout-adult-error"
                  label="I'm 18 or over"
                />
                <Check
                  checked={uk}
                  onChange={setUk}
                  label="I live in the UK"
                  hint="Anyone can sign up. Only UK residents can win the prize, and only UK sign-ups count as referrals."
                />
                <Check
                  checked={updates}
                  onChange={setUpdates}
                  label="Send me news and offers"
                  hint="Extra news, events and offers from StreamerDraft. Emails about your entry and launch day come either way."
                />
              </div>
            </div>
            {mistake("ageConfirmed") && <FieldError id="scout-adult-error">{mistake("ageConfirmed")}</FieldError>}

            {/* the human check: invisible for nearly everyone (Turnstile.tsx) */}
            <Turnstile ref={human} className={e.human} />

            <Banner banner={banner} />

            {/* Back and Send side by side, the same height (Apple's rule for buttons that share a row) */}
            <div className={e.formRow}>
              <button type="button" className={`${slot.box} ${e.secondary} ${e.back}`} style={sheetOrder(8)} onClick={() => goTo(1)} disabled={busy}>
                <span>Back</span>
              </button>
              <button type="submit" className={`${slot.box} ${e.primary} ${e.grow}`} style={sheetOrder(8)} disabled={busy} aria-busy={busy}>
                <span>
                  {busy && <i className={e.spinner} aria-hidden="true" />}
                  {busy ? "Signing up" : "Sign up"}
                </span>
              </button>
            </div>
            <p className={`${slot.text} ${e.small}`} style={sheetOrder(9)}>
              We&apos;ll email you a link to confirm your entry. We check every scout sign-up, and if something doesn&apos;t look right, we&apos;ll let you know by email.{" "}
              <button type="button" className={e.inlineLink} onClick={(ev) => onPrivacy(ev.currentTarget)} aria-haspopup="dialog">Privacy</button>
            </p>
          </>
        )}
      </div>
    </form>
  );
}
