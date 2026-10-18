// src/components/launch/DevPanel.tsx
//
// WHAT THIS IS
// A little panel (top left, only in `npm run dev`, never on the live site)
// for switching between the versions of the intro while we work on it, like
// the Tweaks panel on the design canvas. It also writes your choice into the
// URL (?device=...&look=...&source=...&font=...&case=...), so a refresh keeps it.
//
// Font: tries each brand font candidate (src/lib/brand-font.ts). If a font's
// file isn't in public/fonts/ yet, it says so here, and you'll see Anton instead.

import { useState } from "react";
import { BRAND_FONT, FONTS, titleText, type FontId } from "@/lib/brand-font";
import { applyUrlOverrides, lookFromClock, type Visitor } from "./detect";
import type { FontPick } from "./LaunchIntro";
import styles from "./LaunchIntro.module.css";

type DeviceChoice = "phone" | "tablet" | "desk-dock" | "desk-bar";

function deviceChoice(v: Visitor): DeviceChoice {
  if (v.device === "desk") return v.dockStyle === "bar" ? "desk-bar" : "desk-dock";
  return v.device;
}

function syncUrl(key: string, value: string) {
  const params = new URLSearchParams(window.location.search);
  params.set(key, value);
  window.history.replaceState(null, "", `?${params}`);
}

export function DevPanel({ visitor, onChange, font, fontLoaded, onFont }: {
  visitor: Visitor;
  onChange: (v: Visitor) => void;
  font: FontPick;
  fontLoaded: boolean; // false = the font's file wasn't found
  onFont: (pick: FontPick) => void;
}) {
  const [open, setOpen] = useState(false);
  const casing = font.text === font.text.toUpperCase() ? "caps" : "mixed";

  if (!open) {
    return (
      <button className={styles.devToggle} type="button" onClick={() => setOpen(true)}>
        Dev
      </button>
    );
  }

  // The look: forced by ?look= in the URL, or picked by the clock (what visitors get).
  // clockLook also respects ?hour= (for testing a time of day).
  const params = new URLSearchParams(window.location.search);
  const lookForced = params.has("look");
  params.delete("look");
  const clockLook = applyUrlOverrides({ ...visitor, look: lookFromClock() }, `?${params}`).look;

  const setDevice = (choice: DeviceChoice) => {
    syncUrl("device", choice);
    const next: Visitor = { ...visitor, forced: true };
    if (choice === "phone" || choice === "tablet") next.device = choice;
    else {
      next.device = "desk";
      next.dockStyle = choice === "desk-bar" ? "bar" : "dock";
    }
    onChange(next);
  };

  return (
    <div className={styles.devPanel}>
      <label>
        Device
        <select value={deviceChoice(visitor)} onChange={(e) => setDevice(e.target.value as DeviceChoice)}>
          <option value="phone">Phone</option>
          <option value="tablet">Tablet</option>
          <option value="desk-dock">Desktop (dock)</option>
          <option value="desk-bar">Desktop (taskbar)</option>
        </select>
      </label>
      <label>
        Look
        {/* "Clock" is what visitors get. Dark / Bright force it (?look= in the URL),
            and that sticks through refreshes until you pick Clock again. */}
        <select
          value={lookForced ? visitor.look : "clock"}
          onChange={(e) => {
            if (e.target.value === "clock") {
              window.history.replaceState(null, "", `?${params}`); // the URL without ?look=
              onChange({ ...visitor, look: clockLook });
              return;
            }
            syncUrl("look", e.target.value);
            onChange({ ...visitor, look: e.target.value as Visitor["look"] });
          }}
        >
          <option value="clock">Clock ({clockLook} right now)</option>
          <option value="dark">Dark (forced)</option>
          <option value="bright">Bright (forced)</option>
        </select>
      </label>
      <label>
        Opened from
        <select
          value={visitor.source}
          onChange={(e) => {
            syncUrl("source", e.target.value);
            onChange({ ...visitor, source: e.target.value as Visitor["source"] });
          }}
        >
          <option value="browser">Browser</option>
          <option value="social">Social app</option>
        </select>
      </label>
      <label>
        Font
        <select
          value={font.id}
          onChange={(e) => {
            const id = e.target.value as FontId;
            syncUrl("font", id);
            const params = new URLSearchParams(window.location.search);
            params.delete("case"); // a new font starts in its own default case
            window.history.replaceState(null, "", `?${params}`);
            onFont({ id, text: titleText(id, null) });
          }}
        >
          {(Object.keys(FONTS) as FontId[]).map((id) => (
            <option key={id} value={id}>{FONTS[id].label}{id === BRAND_FONT ? " (in use)" : ""}</option>
          ))}
        </select>
      </label>
      <label>
        Case
        <select
          value={casing}
          onChange={(e) => {
            syncUrl("case", e.target.value);
            onFont({ id: font.id, text: titleText(font.id, e.target.value) });
          }}
        >
          <option value="caps">STREAMERDRAFT</option>
          <option value="mixed">StreamerDraft</option>
        </select>
      </label>
      {!fontLoaded && (
        <p className={styles.devWarn}>
          Can&apos;t find this font&apos;s file in public/fonts, so this is Anton. Check the file&apos;s name and folder.
        </p>
      )}
      {!FONTS[font.id].free && (
        <p className={styles.devWarn}>Personal use only: fine for comparing, not for the live site.</p>
      )}
      <button type="button" onClick={() => onChange(visitor)}>Replay</button>
      <button type="button" onClick={() => setOpen(false)}>Close</button>
    </div>
  );
}
