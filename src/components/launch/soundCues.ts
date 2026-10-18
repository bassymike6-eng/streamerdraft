// src/components/launch/soundCues.ts
//
// WHAT THIS IS
// The intro's cue sheet: which sound plays in each scene, when, and how loud.
// All custom (no licences needed), all in D major.
//
// v5, "SCENES" (what everyone hears: public/sounds/v5/, made by
// scripts/render-intro.py). The intro scored like a film: each scene its own
// sound, made for what's on screen, and CUT when the next scene starts, so the
// scene changes are heard as well as seen. One key (D), one family of sounds,
// all from the middle (nothing moves left and right):
//
//   scene (phase)       sound   on screen -> what you hear
//   tap                 light   the light shoots out and races round the edge ->
//                               a soft press, a whoosh with the light, then a
//                               building pulse and arpeggio, sucked into...
//   fill                lock    the outline seals -> a latch, a thunk, a glass chord
//   home                home    planet, dock, apps installing -> calm and spacious,
//                               the draft call as ours is ready, a badge pop
//   press               open    our app tapped and zooming open -> click, whoosh
//   load                load    the browser loading -> ticks speeding up, sucked in
//   title               title   STREAMERDRAFT -> THE PEAK: the hit, glitches on the
//                               copies' jumps, the call as they snap together
//   dock                dock    the title shrinks into the logo -> a falling sweep
//   done                page    "Nobody's watching." near silence, "Yet." hits,
//                               soft pops as the boxes fill, the gear landing
//
// v2 (the sound before: ?sounds=v2) and v1 (?sounds=v1) use the cue sheet
// below, a sound for every moment, each from where it is on the screen:
//
//   scene                             sound          timed from
//   tap play                          tap            the tap
//   light grows out to the edge       grow           the tap
//   light laps the edge (a riser)     lap            the tap + LED.grow
//   quiet drone under the build       bed            the tap (drops out just before the title)
//   ring completes: "lock in"         lock           fill
//   home screen appears               home           home
//   dock rises                        dock           home + HOME.dock
//   each dock app pops in             pop            home + HOME.icons, one per app, rising in pitch
//   our app finishes installing       ready          home + HOME.ready
//   its red badge                     badge          home + HOME.badge
//   our app gets tapped / clicked     press          press
//   the app zooms open                launch         launch
//   the site loads, swell into title  load           load
//   STREAMERDRAFT hit + glitches      title          title
//   title docks into the logo         title-dock     dock
//   the page: "Nobody's watching."    hero-swell     done (REVEAL.headline)
//   the page: "Yet." slams in         hero-yet       done + REVEAL.yet
//   each capsule fills in             pop            done + revealAt(n), climbing to the home note
//
// Left silent on purpose: the play button before the tap (browsers block all
// sound until the first tap), the Mac dock's bounces and the cursor hover. Not
// every movement needs a sound; that's what keeps the ones that play special.
//
// TO CHANGE A SOUND
//   Tweak it in scripts/render-sounds.py and re-run it, or drop any MP3 into
//   public/sounds/ with the same name (e.g. a whoosh from Pixabay), then re-run
//   the script with --only=<name> so it re-measures where the file starts.
// TO MAKE ONE LOUDER OR QUIETER (or mute it): change its number in MIX.

import type { Device } from "./detect";
import { panFor } from "../sound/place";
import { soundSet } from "./soundSet";
import { HOME, LED, PAGE_ORDER, REVEAL, revealAt, type Phase } from "./timeline";

// v1 and v2's intro sounds (the sound board lists these)
export const SOUND_NAMES = [
  "tap", "grow", "lap", "bed", "lock", "home", "dock", "pop", "ready", "badge",
  "press", "launch", "load", "title", "title-dock", "hero-swell", "hero-yet",
] as const;
// v5's eight scenes
export const V5_NAMES = ["light", "lock", "home", "open", "load", "title", "dock", "page"] as const;
export type SoundName = (typeof SOUND_NAMES)[number] | (typeof V5_NAMES)[number];

// The files the intro needs, for the version that's playing
export const introNames = (): readonly SoundName[] => (soundSet() === "v5" ? V5_NAMES : SOUND_NAMES);

// How loud each sound plays: 1 = as made, 0.5 = about 6 dB quieter, 0 = off.
export const MIX: Record<SoundName, number> = {
  tap: 1, grow: 1, lap: 1, bed: 1, lock: 1,
  home: 1, dock: 1, pop: 1, ready: 1, badge: 1,
  press: 1, launch: 1, load: 1, title: 1, "title-dock": 1,
  "hero-swell": 1, "hero-yet": 1,
  light: 1, open: 1, page: 1,
};

// The page's boxes, in the order they fill in: each gets a pop, right as it lands
// (Join, Apply to scout, the voice note, Road to 300)
const PAGE_POPS = [PAGE_ORDER.join, PAGE_ORDER.scout, PAGE_ORDER.voice, PAGE_ORDER.road];

