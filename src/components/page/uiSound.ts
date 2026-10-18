// src/components/page/uiSound.ts
//
// WHAT THIS IS
// The page's own small sounds (the intro has its own). Which version plays
// is soundSet.ts's choice:
//   v2 (everyone)  the files below (public/sounds/ui-*.mp3)
//   v3             made live, in the "Lights on" world (src/components/sound/),
//                  kept to compare with ?sounds=v3
// Either way, each one comes from the side of the screen it happened on
// (pass the element: uiSound("open", button)).
//
// In v2 they all use the same instrument and the same three notes as the rest
// of that version (scripts/render-sounds.py explains "the draft call"):
//
//   open      a pop-up growing out of what you tapped        Sheet.tsx
//   close     ...and shrinking back in                        Sheet.tsx
//   tick-on   a tick box, chip or segment turned on           FormParts.tsx
//   tick-off  ...turned off
//   step      the scout form's Continue: the call's first note
//   sent      sign-up sent, email on its way: the call's first two notes,
//             left hanging on purpose...
//   success   ...and confirmed: the whole call. It completes when they're in.
//   error     something to fix: two soft notes stepping down (no buzzer)
//   copy      your link copied
//   share     your card shared (v3 only: v2 plays copy)
//
// THE HABITS THAT KEEP THEM NICE (what game and app sound designers do)
//   - Quiet, short and few. Most taps make no sound at all: the sounds are for
//     moments that matter (opening, sending, success, a mistake).
//   - Never the same twice: ticks have 3 takes, picked at random (never the
//     same one twice in a row), and every play nudges the pitch and volume a
//     hair. Real buttons don't click identically, so this doesn't wear thin.
//   - No pile-ups: the same sound can't restart within 60 ms, and only a few
//     play at once.
//   - The voice note comes first: while it plays, these drop right down.
//   - Sound off means off (the footer's Sound button, soundSet.ts). And no
//     sound is ever the only sign something happened: everything is on screen.
//   - iPhone: these follow the silent switch, like an app's sounds do. The
//     voice note doesn't (it's media you chose to play).
//   - Phones that can buzz (Android) get a tiny buzz for "you're in" and "fix
//     this". iPhones don't let websites do that.
//
// HOW TO USE
//   uiSound("open", element)   (element: what was tapped, so v3 knows which side)
//   unlockUiSound()   inside a tap or click, when a sound will follow later
//                     (e.g. after the server answers), so the browser allows it

import { useSyncExternalStore } from "react";
import { audioEngine, isLiveSet, soundOn, subscribeSound, unlockAudio } from "@/components/launch/soundSet";
import { duck as duckLive, play as playLive, want as wantLive, wantSpaces } from "@/components/sound/engine";
import { panFor } from "@/components/sound/place";

export type UiSoundName = "open" | "close" | "tick-on" | "tick-off" | "step" | "sent" | "success" | "error" | "copy" | "share";

// The files for each (public/sounds/ui-*.mp3, made by scripts/render-sounds.py)
const FILES: Record<UiSoundName, string[]> = {
  open: ["ui-open"],
  close: ["ui-close"],
  "tick-on": ["ui-tick-on-1", "ui-tick-on-2", "ui-tick-on-3"],
  "tick-off": ["ui-tick-off-1", "ui-tick-off-2", "ui-tick-off-3"],
  step: ["ui-step"],
  sent: ["ui-sent"],
  success: ["ui-success"],
  error: ["ui-error"],
  copy: ["ui-copy"],
  share: ["ui-copy"],
};

// How much each play may wander: pitch in cents (100 = a semitone), volume in dB.
// The notes of the call stay exactly in tune (0 cents); the tactile ones wander.
const WANDER: Record<UiSoundName, { cents: number; db: number }> = {
  open: { cents: 18, db: 1 },
  close: { cents: 18, db: 1 },
  "tick-on": { cents: 30, db: 1.5 },
  "tick-off": { cents: 30, db: 1.5 },
  step: { cents: 0, db: 0.5 },
  sent: { cents: 0, db: 0 },
  success: { cents: 0, db: 0 },
  error: { cents: 0, db: 0.5 },
  copy: { cents: 12, db: 1 },
  share: { cents: 12, db: 1 },
};

// A tiny buzz on phones that can (navigator.vibrate: Android). Milliseconds: buzz, pause, buzz.
const BUZZ: Partial<Record<UiSoundName, number[]>> = {
  success: [12, 60, 18],
  error: [8, 40, 8],
};

const VOLUME = 0.9;
const DUCKED = 0.12; // while the voice note plays
const COOLDOWN = 0.06; // seconds before the same sound can play again
const MAX_AT_ONCE = 4;

