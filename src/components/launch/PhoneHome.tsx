// src/components/launch/PhoneHome.tsx
//
// WHAT THIS IS
// The phone (and tablet) home screen the intro opens our app from, laid out
// like a real iPhone's:
//   status bar     time (+ the moon in the evening), signal, Wi-Fi, battery
//   widgets        two small ones and a wide one
//   apps           4 x 2 (6 x 2 on a tablet)
//   Search pill    above the dock
//   dock           liquid glass, 3 apps, ours in the middle
//
// Everything except our app is still "loading" (see homeParts.tsx): glass
// placeholders that pulse together while their install rings fill.
// StreamerDraft is the only app that finishes, so that's where your eye goes.
// The dock has its own little sequence (HOME in timeline.ts): it rises in, its
// apps pop in, ours finishes installing, then its badge pops on. The wallpaper is our own rendered
// planet (public/intro/, made by scripts/render-planet.py).
//
// On shorter screens (e.g. inside Safari, with its toolbars) the CSS drops the
// wide widget, then the small ones, so nothing ever overlaps the dock.
//
// Our app is always the middle of the dock, so it sits on the screen's centre
// line. geometry.ts relies on that to launch the app from the right spot.

import type { Device } from "./detect";
import { GhostTile, Lens, OurTile, stagger } from "./homeParts";
import { Wallpaper } from "./Wallpaper";
import styles from "./LaunchIntro.module.css";

// The loading apps: [how far round their install ring starts, how long their name bar is].
// Kept low, so you can see every ring fill while the home screen is up.
const APPS: [number, number][] = [
  [0.42, 44], [0.2, 58], [0.55, 40], [0.1, 62],
  [0.32, 50], [0.5, 38], [0.15, 64], [0.38, 54],
];
const TABLET_EXTRA: [number, number][] = [[0.28, 42], [0.08, 56], [0.46, 48], [0.35, 36]];

// The dock either side of ours: where each ring starts
const DOCK_RINGS = { phone: [0.25, 0.5], tablet: [0.2, 0.45, 0.32, 0.55] };

// ---- Little glyphs ----

function Moon() {
  return <svg viewBox="0 0 16 16"><path d="M10.6 1.4a6.6 6.6 0 1 0 4 10.4A5.6 5.6 0 0 1 10.6 1.4z" /></svg>;
}

function StatusIcons({ battery }: { battery: number }) {
  return (
    <span className={styles.iosIcons}>
      {/* signal: 3 of 4 bars */}
      <svg viewBox="0 0 18 12">
        <rect x="0" y="8" width="3" height="4" rx="1" /><rect x="5" y="5.5" width="3" height="6.5" rx="1" />
        <rect x="10" y="3" width="3" height="9" rx="1" /><rect x="15" y="0" width="3" height="12" rx="1" opacity=".35" />
      </svg>
      {/* wi-fi */}
      <svg viewBox="0 0 16 12">
        <path d="M8 11.6l2.3-2.8a3.5 3.5 0 0 0-4.6 0z" />
        <path d="M8 5.6a6.5 6.5 0 0 1 4.3 1.6l1.4-1.7A8.8 8.8 0 0 0 8 3.3a8.8 8.8 0 0 0-5.7 2.2l1.4 1.7A6.5 6.5 0 0 1 8 5.6z" />
        <path d="M8 .2a12.2 12.2 0 0 1 8 3l-1.4 1.7A10 10 0 0 0 8 2.4a10 10 0 0 0-6.6 2.5L0 3.2A12.2 12.2 0 0 1 8 .2z" />
      </svg>
      {/* battery, with the percentage inside */}
      <svg viewBox="0 0 29 13" className={styles.battery}>
        <defs><clipPath id="ios-batt"><rect x="0" y="0" width="25" height="13" rx="4" /></clipPath></defs>
        <rect x="0" y="0" width="25" height="13" rx="4" fill="rgba(255,255,255,.35)" />
        <rect x="0" y="0" width={25 * (battery / 100)} height="13" fill="#fff" clipPath="url(#ios-batt)" />
        <rect x="26.2" y="4.3" width="2" height="4.4" rx="1" fill="rgba(255,255,255,.4)" />
        <text x="12.5" y="9.9" textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#000">{battery}</text>
      </svg>
    </span>
  );
}

