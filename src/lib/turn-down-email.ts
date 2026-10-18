// src/lib/turn-down-email.ts
//
// WHAT THIS IS
// The email a scout gets when you turn them down on the dashboard
// (Scouts tab, or their details: "Turn down"). Sent by
// src/app/api/admin/signups/[id]/route.ts, once, the first time you turn
// them down, and only if they'd confirmed their email (an email they never
// confirmed might not be theirs).
//
// WHAT IT SAYS (the words are below: change them here)
//   - some details on their sign-up didn't look right, so we can't take them
//     on as a scout
//   - so they won't be one of our scouts at launch, and they can't sign up
//     as a scout again with this email
//   - they're STILL in the competition (if they can win: UK, rules accepted),
//     and their referral link still works
//   - think we got it wrong? how to tell us
// It doesn't say exactly what looked wrong: your reason stays private, so
// nobody learns how to get round the checks.
//
// No unsubscribe link: it's about their sign-up, not news.
// It runs in the browser too, so the dashboard shows the exact email first.

import { CONTACT_EMAIL } from "@/lib/site";
import { renderEmail } from "./email-layout";

export const TURN_DOWN_SUBJECT = "About your StreamerDraft scout sign-up";

export function turnDownEmail(person: { displayName: string; eligible: boolean }, appUrl: string) {
  const contact = CONTACT_EMAIL ? `email us at ${CONTACT_EMAIL}` : "reply to this email";
  const body = [
    "Hey {name},",
    "Thanks for signing up to scout on StreamerDraft. We check every scout sign-up, and some of the details on yours didn't look right to us, so we can't take you on as a scout.",
    "That means you won't be one of our scouts when StreamerDraft launches, and you can't sign up as a scout again with this email.",
    person.eligible
      ? "You're still in the competition, though. Your referral link still works, and everyone who joins through it still counts."
      : "Your referral link still works: everyone who joins through it still counts towards the Road to 300.",
    `Think we've got it wrong? ${contact.charAt(0).toUpperCase() + contact.slice(1)} and tell us why.`,
  ].join("\n\n");

  return {
    subject: TURN_DOWN_SUBJECT,
    ...renderEmail({
      name: person.displayName,
      body,
      footer: ["You're getting this because you signed up to scout on StreamerDraft."],
      appUrl,
    }),
  };
}
