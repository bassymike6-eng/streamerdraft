// src/components/page/Privacy.tsx
//
// WHAT THIS IS
// The privacy policy: what StreamerDraft collects, why, who else touches it,
// how long it's kept, and people's rights. Shown as its own page (/privacy)
// and as a pop-up from the footer and the sign-up form.
//
// It describes what the code ACTUALLY does, so if that changes (a new form
// field, analytics, a new email service), this has to change with it.
//
// ⚠ READ BEFORE GOING LIVE (Michael)
// - Who you are comes from src/lib/site.ts (the same as the rules).
// - Fill in HOSTING_PROVIDER below once you've picked where the site lives.
// - Check the "How long we keep it" times are what you'll actually do.
// It's written to fit UK GDPR, but it's a starting point, not legal advice.

import type { ReactNode, RefObject } from "react";
import { CONTACT_EMAIL, PROMOTER_ADDRESS, PROMOTER_NAME } from "@/lib/site";
import { Sheet, sheetOrder, slot } from "./Sheet";
import e from "./Entry.module.css";

// ⚠ Fill in: the company that hosts the site and its database (e.g. your VPS provider)
const HOSTING_PROVIDER = "IONOS";

export const PRIVACY_UPDATED = "15 October 2026";

const WHO = PROMOTER_NAME || "michael";
const WHERE = PROMOTER_ADDRESS || "Milton Keynes";
const EMAIL = CONTACT_EMAIL || "bassymike6@gmail.com";
const HOST = HOSTING_PROVIDER || "ionos";

const SECTIONS: { title: string; body: ReactNode }[] = [
  {
    title: "Who we are",
    body: (
      <p>StreamerDraft is run by <b>{WHO}</b>, {WHERE}. We decide how your information is used, which makes us the &ldquo;controller&rdquo; under UK data protection law. Questions or requests: <b>{EMAIL}</b>.</p>
    ),
  },
  {
    title: "What we collect",
    body: (
      <>
        <p><b>When you join:</b> your email address, your name or handle, that you&apos;re 18 or over, whether you live in the UK, whether you want news and offers, and whose referral link you came through (if any).</p>
        <p><b>If you sign up as a scout, also:</b> the links to your channels and socials, your audience size, what you make, what you could help streamers with, how many weeks you&apos;d give each one, why you want to scout (if you told us) and when you agreed to the scout commitment.</p>
        <p><b>Automatically:</b> the country your internet connection is in (from Cloudflare, when you join and when you confirm), a scrambled fingerprint of your IP address to spot fake sign-ups (we don&apos;t keep the address itself), and when you joined, confirmed and accepted the competition rules.</p>
      </>
    ),
  },
  {
    title: "Why we use it",
    body: (
      <ul>
        <li><b>To run your entry and the competition:</b> confirming your email, counting your referrals, checking who can win, and contacting the winner. The law lets us because it&apos;s needed for the competition you&apos;ve entered (the rules are our agreement with you).</li>
        <li><b>To check scout applications</b> and, once StreamerDraft launches, to pair scouts with streamers. That&apos;s what you signed up for, and it&apos;s in our legitimate interests.</li>
        <li><b>To tell you when StreamerDraft launches,</b> which is what you registered your interest for. That&apos;s in our legitimate interests, and you can tell us to stop any time.</li>
        <li><b>To stop cheating and keep the site safe:</b> the country check, the IP fingerprint and the &ldquo;are you human?&rdquo; check. Also our legitimate interests.</li>
        <li><b>News and offers,</b> only if you ticked the box. That&apos;s your consent, and you can take it back any time: use the unsubscribe link in the email, or email us.</li>
      </ul>
    ),
  },
  {
    title: "What other people can see",
    body: (
      <p>Nobody else sees your email or your referral numbers. If people joined through your link, you only see how many, never who they are. Scout sign-ups are only seen by us. If you win, we say your name or handle on stream.</p>
    ),
  },
  {
    title: "Who else handles it",
    body: (
      <>
        <p>Only companies that do a job for us, and only for that job:</p>
        <ul>
          <li><b>Resend</b> sends our emails.</li>
          <li><b>Cloudflare</b> protects the site and runs the &ldquo;are you human?&rdquo; check (Turnstile).</li>
          <li><b>{HOST}</b> hosts the site and its database.</li>
        </ul>
        <p>We never sell your information, and there are no adverts or tracking. Some of these companies are based in the US. When your information goes there, it&apos;s protected by the safeguards UK law requires.</p>
      </>
    ),
  },
  {
    title: "Your browser",
    body: (
      <p>No advertising or tracking cookies.    We save two small notes in your browser: one so the page can show your own entry (whether it&apos;s confirmed, your link, and a private key that only works for your entry), and one if you turn the site&apos;s sound off, so it stays off. Clearing your browser&apos;s data removes them. Cloudflare may set a cookie it needs to keep the site secure. If you open someone&apos;s referral link, its code stays in the page&apos;s address, not on your device.</p>
    ),
  },
  {
    title: "How long we keep it",
    body: (
      <ul>
        <li><b>Your entry:</b> until 12 months after the competition closes, then we delete it, unless you&apos;ve carried on with StreamerDraft by then.</li>
        <li><b>If you unsubscribe:</b> we keep just your email on a &ldquo;don&apos;t email&rdquo; list, so we never email you by mistake.</li>
        <li><b>The winner:</b> their details and the prize records for up to 2 years, in case of questions about the competition.</li>
      </ul>
    ),
  },
  {
    title: "Your rights",
    body: (
      <>
        <p>You can ask us for a copy of your information, to correct it, to delete it, to stop or limit how we use it, or to send it to you in a format you can take elsewhere. Email <b>{EMAIL}</b> and we&apos;ll reply within a month.</p>
        <p>If you&apos;re not happy with how we&apos;ve handled your information, you can complain to the Information Commissioner&apos;s Office (ICO) at ico.org.uk or on 0303 123 1113.</p>
      </>
    ),
  },
  {
    title: "Age",
    body: <p>StreamerDraft is for people aged 18 or over. If we find out someone under 18 has joined, we delete their details.</p>,
  },
  {
    title: "Changes",
    body: <p>If we change this policy, we&apos;ll update this page and its date. If it&apos;s a big change, we&apos;ll email you too.</p>,
  },
];

export function PrivacyContent() {
  return (
    <div className={e.view}>
      <div className={e.rules}>
        {SECTIONS.map((section, i) => (
          <section key={section.title} className={slot.text} style={sheetOrder(Math.min(2 + i, 8))}>
            <h3>{section.title}</h3>
            {section.body}
          </section>
        ))}
        <p className={`${e.small} ${e.rulesFoot}`}>Last updated {PRIVACY_UPDATED}.</p>
      </div>
    </div>
  );
}

// The policy in its own pop-up. `origin`: what it grows out of.
export function PrivacySheet({ open, onClose, origin, footer }: {
  open: boolean;
  onClose: () => void;
  origin?: RefObject<HTMLElement | null>;
  footer?: ReactNode;
}) {
  return (
    <Sheet open={open} onClose={onClose} origin={origin} title="Privacy" subtitle="What we collect, why, and your rights" footer={footer}>
      <PrivacyContent />
    </Sheet>
  );
}
