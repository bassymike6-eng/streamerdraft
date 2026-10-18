// src/components/launch/timeline.ts
//
// WHAT THIS IS
// The running order of the intro, in one place. To make a beat longer or
// shorter, change its time here (seconds after the visitor taps play).
//
//   idle    black screen, the red light running round the play button
//   tap     the light grows from the button out to the screen's edge, then laps it once
//   fill    the lap is done: the outline completes all the way round
//   home    the home screen appears
//   press   our app gets tapped (or clicked, on a computer)
//   launch  the app opens out of its icon
//   load    the site loads in the browser
//   title   the browser bar slides away, STREAMERDRAFT comes in
//   dock    the title shrinks into the top left; the page's loading boxes come in
//   done    the page's real content loads into those boxes (REVEAL, below)
//
// HOW THE CSS KNOWS WHERE WE ARE
// The root element gets data-on="tap fill home ..." listing every phase reached
// so far. Each phase's animations live under [data-on~="phase"] in the CSS,
// so earlier animations stay put while later ones start.

export const PHASES = ["idle", "tap", "fill", "home", "press", "launch", "load", "title", "dock", "done"] as const;
export type Phase = (typeof PHASES)[number];

// The red lights. Times in seconds; lengths as a share of the way round.
export const LED = {
  idleLap: 3.2, // one lap of the play button while it waits
  grow: 1.3, // from the button out to the screen edge
  edgeLap: 2.4, // one full lap of the screen edge, back to where it arrived
  close: 0.3, // the full outline completing once that lap is done
  buttonLength: 0.4, // how long the light is round the button
  edgeLength: 0.18, // how long it is round the screen edge
  boxLap: 4, // one lap of each loading box on the page (all boxes move in step)
  boxLength: 0.14, // how long the light is round a loading box
};

// The home screen's own little sequence, in seconds after "home" starts.
// Every other app is still loading and ours finishes first:
//   dock    the dock (or taskbar) rises in from the bottom
//   icons   its apps pop in, one after another (iconGap apart)
//   ready   our app finishes installing: its ring closes and the icon pops out of the glass
//   badge   its red "1" badge pops on
//   hover   computer only: the cursor reaches the dock (a Mac dock magnifies, Windows highlights)
//   press   our app gets tapped (this is when the "press" phase starts)
// Meanwhile every other app's install ring keeps filling (see GhostTile in homeParts.tsx).
// The CSS reads these as --h-dock, --h-icons ... (homeVars, below).
export const HOME = {
  dock: 0.05,
  icons: 0.25,
  iconGap: 0.06,
  ready: 0.7,
  badge: 1.0,
  hover: 1.05,
  press: 1.45,
};

// The light finishes its lap of the screen edge here, so everything after it
// is timed from this moment. Change LED.grow or LED.edgeLap and the rest follows.
const LAP_DONE = LED.grow + LED.edgeLap;
const HOME_AT = LAP_DONE + 0.5;
const PRESS_AT = HOME_AT + HOME.press;

export const PHASE_TIMES: { phase: Phase; at: number }[] = [
  { phase: "fill", at: LAP_DONE },
  { phase: "home", at: HOME_AT },
  { phase: "press", at: PRESS_AT },
  { phase: "launch", at: PRESS_AT + 0.2 },
  { phase: "load", at: PRESS_AT + 0.8 },
  { phase: "title", at: PRESS_AT + 1.45 },
  { phase: "dock", at: PRESS_AT + 2.95 },
  { phase: "done", at: PRESS_AT + 3.85 },
];

// The page's own reveal, in seconds after "done" starts (the hero: src/components/page/).
// The loading boxes have been showing since "dock"; now the real content takes their place:
//   headline  "Nobody's watching." fades up, quiet and grey (with a soft swell)
//   yet       a beat of silence, then "Yet." slams in red (with a hit)
//   rest      the line under it, then each capsule fills in, one after another
//   gap       ...this far apart (each capsule gets a pop, so this is the pops' rhythm too)
export const REVEAL = {
  headline: 0,
  yet: 0.85,
  rest: 1.25,
  gap: 0.12,
};

// When part number n of the page fills in (seconds after "done").
// The page's CSS works the same thing out from --n (see "slot" in Page.module.css);
// the lights (useBoxLights.ts) and the pops (soundCues.ts) use this, so all three line up.
export const revealAt = (n: number) => REVEAL.rest + n * REVEAL.gap;

// The order the page's parts fill in, after the headline (the n above).
// Kept here, next to the timings, because the page AND the sound cues both need it:
// every capsule from `join` to `road` gets a pop as it fills in. The footer
// fills in last, quietly.
export const PAGE_ORDER = {
  sub: 0, // the line under the headline (words: no pop)
  join: 1, // Join the draft
  scout: 2, // Apply to scout
  voice: 3, // the voice note island
  road: 4, // Road to 300 + How it works (one box)
  footer: 5, // the footer capsule (no pop)
} as const;

// HOME and REVEAL as CSS custom properties for the root element:
// { "--h-dock": "0.05s", ..., "--rv-yet": "0.85s", ... }
// (the same on the server and in the browser, so it's safe to render straight away)
export function homeVars(): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [beat, seconds] of Object.entries(HOME)) vars[`--h-${beat}`] = `${seconds}s`;
  for (const [beat, seconds] of Object.entries(REVEAL)) vars[`--rv-${beat}`] = `${seconds}s`;
  return vars;
}

// "title" -> "tap fill home press launch load title"
export function reachedPhases(phase: Phase): string {
  const index = PHASES.indexOf(phase);
  return PHASES.slice(1, index + 1).join(" ");
}
