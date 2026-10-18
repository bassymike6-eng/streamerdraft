// src/lib/broadcast-email.ts
//
// WHAT THIS IS
// What a launch or news email looks like: the words you write on the
// dashboard, in our email layout (email-layout.ts), with the bits every
// one of these emails must have at the bottom:
//   - why they're getting it
//   - who's sending it (once you've filled in site.ts)
//   - their own Unsubscribe link
// It runs in the browser too, so the dashboard's preview is exactly what goes.
// The sending itself: src/lib/broadcast.ts.

import { PROMOTER_ADDRESS, PROMOTER_NAME } from "@/lib/site";
import { renderEmail } from "./email-layout";

export type EmailList = "launch" | "news";

// What you write on the dashboard
export type Draft = {
  list: EmailList;
  subject: string;
  body: string; // plain text: a blank line = a new paragraph, {name} = their name
  buttonLabel?: string | null;
  buttonUrl?: string | null;
};

const WHY: Record<EmailList, string> = {
  launch: "You're getting this because you joined StreamerDraft.",
  news: "You're getting this because you asked for news and offers from StreamerDraft.",
};

export function broadcastEmail(draft: Draft, name: string, unsubscribeUrl: string, appUrl: string) {
  const who = PROMOTER_NAME ? `StreamerDraft is run by ${PROMOTER_NAME}${PROMOTER_ADDRESS ? `, ${PROMOTER_ADDRESS}` : ""}.` : null;
  return {
    subject: draft.subject,
    ...renderEmail({
      name,
      body: draft.body,
      button: draft.buttonLabel && draft.buttonUrl ? { label: draft.buttonLabel, url: draft.buttonUrl } : null,
      footer: [WHY[draft.list], ...(who ? [who] : [])],
      unsubscribeUrl,
      appUrl,
    }),
  };
}
