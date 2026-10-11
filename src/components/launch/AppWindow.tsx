// src/components/launch/AppWindow.tsx
//
// WHAT THIS IS
// The app that opens out of our dock icon: a browser loading streamerdraft.com.
// Which top bar it shows depends on the device and where the link was opened:
//
//   phone/tablet, normal browser   address pill
//   phone/tablet, social app       in-app style bar (close button, site name, menu)
//   computer                       tab strip + address row
//
// All three are plain, generic shapes: no real browser's or app's branding.
// .winArt is our icon's artwork, scaled up; it fades as the app opens.

import styles from "./LaunchIntro.module.css";

export function AppWindow() {
  return (
    <div className={`${styles.layer} ${styles.win}`} aria-hidden="true">
      <div className={styles.bar}>
        {/* Phone / tablet browser */}
        <div className={styles.barBrowser}>
          <div className={styles.addressPill}>
            <svg viewBox="0 0 12 12"><rect x="2" y="5.5" width="8" height="5.5" rx="1.2" /><path d="M4 5.5V4a2 2 0 0 1 4 0v1.5" /></svg>
            <span>streamerdraft.com</span>
          </div>
        </div>

        {/* Phone / tablet, opened inside a social app */}
        <div className={styles.barSocial}>
          <svg viewBox="0 0 20 20"><path d="M5 5l10 10M15 5L5 15" /></svg>
          <div className={styles.socialTitle}>
            <b>StreamerDraft</b>
            <span>streamerdraft.com</span>
          </div>
          <svg viewBox="0 0 20 20"><path d="M4 10h.01M10 10h.01M16 10h.01" strokeWidth="3" /></svg>
        </div>

        {/* Computer */}
        <div className={styles.barDesk}>
          <div className={styles.tabs}>
            <span className={styles.windowDots}><i /><i /><i /></span>
            <span className={styles.tab}><span className={styles.tabSpinner} />StreamerDraft</span>
          </div>
          <div className={styles.addressRow}>
            <svg viewBox="0 0 16 16"><path d="M10 3L5 8l5 5" /></svg>
            <svg viewBox="0 0 16 16"><path d="M6 3l5 5-5 5" /></svg>
            <svg viewBox="0 0 16 16"><path d="M13 8a5 5 0 1 1-1.5-3.5M13 2.5V5h-2.5" /></svg>
            <span className={styles.address}>streamerdraft.com</span>
          </div>
        </div>

        <span className={styles.progress} />
      </div>

      <div className={styles.winArt}><b>SD</b></div>
    </div>
  );
}
