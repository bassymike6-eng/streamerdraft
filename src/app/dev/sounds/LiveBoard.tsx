"use client";

// src/app/dev/sounds/LiveBoard.tsx
//
// The v3 half of the sound board: every v3 sound with a Play button. They're
// made live, so every press is a brand new one (press it a few times to hear
// how much each one varies). Played through its room, as on the site.

import { useState } from "react";
import { unlockAudio } from "@/components/launch/soundSet";
import { play, wantSpaces } from "@/components/sound/engine";
import { PATCHES, type SoundName } from "@/components/sound/patches";

const cell = { padding: "10px 12px", borderBottom: "1px solid #2a2a2e", verticalAlign: "middle" } as const;
const button = { padding: "8px 14px", borderRadius: 999, border: 0, background: "#E50914", color: "#fff", font: "inherit", fontWeight: 600, cursor: "pointer" } as const;

export function LiveBoard() {
  const [last, setLast] = useState<string | null>(null);
  const names = Object.keys(PATCHES) as SoundName[];
  const go = (name: SoundName, pan = 0) => {
    unlockAudio();
    wantSpaces();
    play(name, { bus: "ui", pan, o: { step: 2 } });
    setLast(name);
  };
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 36 }}>
      <tbody>
        {names.map((name) => (
          <tr key={name}>
            <td style={cell}>
              <b>{name}</b>
              <div style={{ color: "#a1a1aa", fontSize: 13, marginTop: 2 }}>{PATCHES[name].about}</div>
              <div style={{ color: "#71717a", fontSize: 12, marginTop: 2 }}>
                echoes in the {PATCHES[name].space} ({Math.round(PATCHES[name].send * 100)}%), set to {PATCHES[name].lufs} LUFS
              </div>
            </td>
            <td style={{ ...cell, whiteSpace: "nowrap", textAlign: "right" }}>
              <button type="button" style={{ ...button, background: "#2a2a2e", marginRight: 6 }} onClick={() => go(name, -0.7)}>Left</button>
              <button type="button" style={button} onClick={() => go(name)}>{last === name ? "Again" : "Play"}</button>
              <button type="button" style={{ ...button, background: "#2a2a2e", marginLeft: 6 }} onClick={() => go(name, 0.7)}>Right</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
