// src/components/launch/homeParts.tsx
//
// WHAT THIS IS
// Pieces shared by the phone/tablet home screen (PhoneHome.tsx) and the
// computer one (HomeScreen.tsx).
//
// THE IDEA
// Every other app on the home screen is still "loading": a frosted-glass tile
// with a little install ring that keeps filling, and a grey bar where its name
// will be. The only app that finishes is StreamerDraft: its ring closes and the
// real icon pops out of the glass. So it's the one thing your eye goes to.
// (When each of those beats happens is HOME in timeline.ts.)

import type { CSSProperties } from "react";
import styles from "./LaunchIntro.module.css";

// --i staggers each item's entrance (see the "home" phase in the CSS).
// In a dock, --i is the app's position in the dock (0, 1, 2 ...).
export const stagger = (i: number) => ({ "--i": i }) as CSSProperties;

// Extra CSS custom properties for a tile (e.g. the Mac dock's --mag and --spread).
type Vars = Record<string, string | number>;

// What's inside a piece of glass (a dock, the Search pill): two copies of the
// wallpaper lined up with the real one behind, one squeezed (seen through the
// glass's curved rim) and one slightly magnified (seen through its middle).
// See "Liquid glass" in the CSS.
export function Lens() {
  return (
    <span className={styles.lens} aria-hidden="true">
      <span className={`${styles.lensLayer} ${styles.lensRim}`}><span className={styles.lensWall} /></span>
      <span className={`${styles.lensLayer} ${styles.lensCore}`}><span className={styles.lensWall} /></span>
    </span>
  );
}

// ---- The install ring ----
// A circle of radius 15 in a 36 x 36 box. It's drawn as one dash the length of
// the whole circle, pushed back along it (stroke-dashoffset): pushed back the
// full length = empty, not at all = full. The CSS animates that push from
// --from to --to, which is the ring filling up.
const RING = 2 * Math.PI * 15;
const offset = (progress: number) => `${(RING * (1 - progress)).toFixed(2)}px`;

function InstallRing({ from, to, seconds }: { from: number; to: number; seconds?: number }) {
  const vars = { "--from": offset(from), "--to": offset(to), ...(seconds ? { "--rt": `${seconds}s` } : {}) } as CSSProperties;
  return (
    <svg viewBox="0 0 36 36" className={styles.ghostRing} aria-hidden="true">
      <circle cx="18" cy="18" r="15" className={styles.ghostTrack} />
      <circle cx="18" cy="18" r="15" className={styles.ghostArc} strokeDasharray={`${RING} ${RING}`} style={vars} />
    </svg>
  );
}

// An app that's still loading.
//   progress    how far round its install ring starts (0 to 1)
//   labelWidth  how long its grey name bar is (px), or null for no name (in docks)
//   bounce      computer dock only: bounce like a Mac app that's starting up,
//               this many seconds after the dock's apps have popped in
// While the home screen is up, the ring keeps filling. How far and how fast
// varies with the tile's position, so they don't all move as one.
export function GhostTile({ index, progress, labelWidth, bounce, vars }: {
  index: number;
  progress: number;
  labelWidth: number | null;
  bounce?: number;
  vars?: Vars;
}) {
  const gain = 0.28 + ((index * 7) % 5) * 0.05; // 0.28 to 0.48 of the way round
  const seconds = 1.8 + ((index * 3) % 4) * 0.25; // 1.8s to 2.55s
  const style = { ...stagger(index), ...vars, ...(bounce !== undefined ? { "--bd": `${bounce}s` } : {}) } as CSSProperties;
  return (
    <div className={`${styles.tile} ${bounce !== undefined ? styles.bounce : ""}`} style={style}>
      <span className={`${styles.ico} ${styles.ghostIco}`}>
        <InstallRing from={progress} to={Math.min(progress + gain, 0.97)} seconds={seconds} />
      </span>
      {labelWidth !== null && <span className={styles.ghostLbl} style={{ width: labelWidth }} />}
    </div>
  );
}

// Our app: the only one that finishes loading. It starts as a loading tile
// like the rest (.ourGhost, its ring nearly full), the ring closes, then the
// real icon (graphite, red SD) pops out of the glass and its "1" badge pops on.
export function OurTile({ index, label, vars }: { index: number; label: boolean; vars?: Vars }) {
  return (
    <div className={`${styles.tile} ${styles.tileSd}`} style={{ ...stagger(index), ...vars } as CSSProperties}>
      <span className={`${styles.ico} ${styles.ourIco}`}>
        <span className={`${styles.ourGhost} ${styles.ghostIco}`}>
          <InstallRing from={0.72} to={1} />
        </span>
        <span className={styles.sdArt}><b>SD</b></span>
        <b className={styles.badge}>1</b>
      </span>
      {label && <span className={styles.iosLbl}><span>StreamerDraft</span></span>}
    </div>
  );
}
