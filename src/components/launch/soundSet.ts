// src/components/launch/soundSet.ts
//
// WHAT THIS IS
// Which version of the site's sound to use, and everything that's shared
// between the intro's sounds (sound.ts) and the page's (uiSound.ts):
//
//   the version   v5 (the one everyone hears: "Scenes". The intro scored like
//                     a film: every scene its own sound, made for what's on
//                     screen, cut when the next scene comes in. One key, one
//                     family of sounds, all from the middle; the title is the
//                     peak. scripts/render-intro.py made public/sounds/v5/)
//                 v2 (the intro before that: a sound for every moment, coming
//                     from where it happens on the screen. Made by
//                     scripts/render-sounds.py, which still makes the page's
//                     sounds for every version)
//                 v1 (the first version, kept exactly as it was:
//                     scripts/render-sounds-v1.py made public/sounds/v1/)
//                 v3 ("Lights on": made live in the browser, src/components/
//                     sound/. Tried and set aside: kept to compare)
//                 Add ?sounds=v2 (or v1, v3) to the address to hear another
//                 one, to compare.
//   sound on/off  the visitor's choice (the Sound button in the footer). Off
//                 means off everywhere: the intro and the page. Remembered on
//                 this device.
//   the audio     one AudioContext (the browser's sound engine) for the whole
//                 site, made on the first tap or click (browsers only allow
//                 sound after one), so the intro and the page share it.
//   the iPhone    whether sound should play when the silent switch is on (see
//                 setAudioSession)

// (No React in here, so the server-side sound board can use it too: the
// useSoundOn hook for components is in page/uiSound.ts.)

import manifestV1 from "./sounds.v1.json";
import manifestV2 from "./sounds.json";
import manifestV5 from "./sounds.v5.json";

export type SoundSet = "v1" | "v2" | "v3" | "v5";

// The version everyone hears
export const SOUND_SET: SoundSet = "v5";

export function soundSet(): SoundSet {
  if (typeof window === "undefined") return SOUND_SET;
  const asked = new URLSearchParams(window.location.search).get("sounds");
  return asked === "v1" || asked === "v2" || asked === "v3" || asked === "v5" ? asked : SOUND_SET;
}

// v1, v2 and v5 are files; v3 is made live
export const isLiveSet = (set: SoundSet = soundSet()) => set === "v3";

// Where an intro sound's file is, for a version (v1, v2 and v5)
export function soundUrl(name: string, set: SoundSet = soundSet()) {
  if (set === "v1") return `/sounds/v1/${name}.mp3`;
  if (set === "v5") return `/sounds/v5/${name}.mp3`;
  return `/sounds/${name}.mp3`;
}

// Where each file's sound really starts (see sound.ts), for a version
export function soundManifest(set: SoundSet = soundSet()) {
  if (set === "v1") return manifestV1;
  if (set === "v5") return manifestV5;
  return manifestV2;
}

// ---- Sound on / off ----
const KEY = "sd.sound";
const CHANGED = "sd-sound-changed";

function readOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true; // storage blocked: on, as the default
  }
}

export function soundOn(): boolean {
  return typeof window === "undefined" ? true : readOn();
}

export function setSoundOn(on: boolean) {
  try {
    if (on) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, "off");
  } catch {
    // storage blocked: it just won't be remembered
  }
  window.dispatchEvent(new Event(CHANGED));
}

// Calls onChange whenever sound is turned on or off (here or in another tab)
export function subscribeSound(onChange: () => void) {
  window.addEventListener(CHANGED, onChange);
  window.addEventListener("storage", onChange); // (another tab changed it)
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener("storage", onChange);
  };
}

// ---- The one shared sound engine ----
// out: where every sound goes, through a safety limiter so overlapping sounds
// can never distort. Made inside a tap or click (see unlockAudio).
type Engine = { ctx: AudioContext; out: GainNode };
let engine: Engine | null = null;

export function audioEngine(): Engine | null {
  return engine;
}

// Call from inside a tap or click handler: makes (or wakes) the engine.
// Returns null if this browser can't make sound.
export function unlockAudio(): Engine | null {
  try {
    if (!engine) {
      const ctx = new AudioContext();
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -3;
      limiter.knee.value = 3;
      limiter.ratio.value = 12;
      limiter.attack.value = 0.002;
      limiter.release.value = 0.2;
      limiter.connect(ctx.destination);
      const out = ctx.createGain();
      out.connect(limiter);
      engine = { ctx, out };
    }
    if (engine.ctx.state === "suspended") void engine.ctx.resume();
    return engine;
  } catch {
    return null;
  }
}

// ---- The iPhone's silent switch ----
// Safari 16.4+ lets a page say what kind of sound it's making:
//   "playback"  like a video: plays even on silent (the volume buttons are in
//               charge), and pauses other apps' music. Right for the intro the
//               visitor tapped Play on, and for the founder's voice note.
//   "ambient"   like a game's sound effects: the silent switch mutes it, and it
//               mixes with music instead of stopping it. Right for the page's
//               little sounds, the way an app's taps and ticks behave.
type AudioSessionNavigator = Navigator & { audioSession?: { type: string } };
export function setAudioSession(type: "playback" | "ambient"): boolean {
  if (typeof navigator === "undefined") return false;
  const session = (navigator as AudioSessionNavigator).audioSession;
  if (!session) return false;
  try {
    session.type = type;
    return true;
  } catch {
    return false;
  }
}

// ---- Playing through the iPhone's silent switch, for the intro ----
// The visitor tapped Play, so the intro is treated like a video they chose
// to watch: "playback" (Safari 16.4+), or on older iPhones a silent clip
// looping underneath (that also makes the phone treat it as playback).
// Side effect: like starting a video, it may pause music they have on.
// After `seconds` (the intro's over) it goes back to "ambient", so the
// page's small sounds behave like an app's: the silent switch mutes them.
const SILENT_WAV = "data:audio/wav;base64,UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YSADAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==";
let silentClip: HTMLAudioElement | null = null;
let silentTimer = 0;
const isIOS = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

export function holdPlaybackSession(seconds: number) {
  window.clearTimeout(silentTimer);
  if (setAudioSession("playback")) {
    silentTimer = window.setTimeout(() => setAudioSession("ambient"), seconds * 1000);
    return;
  }
  if (!isIOS()) return; // only iPhones and iPads need the older way
  silentClip ??= Object.assign(new Audio(SILENT_WAV), { loop: true });
  void silentClip.play().catch(() => {}); // no luck: the intro still runs, just maybe muted
  silentTimer = window.setTimeout(() => silentClip?.pause(), seconds * 1000);
}

export function releasePlaybackSession() {
  if (typeof window === "undefined") return;
  window.clearTimeout(silentTimer);
  silentClip?.pause();
  setAudioSession("ambient");
}
