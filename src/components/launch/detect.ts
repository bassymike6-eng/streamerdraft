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
//   ?look=dark | bright
//   ?source=browser | social
// e.g. http://localhost:3000/?device=phone&look=bright

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

// Night is 7pm to 7am on the visitor's clock.
// BRIGHT_AT_NIGHT = true  -> bright at night, dark in the day (what we have now)
// BRIGHT_AT_NIGHT = false -> dark at night, bright in the day (the flip on your list)
const BRIGHT_AT_NIGHT = true;
const NIGHT_STARTS = 19;
const NIGHT_ENDS = 7;

export function lookFromClock(date = new Date()): Look {
  const hour = date.getHours();
  const isNight = hour >= NIGHT_STARTS || hour < NIGHT_ENDS;
  if (BRIGHT_AT_NIGHT) return isNight ? "bright" : "dark";
  return isNight ? "dark" : "bright";
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

// Reads ?device= ?look= ?source= from the URL and lays them over what we detected.
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

  const look = params.get("look");
  if (look === "dark" || look === "bright") next.look = look;

  const source = params.get("source");
  if (source === "browser" || source === "social") next.source = source;

  return next;
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}
