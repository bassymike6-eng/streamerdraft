// src/components/launch/detect.ts
//
// WHAT THIS IS
// Works out what the visitor is on, so the intro shows the right "home screen":
//
//   device     phone | tablet | desk      from the user agent, screen size and touch
//   dockStyle  dock | bar                 computers only: Windows gets a taskbar, everything else a dock
//   source     browser | social           did they open the link inside a social app's browser?
//              (Instagram, Snapchat, TikTok and Facebook all say so in their user agent)
//   look       dark | bright              picked from the visitor's OWN clock, so a VPN doesn't change it
//
// It only runs in the browser (it reads navigator and window), so call it inside useEffect.
//
// TESTING ANY VERSION: add these to the URL (they win over detection)
//   ?device=phone | tablet | desk-dock | desk-bar
//   ?look=dark | bright      forces a look (careful: it beats the clock until you take it out)
//   ?hour=14                 pretends it's that hour, to check the clock picks the right look
//   ?source=browser | social
// e.g. http://localhost:3000/?device=phone&hour=21

export type Device = "phone" | "tablet" | "desk";
export type DockStyle = "dock" | "bar";
export type Source = "browser" | "social";
export type Look = "dark" | "bright";

export type Visitor = {
  device: Device;
  dockStyle: DockStyle;
  source: Source;
  look: Look;
  forced: boolean; // true when ?device= picked the device (we then show it in a frame on big screens)
};

// WHICH LOOK SHOWS WHEN, on the visitor's own clock.
// Day is 7am to 7pm, night is 7pm to 7am. To swap them round, swap the two words.
export const LOOK_BY_TIME: Record<"day" | "night", Look> = {
  day: "bright",
  night: "dark",
};
const NIGHT_STARTS = 19; // 7pm
const NIGHT_ENDS = 7; // 7am

export function lookFromClock(date = new Date()): Look {
  const hour = date.getHours();
  const isNight = hour >= NIGHT_STARTS || hour < NIGHT_ENDS;
  return LOOK_BY_TIME[isNight ? "night" : "day"];
}

export function detectVisitor(): Visitor {
  const ua = navigator.userAgent || "";
  const touch = (navigator.maxTouchPoints || 0) > 0;
  const w = window.innerWidth;
  const h = window.innerHeight;

  // iPads now pretend to be Macs, but Macs don't have touch screens.
  const isIpad = /iPad/.test(ua) || (/Macintosh/.test(ua) && touch);

  // Computers say so in their user agent: Windows, Mac, Chromebook (CrOS),
  // Linux desktops (X11). Lots of laptops have touchscreens, so touch alone
  // doesn't mean phone or tablet: a Windows touchscreen laptop is a computer.
  const isComputer = !isIpad && /Windows NT|Macintosh|CrOS|X11/.test(ua);

  let device: Device = "desk";
  if (/iPhone|iPod/.test(ua) || /Android.+Mobile/.test(ua)) {
    device = "phone";
  } else if (isIpad || /Android|Tablet/.test(ua)) {
    device = "tablet";
  } else if (touch && !isComputer) {
    // The user agent didn't say what it is: guess from the screen size
    if (Math.min(w, h) < 600) device = "phone";
    else if (Math.max(w, h) <= 1400) device = "tablet";
  }

  const dockStyle: DockStyle = /Windows/.test(ua) ? "bar" : "dock";

  const inSocialApp = /Instagram|Snapchat|musical_ly|BytedanceWebview|TikTok|FBAN|FBAV/i.test(ua);
  const source: Source = inSocialApp ? "social" : "browser";

  return { device, dockStyle, source, look: lookFromClock(), forced: false };
}

// Reads ?device= ?hour= ?look= ?source= from the URL and lays them over what we detected.
export function applyUrlOverrides(visitor: Visitor, search: string): Visitor {
  const params = new URLSearchParams(search);
  const next = { ...visitor };

  const device = params.get("device");
  if (device === "phone" || device === "tablet") {
    next.device = device;
    next.forced = true;
  }
  if (device === "desk-dock" || device === "desk-bar") {
    next.device = "desk";
    next.dockStyle = device === "desk-bar" ? "bar" : "dock";
    next.forced = true;
  }

  // ?hour=14: the look the clock would pick at that hour (to test it any time of day)
  const hour = Number(params.get("hour"));
  if (params.has("hour") && Number.isInteger(hour) && hour >= 0 && hour <= 23) {
    const at = new Date();
    at.setHours(hour, 0, 0, 0);
    next.look = lookFromClock(at);
  }

  // ?look=dark|bright: forces it, whatever the time
  const look = params.get("look");
  if (look === "dark" || look === "bright") next.look = look;

  const source = params.get("source");
  if (source === "browser" || source === "social") next.source = source;

  return next;
}

// Just the look (for pages without the intro, like /confirm): the clock's,
// with ?hour= and ?look= still working
export function lookFor(search: string): Look {
  const params = new URLSearchParams(search);
  const forced = params.get("look");
  if (forced === "dark" || forced === "bright") return forced;
  const hour = Number(params.get("hour"));
  if (params.has("hour") && Number.isInteger(hour) && hour >= 0 && hour <= 23) {
    const at = new Date();
    at.setHours(hour, 0, 0, 0);
    return lookFromClock(at);
  }
  return lookFromClock();
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}