function SearchGlyph() {
  return <svg viewBox="0 0 16 16"><circle cx="7" cy="7" r="4.6" /><path d="M10.4 10.4l3.6 3.6" /></svg>;
}

// ---- Widgets, still loading ----

function LiveWidget() {
  return (
    <div className={`${styles.widget2} ${styles.ghostWidget} ${styles.gwLive}`}>
      <span className={styles.gRow}><i className={styles.gDot} /><i className={styles.gBar} style={{ width: "32%" }} /></span>
      <span className={styles.gCard}>
        <i className={styles.gAvatar} />
        <i className={styles.gBar} style={{ width: "58%" }} />
        <i className={`${styles.gBar} ${styles.gFaint}`} style={{ width: "42%" }} />
      </span>
    </div>
  );
}

function StreakWidget() {
  return (
    <div className={`${styles.widget2} ${styles.ghostWidget} ${styles.gwStreak}`}>
      <i className={`${styles.gBar} ${styles.gBig}`} style={{ width: "46%" }} />
      <i className={styles.gBar} style={{ width: "68%" }} />
      <i className={styles.gBlob} />
    </div>
  );
}

function ClipsWidget() {
  return (
    <div className={`${styles.widget2} ${styles.ghostWidget} ${styles.gwClips}`}>
      <span className={styles.gRow}>
        <i className={styles.gSquare} />
        <span className={styles.gCol}>
          <i className={`${styles.gBar} ${styles.gTall}`} style={{ width: "62%" }} />
          <i className={`${styles.gBar} ${styles.gFaint}`} style={{ width: "40%" }} />
        </span>
      </span>
      <span className={styles.gThumbs}><i /><i /><i /><i /></span>
    </div>
  );
}

export function PhoneHome({ device, wide, clock, dateShort }: { device: Exclude<Device, "desk">; wide: boolean; clock: string; dateShort: string }) {
  const hour = Number(clock.slice(0, 2));
  const night = hour >= 19 || hour < 7; // the moon (Sleep focus) shows in the evening and at night
  const apps = device === "tablet" ? [...APPS, ...TABLET_EXTRA] : APPS;
  const dock = DOCK_RINGS[device];
  const half = dock.length / 2;

  return (
    <div className={`${styles.layer} ${styles.home} ${styles.ios}`} aria-hidden="true">
      <Wallpaper wide={wide} />

      <div className={styles.iosStatus}>
        <span className={styles.iosTime}>
          {clock}
          {device === "tablet" && <span className={styles.iosDate}>{dateShort}</span>}
          {night && <Moon />}
        </span>
        <StatusIcons battery={76} />
      </div>

      <div className={styles.iosWidgets}>
        <div className={`${styles.tile} ${styles.wCell}`} style={stagger(0)}>
          <LiveWidget />
          <span className={styles.ghostLbl} style={{ width: 34 }} />
        </div>
        <div className={`${styles.tile} ${styles.wCell}`} style={stagger(1)}>
          <StreakWidget />
          <span className={styles.ghostLbl} style={{ width: 46 }} />
        </div>
        <div className={`${styles.tile} ${styles.wCell} ${styles.wWide}`} style={stagger(2)}>
          <ClipsWidget />
          <span className={styles.ghostLbl} style={{ width: 38 }} />
        </div>
      </div>

      <div className={styles.iosGrid}>
        {apps.map(([progress, width], i) => <GhostTile key={i} index={3 + i} progress={progress} labelWidth={width} />)}
      </div>

      <div className={`${styles.iosSearch} ${styles.liquid}`}>
        <Lens />
        <span className={styles.iosSearchText}><SearchGlyph />Search</span>
      </div>

      {/* The dock rises in, then its apps pop in left to right (index = place in the dock) */}
      <div className={`${styles.iosDock} ${styles.liquid}`}>
        <Lens />
        {dock.slice(0, half).map((p, i) => <GhostTile key={`a${i}`} index={i} progress={p} labelWidth={null} />)}
        <OurTile index={half} label={false} />
        {dock.slice(half).map((p, i) => <GhostTile key={`b${i}`} index={half + 1 + i} progress={p} labelWidth={null} />)}
      </div>
    </div>
  );
}
