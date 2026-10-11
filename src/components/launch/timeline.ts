// src/components/launch/timeline.ts
//
// WHAT THIS IS
// The running order of the intro, in one place. To make a beat longer or
// shorter, change its time here (seconds after the visitor taps play).
//
//   idle    black screen, light running round the play button
//   tap     the light grows from the button to the edge of the screen and laps it
//   fill    back at the start, the whole edge lights up
//   home    the home screen appears
//   press   our app gets tapped (or clicked, on a computer)
//   launch  the app opens out of its icon
//   load    the site loads in the browser
//   title   the browser bar slides away, STREAMERDRAFT comes in
//   dock    the title shrinks into the top left; the page's loaders come in
//   done    the page, waiting for its content
//
// HOW THE CSS KNOWS WHERE WE ARE
// The root element gets data-on="tap fill home ..." listing every phase reached
// so far. Each phase's animations live under [data-on~="phase"] in the CSS,
// so earlier animations stay put while later ones start.

export const PHASES = ["idle", "tap", "fill", "home", "press", "launch", "load", "title", "dock", "done"] as const;
export type Phase = (typeof PHASES)[number];

export const PHASE_TIMES: { phase: Phase; at: number }[] = [
  { phase: "fill", at: 2.0 },
  { phase: "home", at: 2.35 },
  { phase: "press", at: 3.45 },
  { phase: "launch", at: 3.65 },
  { phase: "load", at: 4.25 },
  { phase: "title", at: 4.9 },
  { phase: "dock", at: 6.4 },
  { phase: "done", at: 7.3 },
];

// How long the light takes to go once round the play button (must match the CSS "spin" on .halo).
export const IDLE_LAP_MS = 1800;

// "title" -> "tap fill home press launch load title"
export function reachedPhases(phase: Phase): string {
  const index = PHASES.indexOf(phase);
  return PHASES.slice(1, index + 1).join(" ");
}
