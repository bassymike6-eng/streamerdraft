// src/components/sound/launch.ts
//
// WHAT THIS IS
// The intro's sound in v3: the cue sheet (which sound, when, and where on
// the screen it comes from) and the player LaunchIntro.tsx drives. It has
// the same five controls as the v1 / v2 player (launch/sound.ts), so the
// intro doesn't care which version is playing.
//
//   scene                             sound          from
//   tap play                          tap            the middle (the play button)
//   light grows out to the edge       grow           the middle, spreading wide
//   light laps the edge               lap            FOLLOWS THE LIGHT round the screen
//   under the build                   bed            all round (wind)
//   ring completes                    lock           left bank, right bank, middle
//   home screen appears               home
//   dock rises                        dock
//   each dock app pops in             pop            each from its own place in the dock
//   our app finishes installing       ready
//   its red badge                     badge          a touch right (where the badge is)
//   our app gets tapped               press
//   the app zooms open                launch         spreading wide
//   the site loads                    load           ...sucked into the title
//   STREAMERDRAFT lands               title          cameras all round the stadium
//   title docks into the logo         title-dock     top left, where it goes
//   "Nobody's watching."              hero-swell     all round (wind)
//   "Yet."                            hero-yet
//   each part of the page fills in    page-pop       each from where that part is
//
// Timings all come from timeline.ts, so the sound always lands on the picture.

import type { Device } from "../launch/detect";
import { holdPlaybackSession, releasePlaybackSession, soundOn, unlockAudio } from "../launch/soundSet";
import { HOME, LED, PAGE_ORDER, PHASE_TIMES, REVEAL, revealAt, type Phase } from "../launch/timeline";
import { panFor, play, stopStage, want, wantSpaces } from "./engine";
import type { Options, SoundName } from "./patches";

// When the intro has finished (plus time for the last echoes)
const INTRO_END = (PHASE_TIMES[PHASE_TIMES.length - 1]?.at ?? 10) + 4;

// How many apps each dock has (PhoneHome.tsx and HomeScreen.tsx), and how
// wide the dock is (as a share of the screen) for placing each pop
const DOCK: Record<Device, { apps: number; spread: number }> = {
  phone: { apps: 3, spread: 0.5 },
  tablet: { apps: 5, spread: 0.55 },
  desk: { apps: 7, spread: 0.45 },
};

// The page's parts that pop as they fill in (each has data-pop={its n})
const PAGE_POPS = [PAGE_ORDER.join, PAGE_ORDER.scout, PAGE_ORDER.voice, PAGE_ORDER.road];

type Cue = { name: SoundName; at?: number; o?: Options; pan?: number; follow?: "light"; maxLate?: number };

function cuesFor(phase: Phase, device: Device): Cue[] {
  switch (phase) {
    case "tap":
      // (the wind under it all can come in late, partway through, on a slow phone)
      return [{ name: "tap" }, { name: "grow" }, { name: "bed", maxLate: 4 }, { name: "lap", at: LED.grow, follow: "light" }];
    case "fill":
      return [{ name: "lock" }];
    case "home": {
      const dock = DOCK[device];
      return [
        { name: "home" },
        { name: "dock", at: HOME.dock },
        ...Array.from({ length: dock.apps }, (_, i): Cue => ({
          name: "pop",
          at: HOME.icons + i * HOME.iconGap,
          o: { step: i },
          pan: ((i + 0.5) / dock.apps - 0.5) * 2 * dock.spread,
        })),
        { name: "ready", at: HOME.ready },
        { name: "badge", at: HOME.badge, pan: 0.1 },
      ];
    }
    case "press":
      return [{ name: "press" }];
    case "launch":
      return [{ name: "launch" }];
    case "load":
      return [{ name: "load" }];
    case "title":
      return [{ name: "title" }];
    case "dock":
      return [{ name: "title-dock", pan: -0.35 }];
    case "done":
      return [
        { name: "hero-swell", at: REVEAL.headline },
        { name: "hero-yet", at: REVEAL.yet },
        ...PAGE_POPS.map((n, i): Cue => ({
          name: "page-pop",
          at: revealAt(n),
          o: { step: i },
          pan: panFor(typeof document === "undefined" ? null : document.querySelector(`[data-pop="${n}"]`)),
        })),
      ];
    default:
      return [];
  }
}

// Every sound the intro will need, in the order it needs them (the
// background thread makes them in this order)
function wantIntro() {
  const order: [SoundName, Options?][] = [["tap"], ["grow"], ["lap"]];
  for (const [name, o] of order) want(name, o);
  wantSpaces(); // (the rooms: the echo can join a moment late, the sounds can't)
  const rest: [SoundName, Options?][] = [
    ["lock"], ["bed"], ["home"], ["dock"],
    ...Array.from({ length: 7 }, (_, i): [SoundName, Options] => ["pop", { step: i }]),
    ["ready"], ["badge"], ["press"], ["launch"], ["load"], ["title"], ["title-dock"], ["hero-swell"], ["hero-yet"],
    ...PAGE_POPS.map((_, i): [SoundName, Options] => ["page-pop", { step: i }]),
  ];
  for (const [name, o] of rest) want(name, o);
}

export class LaunchSoundV3 {
  private started = false;

  // Before the tap: start making everything (nothing plays)
  preload() {
    wantIntro();
  }

  // The tap: call from the play button's click handler
  start() {
    const engine = unlockAudio(); // (made here either way: the page's sounds use it later)
    this.started = !!engine && soundOn();
    if (!this.started) return;
    holdPlaybackSession(INTRO_END); // plays even with an iPhone on silent: they tapped Play
    wantIntro();
  }

  // Each scene: its sounds, timed from now on the audio clock
  cue(phase: Phase, device: Device) {
    if (!this.started) return;
    const ctx = unlockAudio()?.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    for (const c of cuesFor(phase, device)) {
      play(c.name, { bus: "stage", when: now + (c.at ?? 0), o: c.o, pan: c.pan, follow: c.follow, lateOk: true, maxLate: c.maxLate });
    }
  }

  // Skip / replay
  stop(fade = 0.25) {
    stopStage(fade);
    releasePlaybackSession();
  }

  close() {
    this.started = false;
    releasePlaybackSession();
  }
}