// The pop is pitched on A.
// v2: the page's four pops walk THE DRAFT CALL (render-sounds.py): A, D, F#,
//     then the A above, so the page fills in on the brand's own three notes.
// v1: they started a fifth lower, on D, and climbed D, F#, A, D.
// (Semitones above the first pop, and how far that first pop is moved.)
const PAGE_POPS_BY_SET = {
  v2: { steps: [0, 5, 9, 12], rate: 1 },
  v1: { steps: [0, 4, 7, 12], rate: 2 ** (-7 / 12) },
};

export type Cue = {
  sound: SoundName;
  at?: number; // seconds after the scene starts (default 0)
  rate?: number; // playback speed: above 1 is higher and shorter (default 1)
  pan?: number; // where it comes from: -1 left ... +1 right (default: the middle)
  gain?: number; // a share of its usual volume (default 1)
  follow?: "light"; // moves with the intro's red light (sound/place.ts)
};

// How many apps each dock has (PhoneHome.tsx and HomeScreen.tsx), for the pops,
// and how wide the dock is (a share of the screen), so each pops from its place
const DOCK_APPS: Record<Device, number> = { phone: 3, tablet: 5, desk: 7 };
const DOCK_SPREAD: Record<Device, number> = { phone: 0.5, tablet: 0.55, desk: 0.45 };

// Each pop is a step up the D major pentatonic scale, so the dock fills up
// like a little arpeggio (semitones above the first pop)
const POP_STEPS = [0, 2, 4, 7, 9, 12, 14];

// The streaming gear round the page (page/Gear.tsx) popping in, after the
// page's own parts: smaller and quieter pops, carrying on up the draft call
// (D, F#, A, D), each from where that piece is. Only the pieces that are on
// screen (phones show two of the four). The timing matches Gear.module.css:
// each starts at 6 + 0.75 x its number on the page's reveal clock, and lands
// (its biggest moment) about 0.4 s into its 0.8 s pop.
const GEAR_STEPS = [5, 9, 12, 17];
function gearPops(): Cue[] {
  if (typeof document === "undefined") return [];
  const pops = PAGE_POPS_BY_SET[soundSet() === "v1" ? "v1" : "v2"];
  const shown = [...document.querySelectorAll<HTMLElement>("[data-gear]")].filter((el) => el.getClientRects().length > 0);
  return shown.map((el, k): Cue => {
    const i = Number(el.dataset.gear) || 0;
    return { sound: "pop", at: REVEAL.rest + (6 + i * 0.75) * REVEAL.gap + 0.4, rate: pops.rate * 2 ** (GEAR_STEPS[k % GEAR_STEPS.length] / 12), pan: panFor(el), gain: 0.6 };
  });
}

// v5: one sound per scene, from the middle. Each file is exactly as long as
// its scene (render-intro.py), so it ends as the next one starts. (No sound of
// its own for "launch": the app opening is in "open", 0.2 s after the tap.)
const V5_SCENE: Partial<Record<Phase, SoundName>> = {
  tap: "light", fill: "lock", home: "home", press: "open", load: "load", title: "title", dock: "dock", done: "page",
};
function cuesV5(phase: Phase): Cue[] {
  const sound = V5_SCENE[phase];
  return sound ? [{ sound }] : [];
}

export function cuesFor(phase: Phase, device: Device): Cue[] {
  if (soundSet() === "v5") return cuesV5(phase);
  switch (phase) {
    case "tap":
      // (the lap follows the light round the screen, left to right)
      return [{ sound: "tap" }, { sound: "grow" }, { sound: "lap", at: LED.grow, follow: "light" }, { sound: "bed" }];
    case "fill":
      return [{ sound: "lock" }];
    case "home":
      return [
        { sound: "home" },
        { sound: "dock", at: HOME.dock },
        ...Array.from({ length: DOCK_APPS[device] }, (_, i): Cue => ({
          sound: "pop",
          at: HOME.icons + i * HOME.iconGap,
          rate: 2 ** (POP_STEPS[i % POP_STEPS.length] / 12),
          pan: ((i + 0.5) / DOCK_APPS[device] - 0.5) * 2 * DOCK_SPREAD[device],
        })),
        { sound: "ready", at: HOME.ready },
        { sound: "badge", at: HOME.badge, pan: 0.1 }, // (the badge sits top right of the icon)
      ];
    case "press":
      return [{ sound: "press" }];
    case "launch":
      return [{ sound: "launch" }];
    case "load":
      return [{ sound: "load" }];
    case "title":
      return [{ sound: "title" }];
    case "dock":
      return [{ sound: "title-dock", pan: -0.35 }]; // (it goes to the top left)
    case "done":
      return [
        { sound: "hero-swell", at: REVEAL.headline },
        { sound: "hero-yet", at: REVEAL.yet },
        ...PAGE_POPS.map((n, i): Cue => {
          const pops = PAGE_POPS_BY_SET[soundSet() === "v1" ? "v1" : "v2"];
          // each from where that part of the page is (data-pop={its n})
          const where = typeof document === "undefined" ? null : document.querySelector(`[data-pop="${n}"]`);
          return { sound: "pop", at: revealAt(n), rate: pops.rate * 2 ** (pops.steps[i] / 12), pan: panFor(where) };
        }),
        ...gearPops(),
      ];
    default:
      return [];
  }
}
