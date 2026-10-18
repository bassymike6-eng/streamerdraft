// src/components/page/Turnstile.tsx
//
// WHAT THIS IS
// The front half of Cloudflare Turnstile, the "are you human?" check
// (the back half is src/lib/turnstile.ts). It sits in the sign-up form and
// gives the form a one-time token, which goes to the server with the sign-up.
//
// MOST PEOPLE NEVER SEE IT
// appearance "interaction-only": it checks the browser quietly, and only
// shows itself (a small box with a tick) if Cloudflare isn't sure and needs
// a click. So the form stays clean for nearly everyone.
//
// THE KEYS
//   NEXT_PUBLIC_TURNSTILE_SITE_KEY   in .env.local. Public (it's in the page), so
//                                    the NEXT_PUBLIC_ name is right for it.
//   TURNSTILE_SECRET_KEY             server only, never NEXT_PUBLIC_, never in Git.
// No site key (local dev): the widget's left out, and the server skips the
// check too (as long as there's no secret key either).
// Cloudflare's test keys, to try it locally:
//   site 1x00000000000000000000AA  always passes   (visible)
//   site 3x00000000000000000000FF  always asks for a click
//   secret 1x0000000000000000000000000000000AA  always passes
//
// HOW THE FORM USES IT
//   const human = useRef<TurnstileHandle>(null);
//   <Turnstile ref={human} />    (dark or light: it matches the page's look by itself)
//   human.current?.needsTick()                   // is Cloudflare waiting on them to tick its box?
//   const token = await human.current?.token();  // waits for it if it's not ready yet
//   human.current?.reset();                      // after a failed sign-up: a fresh token

import { useEffect, useImperativeHandle, useRef, type Ref } from "react";

export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

export type TurnstileHandle = {
  token: () => Promise<string | undefined>; // undefined: no widget (dev), or it never gave one
  needsTick: () => boolean; // true: Cloudflare's showing its box and wants them to tick it
  reset: () => void;
};

// The bits of Cloudflare's script we use (it adds window.turnstile)
type TurnstileApi = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let loading: Promise<TurnstileApi> | null = null;

// Loads Cloudflare's script once, however many forms ask for it
function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT;
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("no turnstile")));
    script.onerror = () => {
      loading = null; // let the next form try again
      reject(new Error("Turnstile didn't load"));
    };
    document.head.appendChild(script);
  });
  return loading;
}

const WAIT_FOR_TOKEN = 15000; // ms: how long the form waits for a token before sending without one

export function Turnstile({ ref, className }: { ref: Ref<TurnstileHandle>; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const current = useRef<string | undefined>(undefined); // the latest token
  const waiting = useRef<((token: string | undefined) => void)[]>([]);

  const hand = (token: string | undefined) => {
    current.current = token;
    for (const resolve of waiting.current.splice(0)) resolve(token);
  };

  useImperativeHandle(ref, () => ({
    token: () => {
      if (!TURNSTILE_SITE_KEY) return Promise.resolve(undefined);
      if (current.current) return Promise.resolve(current.current);
      return new Promise((resolve) => {
        waiting.current.push(resolve);
        window.setTimeout(() => resolve(undefined), WAIT_FOR_TOKEN);
      });
    },
    needsTick: () => !!box.current?.hasAttribute("data-shown") && !current.current,
    reset: () => {
      current.current = undefined;
      if (widget.current && window.turnstile) window.turnstile.reset(widget.current);
    },
  }));

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !box.current) return;
    let cancelled = false;
    // Hidden (nearly always), it takes no room: data-shown only goes on while
    // Cloudflare's actually showing the box (Entry.module.css: .human)
    const el = box.current;
    const sized = new ResizeObserver(() => el.toggleAttribute("data-shown", el.offsetHeight > 4));
    sized.observe(el);
    // the page's look (dark at night, bright in the day: detect.ts)
    const theme = box.current.closest("[data-look]")?.getAttribute("data-look") === "bright" ? "light" : "dark";
    loadTurnstile()
      .then((api) => {
        if (cancelled || !box.current) return;
        widget.current = api.render(box.current, {
          sitekey: TURNSTILE_SITE_KEY,
          theme,
          appearance: "interaction-only",
          size: "flexible",
          action: "signup",
          callback: (token: string) => hand(token),
          // tokens last 5 minutes; it fetches a new one by itself
          "expired-callback": () => {
            current.current = undefined;
          },
          // a network blip or a failed check: it retries by itself (retry "auto"),
          // and the form gives up waiting after WAIT_FOR_TOKEN
          "error-callback": () => {
            current.current = undefined;
          },
        });
      })
      .catch(() => hand(undefined)); // blocked or offline: the server will say the check failed
    return () => {
      cancelled = true;
      sized.disconnect();
      if (widget.current && window.turnstile) window.turnstile.remove(widget.current);
      widget.current = null;
    };
  }, []);

  if (!TURNSTILE_SITE_KEY) return null;
  return <div ref={box} className={className} data-turnstile="" />;
}
