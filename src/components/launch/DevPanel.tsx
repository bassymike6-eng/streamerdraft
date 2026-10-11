// src/components/launch/DevPanel.tsx
//
// WHAT THIS IS
// A little panel (top left, only in `npm run dev`, never on the live site)
// for switching between the versions of the intro while we work on it, like
// the Tweaks panel on the design canvas. It also writes your choice into the
// URL (?device=...&look=...&source=...), so a refresh keeps it.

import { useState } from "react";
import type { Visitor } from "./detect";
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

export function DevPanel({ visitor, onChange }: { visitor: Visitor; onChange: (v: Visitor) => void }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button className={styles.devToggle} type="button" onClick={() => setOpen(true)}>
        Dev
      </button>
    );
  }

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
        <select
          value={visitor.look}
          onChange={(e) => {
            syncUrl("look", e.target.value);
            onChange({ ...visitor, look: e.target.value as Visitor["look"] });
          }}
        >
          <option value="dark">Dark</option>
          <option value="bright">Bright</option>
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
      <button type="button" onClick={() => onChange(visitor)}>Replay</button>
      <button type="button" onClick={() => setOpen(false)}>Close</button>
    </div>
  );
}
