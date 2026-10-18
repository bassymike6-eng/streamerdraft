// src/components/page/ShareLink.tsx
//
// WHAT THIS IS
// Someone's referral link, with two buttons:
//   [ streamerdraft.co.uk/r/k7x2qp ]
//   [ Copy link ]  [ Share ]
// Copy puts the link on the clipboard. Share opens the phone's (or Windows')
// own share menu, with a line about StreamerDraft and the link. Where there's
// no share menu (most computer browsers), Share copies that line + link
// instead, ready to paste into a DM or a Discord server.
//
// Copying works on every page, HTTPS or not (clipboard.ts explains why that
// matters when you're testing on your phone). The share menu needs HTTPS.
//
// Used in the "You're in" pop-up, the Road to 300 pop-up and the confirm page.

import { useEffect, useRef, useState } from "react";
import { copyText } from "./clipboard";
import { referralLink } from "./entry";
import { uiSound, unlockUiSound } from "./uiSound";
import e from "./Entry.module.css";

export const SHARE_TEXT = "I've joined the StreamerDraft. Small streamers get scouted and drafted by bigger creators for a whole season. Join through my link:";

type Done = "idle" | "copied" | "shared" | "message" | "failed";
const SAID: Record<Done, string> = {
  idle: "",
  copied: "Link copied",
  shared: "Shared",
  message: "Message and link copied",
  failed: "Couldn't copy: press and hold the link to copy it",
};

export function ShareLink({ code }: { code: string }) {
  const link = referralLink(code);
  const [done, setDone] = useState<Done>("idle");
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const show = (what: Done) => {
    setDone(what);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setDone("idle"), 2200);
  };

  const onCopy = async (from: HTMLElement) => {
    unlockUiSound();
    if (await copyText(link.href, from)) {
      show("copied");
      uiSound("copy", from);
    } else {
      show("failed");
    }
  };

  const onShare = async (from: HTMLElement) => {
    unlockUiSound();
    const data = { title: "StreamerDraft", text: SHARE_TEXT, url: link.href };
    if (typeof navigator.share === "function" && (!navigator.canShare || navigator.canShare(data))) {
      try {
        await navigator.share(data);
        show("shared");
      } catch {
        // they closed the share menu: nothing to say
      }
      return;
    }
    if (await copyText(`${SHARE_TEXT} ${link.href}`, from)) {
      show("message");
      uiSound("copy", from);
    } else {
      show("failed");
    }
  };

  return (
    <div className={e.share}>
      <div className={e.shareLink}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3.2-3.2a4.5 4.5 0 0 0-6.4-6.4L11.8 5.8" /><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3.2 3.2a4.5 4.5 0 0 0 6.4 6.4l1.4-1.4" /></svg>
        <span className={e.shareUrl}>{link.shown}</span>
      </div>
      <div className={e.shareButtons}>
        <button type="button" className={e.secondary} onClick={(ev) => onCopy(ev.currentTarget)}>
          <span>
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8.5" y="8.5" width="11" height="11" rx="2.5" /><path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5" /></svg>
            Copy link
          </span>
        </button>
        <button type="button" className={e.primary} onClick={(ev) => onShare(ev.currentTarget)}>
          <span>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3.5M7.5 8 12 3.5 16.5 8" /><path d="M8 11H6.5A2.5 2.5 0 0 0 4 13.5v5A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5v-5a2.5 2.5 0 0 0-2.5-2.5H16" /></svg>
            Share
          </span>
        </button>
      </div>
      {/* what just happened, for everyone (and screen readers) */}
      <p className={e.shareSaid} role="status" data-show={done !== "idle" || undefined} data-tone={done === "failed" ? "bad" : undefined}>
        {done !== "idle" && (
          <>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
            {SAID[done]}
          </>
        )}
      </p>
    </div>
  );
}
