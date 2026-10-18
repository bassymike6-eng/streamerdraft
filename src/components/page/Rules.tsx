// src/components/page/Rules.tsx
//
// WHAT THIS IS
// The competition rules (the "terms" of the GTA 6 referral competition), in
// their own pop-up. The confirm page opens it: people have to open the rules
// before they can tick "I've read the rules" and confirm their entry.
//
// ⚠ READ THESE BEFORE GOING LIVE (Michael)
// They're written to fit the UK's rules for prize promotions (the CAP Code,
// section 8), but they're a starting point, not legal advice. Your name,
// address and contact email go in src/lib/site.ts (rule 10 shows them).
// Check the prize line is what you'll actually give, and change anything
// that isn't how you'll run it.

import type { ReactNode, RefObject } from "react";
import { CONTACT_EMAIL, PROMOTER_ADDRESS, PROMOTER_NAME } from "@/lib/site";
import { Sheet, sheetOrder, slot } from "./Sheet";
import e from "./Entry.module.css";

// Who runs it (filled in in src/lib/site.ts). Until they are, the rules say
// so in brackets, so it's obvious on the page that something's missing.
const PROMOTER = `StreamerDraft, run by ${PROMOTER_NAME || "[your name]"}, ${PROMOTER_ADDRESS || "[your address]"}`;
const CONTACT = CONTACT_EMAIL || "[your contact email]";

export const RULES_UPDATED = "18 October 2026";

// Each rule: a heading and what it says (shown numbered)
const RULES: { title: string; body: ReactNode }[] = [
  {
    title: "Who can enter",
    body: (
      <>
        <p>The competition is open to <b>UK residents aged 18 or over</b>. Anyone can join StreamerDraft, but only UK residents can win the prize or count as someone&apos;s referral.</p>
        <p>It&apos;s open to <b>streamers and scouts</b>: join StreamerDraft as either and you can enter. Scouts count towards the Road to 300 and can win, just like streamers.</p>
        <p>Signing up as a scout makes you a scout straight away: there&apos;s no application. If your scout details don&apos;t check out, we may turn you down as a scout. We&apos;ll email you if we do, you won&apos;t be one of our scouts, and you can&apos;t sign up as a scout again with that email, but <b>you stay in the competition</b>. Made-up details or pretending to be someone else are different: those can get you disqualified (see &quot;Playing fair&quot;).</p>
        <p>We check where you are from what you tell us and from the country of your internet connection when you sign up and when you confirm. If those don&apos;t match up, your entry may not count.</p>
      </>
    ),
  },
  {
    title: "How to enter",
    body: (
      <>
        <p>Join StreamerDraft as a streamer or a scout, then confirm your email and accept these rules. That&apos;s your entry. It&apos;s free: there&apos;s nothing to buy.</p>
        <p><b>One entry per person.</b> Extra entries using other email addresses don&apos;t count.</p>
      </>
    ),
  },
  {
    title: "When it closes",
    body: <p>The competition closes at <b>23:59 UK time on Monday 16 November 2026</b>. Referrals have to be confirmed by then to count.</p>,
  },
  {
    title: "How to win",
    body: (
      <>
        <p>Once you&apos;ve confirmed, you get your own referral link. Share it. A referral counts when someone:</p>
        <ul>
          <li>joins StreamerDraft through your link,</li>
          <li>confirms their email before the competition closes, and</li>
          <li>is a UK resident (by the same check as above).</li>
        </ul>
        <p>Whoever has the <b>most counted referrals</b> when it closes wins. If two or more people have the same number, the one who reached it first wins.</p>
        <p>There&apos;s no public leaderboard: you can see your own referrals, but nobody else&apos;s, and nobody can see yours.</p>
      </>
    ),
  },
  {
    title: "The prize",
    body: (
      <>
        {/* ⚠ Check this is exactly what you'll give */}
        <p>The prize depends on the <b>Road to 300</b>: how many people (streamers and scouts, from anywhere) have joined and confirmed their email by the close. Disqualified sign-ups don&apos;t count.</p>
        <ul>
          <li><b>300 or more:</b> one copy of <b>Grand Theft Auto VI</b> (standard edition) for the winner&apos;s choice of PlayStation 5 or Xbox Series X|S.</li>
          <li><b>Fewer than 300:</b> a prize worth <b>£25</b> instead, which we&apos;ll agree with the winner (for example a gift card).</li>
        </ul>
        <p>There&apos;s no cash alternative, and the prize can&apos;t be swapped or passed on. If the game&apos;s release date moves, we&apos;ll send it to the winner when it comes out.</p>
      </>
    ),
  },
  {
    title: "The winner",
    body: (
      <>
        <p>After it closes, we check every referral, then reveal the winner <b>live on stream</b> by the name or handle they entered with, within 7 days of the close. We email the winner at the same time, so <b>you don&apos;t need to watch to win</b>.</p>
        <p>The winner needs to reply within 14 days and may be asked for proof of age and UK address. If they don&apos;t reply, or can&apos;t show they qualify, the prize goes to whoever had the next most counted referrals.</p>
      </>
    ),
  },
  {
    title: "Playing fair",
    body: (
      <p>Fake or duplicate sign-ups, referring yourself, bots, or anything else that games the competition don&apos;t count, and can get you disqualified. We check every sign-up before we name a winner, and we decide what counts.</p>
    ),
  },
  {
    title: "Your details",
    body: (
      <p>We use your email to run your entry and this competition: to confirm your entry, to tell you when StreamerDraft launches and, if you win, to reach you. Anything else (news, events, offers) only if you ticked the box for it, and you can stop those any time. Your email and your referral numbers are never shown to anyone else. If you win, we say your name or handle on stream.</p>
    ),
  },
  {
    title: "If something goes wrong",
    body: (
      <p>If something outside our control stops the competition running fairly, we may change or cancel it, and we&apos;ll tell everyone who&apos;s entered by email.</p>
    ),
  },
  {
    title: "Who runs it",
    body: (
      <>
        <p>{PROMOTER}. Questions: {CONTACT}.</p>
        <p>This competition isn&apos;t run, sponsored or endorsed by Rockstar Games, Take-Two Interactive, Sony, Microsoft, any streaming platform (like Twitch, YouTube or Kick) or any social media platform (like Instagram, TikTok, Snapchat or X), and none of them are responsible for it.</p>
      </>
    ),
  },
];

export function RulesContent() {
  return (
    <div className={e.view}>
      <div className={e.rules}>
        {RULES.map((rule, i) => (
          <section key={rule.title} className={slot.text} style={sheetOrder(Math.min(2 + i, 8))}>
            <h3><span className={e.ruleNumber}>{i + 1}.</span> {rule.title}</h3>
            {rule.body}
          </section>
        ))}
        <p className={`${e.small} ${e.rulesFoot}`}>Last updated {RULES_UPDATED}.</p>
      </div>
    </div>
  );
}

// The rules in their own pop-up. `origin`: what it grows out of.
export function RulesSheet({ open, onClose, origin, footer }: {
  open: boolean;
  onClose: () => void;
  origin?: RefObject<HTMLElement | null>;
  footer?: ReactNode;
}) {
  return (
    <Sheet open={open} onClose={onClose} origin={origin} title="Competition rules" subtitle="The GTA 6 referral competition" footer={footer}>
      <RulesContent />
    </Sheet>
  );
}