const buffers = new Map<string, Promise<AudioBuffer | null>>();
const lastPlayed = new Map<UiSoundName, number>();
const lastTake = new Map<UiSoundName, number>();
let bus: GainNode | null = null;
let ducked = false;
let playing = 0;
let livePlaying = 0; // (v3: roughly how many started in the last moment)

// The page's own volume control, plugged into the shared engine
function uiBus(): GainNode | null {
  const engine = audioEngine();
  if (!engine) return null;
  if (!bus || bus.context !== engine.ctx) {
    bus = engine.ctx.createGain();
    bus.gain.value = ducked ? DUCKED : VOLUME;
    bus.connect(engine.out);
  }
  return bus;
}

function load(file: string): Promise<AudioBuffer | null> {
  let found = buffers.get(file);
  if (!found) {
    found = (async () => {
      try {
        const engine = audioEngine();
        const response = await fetch(`/sounds/${file}.mp3`);
        if (!response.ok) return null;
        const data = await response.arrayBuffer();
        // decode with the live engine if there is one, otherwise an offline one
        const decoder: BaseAudioContext = engine?.ctx ?? new OfflineAudioContext(2, 1, 48000);
        return await decoder.decodeAudioData(data);
      } catch {
        return null;
      }
    })();
    buffers.set(file, found);
  }
  return found;
}

// Downloads them all in the background (they're tiny), so the first one is instant.
export function preloadUiSounds() {
  if (typeof window === "undefined" || !soundOn()) return;
  if (isLiveSet()) {
    // v3: two of each made ahead (so there's always a fresh one ready)
    wantSpaces();
    for (const name of Object.keys(FILES) as UiSoundName[]) wantLive(name, undefined, 2);
    return;
  }
  for (const files of Object.values(FILES)) for (const file of files) void load(file);
}

// Call inside a tap or click if a sound will follow a moment later
export function unlockUiSound() {
  if (soundOn()) unlockAudio();
}

export function uiSound(name: UiSoundName, from?: Element | null) {
  if (typeof window === "undefined" || !soundOn()) return;
  const buzz = BUZZ[name];
  if (buzz && !ducked) navigator.vibrate?.(buzz);

  if (isLiveSet()) {
    // v3: same habits (no pile-ups, no repeats within 60 ms), made live
    const t = performance.now() / 1000;
    if (t - (lastPlayed.get(name) ?? -1) < COOLDOWN || livePlaying >= MAX_AT_ONCE) return;
    lastPlayed.set(name, t);
    if (!audioEngine()) unlockAudio();
    if (playLive(name, { bus: "ui", pan: panFor(from) })) {
      livePlaying++;
      window.setTimeout(() => livePlaying--, 400);
    }
    return;
  }

  const engine = audioEngine() ?? unlockAudio();
  const out = uiBus();
  if (!engine || !out) return;
  const now = engine.ctx.currentTime;
  if (now - (lastPlayed.get(name) ?? -1) < COOLDOWN || playing >= MAX_AT_ONCE) return;
  lastPlayed.set(name, now);

  // Pick a take: at random, but never the same one twice in a row
  const files = FILES[name];
  let take = Math.floor(Math.random() * files.length);
  if (files.length > 1 && take === lastTake.get(name)) take = (take + 1) % files.length;
  lastTake.set(name, take);

  const asked = performance.now();
  const pan = panFor(from); // (worked out now: where it was when it was tapped)
  void load(files[take]).then((buffer) => {
    // still loading after a moment? skip it: a late sound is worse than none
    if (!buffer || performance.now() - asked > 250) return;
    const wander = WANDER[name];
    const source = engine.ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = 2 ** (((Math.random() * 2 - 1) * wander.cents) / 1200);
    const level = engine.ctx.createGain();
    level.gain.value = 10 ** (((Math.random() * 2 - 1) * wander.db) / 20);
    source.connect(level);
    // from the side of the screen it happened on
    let panner: StereoPannerNode | null = null;
    if (pan !== undefined && typeof engine.ctx.createStereoPanner === "function") {
      panner = engine.ctx.createStereoPanner();
      panner.pan.value = pan;
      level.connect(panner).connect(out);
    } else {
      level.connect(out);
    }
    playing++;
    source.onended = () => {
      playing--;
      level.disconnect();
      panner?.disconnect();
    };
    source.start();
  });
}

// For components: is sound on? (re-renders when it's turned on or off)
export function useSoundOn(): boolean {
  return useSyncExternalStore(subscribeSound, soundOn, () => true);
}

// The voice note is playing (true) or stopped (false): the page's sounds step aside
export function duckUiSounds(on: boolean) {
  ducked = on;
  duckLive(on);
  const engine = audioEngine();
  if (!bus || !engine) return;
  const now = engine.ctx.currentTime;
  bus.gain.cancelScheduledValues(now);
  bus.gain.setTargetAtTime(on ? DUCKED : VOLUME, now, 0.08);
}
