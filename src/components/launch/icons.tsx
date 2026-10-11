// src/components/launch/icons.tsx
//
// WHAT THIS IS
// The little line icons for the invented apps on the home screen.
// <GlyphDefs /> draws each icon once (hidden); <Glyph name="cal" /> reuses it.
// These are our own simple icons, not Apple's or anyone else's.

import styles from "./LaunchIntro.module.css";

export type GlyphName =
  | "cal" | "sun" | "clock" | "note" | "pin" | "img" | "music"
  | "mail" | "gear" | "card" | "folder" | "mic" | "globe" | "cam";

export function GlyphDefs() {
  return (
    <svg className={styles.defs} width="0" height="0" aria-hidden="true" focusable="false">
      <defs>
        <symbol id="g-cal" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" /></symbol>
        <symbol id="g-sun" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></symbol>
        <symbol id="g-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></symbol>
        <symbol id="g-note" viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h4" /></symbol>
        <symbol id="g-pin" viewBox="0 0 24 24"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></symbol>
        <symbol id="g-img" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="3" /><circle cx="9" cy="10" r="1.8" /><path d="M21 16l-5-5-8 8" /></symbol>
        <symbol id="g-music" viewBox="0 0 24 24"><path d="M9 18V6l10-2v12" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="16.5" cy="16" r="2.5" /></symbol>
        <symbol id="g-mail" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M3 7l9 6 9-6" /></symbol>
        <symbol id="g-gear" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><circle cx="12" cy="12" r="7" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></symbol>
        <symbol id="g-card" viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="13" rx="3" /><path d="M3 10h18M7 15h4" /></symbol>
        <symbol id="g-folder" viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></symbol>
        <symbol id="g-mic" viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></symbol>
        <symbol id="g-globe" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></symbol>
        <symbol id="g-cam" viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="13" rx="3" /><path d="M8 7l1.5-3h5L16 7" /><circle cx="12" cy="13.5" r="3.5" /></symbol>
      </defs>
    </svg>
  );
}

export function Glyph({ name }: { name: GlyphName }) {
  return (
    <svg className={styles.glyph} aria-hidden="true">
      <use href={`#g-${name}`} />
    </svg>
  );
}
