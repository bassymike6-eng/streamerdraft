// src/components/launch/soundCues.ts
//
// WHAT THIS IS
// The intro's cue sheet: which sound plays in each scene, when, and how loud.
// The sounds themselves are files in public/sounds/, made by
// scripts/render-sounds.py (all custom, all in D major, no licences needed).
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
import { HOME, LED, type Phase } from "./timeline";

export const SOUND_NAMES = [
  "tap", "grow", "lap", "bed", "lock", "home", "dock", "pop", "ready", "badge",
  "press", "launch", "load", "title", "title-dock",
] as const;
export type SoundName = (typeof SOUND_NAMES)[number];

// How loud each sound plays: 1 = as made, 0.5 = about 6 dB quieter, 0 = off.
export const MIX: Record<SoundName, number> = {
  tap: 1, grow: 1, lap: 1, bed: 1, lock: 1,
  home: 1, dock: 1, pop: 1, ready: 1, badge: 1,
  press: 1, launch: 1, load: 1, title: 1, "title-dock": 1,
};

export type Cue = {
  sound: SoundName;
  at?: number; // seconds after the scene starts (default 0)
  rate?: number; // playback speed: above 1 is higher and shorter (default 1)
};

// How many apps each dock has (PhoneHome.tsx and HomeScreen.tsx), for the pops
const DOCK_APPS: Record<Device, number> = { phone: 3, tablet: 5, desk: 7 };

// Each pop is a step up the D major pentatonic scale, so the dock fills up
// like a little arpeggio (semitones above the first pop)
const POP_STEPS = [0, 2, 4, 7, 9, 12, 14];

export function cuesFor(phase: Phase, device: Device): Cue[] {
  switch (phase) {
    case "tap":
      return [{ sound: "tap" }, { sound: "grow" }, { sound: "lap", at: LED.grow }, { sound: "bed" }];
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
        })),
        { sound: "ready", at: HOME.ready },
        { sound: "badge", at: HOME.badge },
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
      return [{ sound: "title-dock" }];
    default:
      return [];
  }
}
