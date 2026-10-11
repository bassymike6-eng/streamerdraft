// src/components/launch/HomeScreen.tsx
//
// WHAT THIS IS
// The pretend home screen the intro "opens" our app from. It's our own design
// with invented apps (we can't use Apple's, Google's or anyone's real icons).
//
//   phone   status bar, clock widget, 4 x 3 apps, dock of 3 (ours in the middle)
//   tablet  status bar, widget on the left, 6 x 3 apps, dock of 5
//   desk    wallpaper + menu bar + dock of 7 (Mac style) or taskbar (Windows style)
//
// Our app is always the middle of the dock, so it sits on the screen's centre
// line. geometry.ts relies on that to launch the app from the right spot.

import type { CSSProperties } from "react";
import type { Device } from "./detect";
import { Glyph, type GlyphName } from "./icons";
import styles from "./LaunchIntro.module.css";

type App = { name: string; glyph: GlyphName; tone: Tone };
type Tone = "t1" | "t2" | "t3" | "t4" | "t5" | "t6";

const PHONE_APPS: App[] = [
  { name: "Calendar", glyph: "cal", tone: "t1" },
  { name: "Weather", glyph: "sun", tone: "t4" },
  { name: "Clock", glyph: "clock", tone: "t3" },
  { name: "Notes", glyph: "note", tone: "t4" },
  { name: "Maps", glyph: "pin", tone: "t5" },
  { name: "Photos", glyph: "img", tone: "t2" },
  { name: "Music", glyph: "music", tone: "t2" },
  { name: "Mail", glyph: "mail", tone: "t1" },
  { name: "Settings", glyph: "gear", tone: "t3" },
  { name: "Wallet", glyph: "card", tone: "t6" },
  { name: "Files", glyph: "folder", tone: "t1" },
  { name: "Podcasts", glyph: "mic", tone: "t6" },
];

const TABLET_EXTRA: App[] = [
  { name: "Camera", glyph: "cam", tone: "t3" },
  { name: "Browser", glyph: "globe", tone: "t1" },
  { name: "Journal", glyph: "note", tone: "t6" },
  { name: "Radio", glyph: "mic", tone: "t4" },
  { name: "Translate", glyph: "globe", tone: "t5" },
  { name: "Timer", glyph: "clock", tone: "t2" },
];

// null = our app
const DOCKS: Record<Device, (App | null)[]> = {
  phone: [{ name: "Browser", glyph: "globe", tone: "t1" }, null, { name: "Camera", glyph: "cam", tone: "t3" }],
  tablet: [
    { name: "Notes", glyph: "note", tone: "t4" },
    { name: "Browser", glyph: "globe", tone: "t1" },
    null,
    { name: "Camera", glyph: "cam", tone: "t3" },
    { name: "Music", glyph: "music", tone: "t2" },
  ],
  desk: [
    { name: "Files", glyph: "folder", tone: "t1" },
    { name: "Browser", glyph: "globe", tone: "t5" },
    { name: "Mail", glyph: "mail", tone: "t1" },
    null,
    { name: "Music", glyph: "music", tone: "t2" },
    { name: "Photos", glyph: "img", tone: "t6" },
    { name: "Settings", glyph: "gear", tone: "t3" },
  ],
};

// The --i custom property staggers each icon's entrance.
const stagger = (i: number) => ({ "--i": i }) as CSSProperties;

export function OurAppIcon() {
  return (
    <span className={`${styles.ico} ${styles.sdIco}`}>
      <b>SD</b>
      <i />
    </span>
  );
}

function Tile({ app, index }: { app: App; index: number }) {
  return (
    <div className={styles.tile} style={stagger(index)}>
      <span className={`${styles.ico} ${styles[app.tone]}`}>
        <Glyph name={app.glyph} />
      </span>
      <span className={styles.lbl}>{app.name}</span>
    </div>
  );
}

export function HomeScreen({ device, clock, dateLong, dateShort }: {
  device: Device;
  clock: string;
  dateLong: string;
  dateShort: string;
}) {
  const apps = device === "tablet" ? [...PHONE_APPS, ...TABLET_EXTRA] : PHONE_APPS;
  const dock = DOCKS[device];

  return (
    <div className={`${styles.layer} ${styles.home}`} aria-hidden="true">
      {/* Phone / tablet status bar */}
      <div className={styles.status}>
        <span>{clock}</span>
        <span className={styles.statusIcons}>
          <svg viewBox="0 0 18 12"><rect x="0" y="8" width="3" height="4" rx="1" /><rect x="5" y="5" width="3" height="7" rx="1" /><rect x="10" y="2.5" width="3" height="9.5" rx="1" /><rect x="15" y="0" width="3" height="12" rx="1" /></svg>
          <svg viewBox="0 0 16 12"><path d="M8 11.5l2.4-2.9a3.6 3.6 0 0 0-4.8 0z" /><path d="M8 5.2a7.6 7.6 0 0 1 5.2 2l1.5-1.8A10 10 0 0 0 8 2.8a10 10 0 0 0-6.7 2.6l1.5 1.8A7.6 7.6 0 0 1 8 5.2z" /></svg>
          <svg viewBox="0 0 27 12"><rect x="0.5" y="0.5" width="22" height="11" rx="3" fill="none" stroke="currentColor" /><rect x="2.5" y="2.5" width="15" height="7" rx="1.5" /><rect x="24" y="4" width="2" height="4" rx="1" /></svg>
        </span>
      </div>

      {/* Computer menu bar (dock style only) */}
      <div className={styles.menuBar}>
        <span className={styles.menuLeft}><b>Desktop</b><span>File</span><span>View</span><span>Window</span></span>
        <span>{dateShort}&nbsp;&nbsp;{clock}</span>
      </div>

      <div className={styles.widget}>
        <div className={styles.widgetTime}>{clock}</div>
        <div className={styles.widgetDate}>{dateLong}</div>
      </div>

      <div className={styles.grid}>
        {apps.map((app, i) => <Tile key={`${app.name}-${i}`} app={app} index={i} />)}
      </div>

      <div className={styles.pageDots}><i /><i /></div>

      <div className={styles.dock}>
        {dock.map((app, i) =>
          app ? (
            <Tile key={app.name} app={app} index={20 + i} />
          ) : (
            <div key="ours" className={`${styles.tile} ${styles.tileSd}`} style={stagger(20 + i)}>
              <OurAppIcon />
              <span className={styles.lbl}>StreamerDraft</span>
            </div>
          )
        )}
      </div>

      {/* Windows-style clock in the taskbar */}
      <div className={styles.tray}><span>{clock}</span><span>{dateShort}</span></div>
    </div>
  );
}
