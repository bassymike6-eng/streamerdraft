// src/components/launch/HomeScreen.tsx
//
// WHAT THIS IS
// The pretend home screen the intro "opens" our app from.
//   phone, tablet  an iPhone / iPad style home screen: see PhoneHome.tsx
//   desk           the planet wallpaper, a glass menu bar and a liquid-glass
//                  dock (Mac style), or a glass taskbar (Windows style)
//
// Like the phone, every other app is still "loading" (homeParts.tsx) and
// StreamerDraft is the only one that finishes.
//
// THE DOCK'S SEQUENCE (timings: HOME in timeline.ts)
//   Mac style      the menu bar drops in and the dock rises; its apps pop in;
//                  two of them bounce like apps starting up; ours finishes
//                  installing; the cursor arrives and the dock magnifies
//                  round it (DESK_MAGNIFY in geometry.ts); click
//   Windows style  the taskbar rises; its apps pop in; ours finishes
//                  installing; the cursor arrives and it gets a hover highlight; click
//
// Our app is always the middle of the dock, so it sits on the screen's centre
// line. geometry.ts relies on that to launch the app from the right spot.

import type { Device } from "./detect";
import { DESK_MAGNIFY } from "./geometry";
import { GhostTile, Lens, OurTile } from "./homeParts";
import { PhoneHome } from "./PhoneHome";
import { Wallpaper } from "./Wallpaper";
import styles from "./LaunchIntro.module.css";

// The dock's apps, left to right. Ours is the middle one (null).
//   ring    how far round its install ring starts
//   bounce  Mac dock only: bounces this many seconds after the apps pop in
const DOCK: ({ ring: number; bounce?: number } | null)[] = [
  { ring: 0.38 }, { ring: 0.18, bounce: 0.3 }, { ring: 0.52 },
  null,
  { ring: 0.28 }, { ring: 0.45, bounce: 0.52 }, { ring: 0.1 },
];
const OURS = DOCK.indexOf(null);

// The grey bars standing in for the menu names (px)
const MENU = [54, 30, 36, 42, 50];

// How much the app at this place in the dock grows (--mag) and moves away
// from ours (--spread) when the cursor reaches the dock. The CSS only uses
// them on the Mac-style dock.
function magnify(place: number) {
  const distance = Math.min(Math.abs(place - OURS), DESK_MAGNIFY.scale.length - 1);
  return { "--mag": DESK_MAGNIFY.scale[distance], "--spread": `${Math.sign(place - OURS) * DESK_MAGNIFY.spread[distance]}px` };
}

export function HomeScreen({ device, wide, clock, dateShort }: {
  device: Device;
  wide: boolean; // is the screen wider than it is tall (picks the wallpaper)
  clock: string;
  dateShort: string;
}) {
  if (device !== "desk") return <PhoneHome device={device} wide={wide} clock={clock} dateShort={dateShort} />;

  return (
    <div className={`${styles.layer} ${styles.home} ${styles.desk}`} aria-hidden="true">
      <Wallpaper wide={wide} />

      {/* Mac-style menu bar (hidden for the Windows taskbar) */}
      <div className={styles.menuBar}>
        <span className={styles.menuLeft}>
          {MENU.map((w, i) => <i key={i} className={styles.ghostLbl} style={{ width: w }} />)}
        </span>
        <span>{dateShort}&nbsp;&nbsp;{clock}</span>
      </div>

      <div className={`${styles.deskDock} ${styles.liquid}`}>
        <Lens />
        {DOCK.map((app, place) =>
          app === null
            ? <OurTile key="ours" index={place} label={false} vars={magnify(place)} />
            : <GhostTile key={place} index={place} progress={app.ring} labelWidth={null} bounce={app.bounce} vars={magnify(place)} />
        )}
      </div>

      {/* Windows-style clock in the taskbar */}
      <div className={styles.tray}><span>{clock}</span><span>{dateShort}</span></div>
    </div>
  );
}
