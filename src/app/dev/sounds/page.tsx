// src/app/dev/sounds/page.tsx
//
// WHAT THIS IS
// A sound board, for hearing and comparing every version of the site's sound:
//   http://localhost:3000/dev/sounds
// The intro as the site plays it (Bassify: v1+ with a bassline; the
// bassline's two versions are here), v5 ("Scenes": each scene's sound and the
// whole thing in one go), then every v1 and v2 intro sound side by side, the page's
// sounds, then v3 ("Lights on", set aside: made live, every Play a new one).
// Only while developing (npm run dev): on the live site this address is a 404.
//
// To hear them in place instead: the home page plays Bassify; ?sounds=v5,
// ?sounds=v1plus, ?sounds=v2, ?sounds=v1 and ?sounds=v3 play the others
// (e.g. http://localhost:3000/?sounds=v5).

import { notFound } from "next/navigation";
import { SOUND_NAMES } from "@/components/launch/soundCues";
import manifestV1 from "@/components/launch/sounds.v1.json";
import manifestV2 from "@/components/launch/sounds.json";
import manifestV5 from "@/components/launch/sounds.v5.json";
import { LiveBoard } from "./LiveBoard";

export const metadata = { title: "Sound board", robots: { index: false } };

// What each one is for, in the order the intro plays them
const ABOUT: Record<string, string> = {
  tap: "tap play",
  grow: "the light grows out to the edge",
  lap: "the light laps the screen (a riser)",
  bed: "the quiet drone under the build",
  lock: "the ring locks in",
  home: "the home screen appears",
  dock: "the dock rises",
  pop: "each dock app pops in (and each part of the page)",
  ready: "our app finishes installing",
  badge: "its red badge",
  press: "our app gets tapped",
  launch: "the app zooms open",
  load: "the site loads, swelling into the title",
  title: "STREAMERDRAFT lands",
  "title-dock": "the title docks into the logo",
  "hero-swell": "the page: “Nobody’s watching.”",
  "hero-yet": "the page: “Yet.” slams in",
  "ui-open": "a pop-up opens",
  "ui-close": "a pop-up closes",
  "ui-tick-on-1": "a tick box, chip or segment on (take 1 of 3)",
  "ui-tick-off-1": "...and off (take 1 of 3)",
  "ui-step": "the scout form's Continue: the draft call's first note",
  "ui-sent": "sign-up sent: the call's first two notes, left hanging",
  "ui-success": "confirmed, you're in: the whole call",
  "ui-error": "something to fix",
  "ui-copy": "your link copied",
};

// v5's scenes, and the whole intro in one file (render-intro.py --preview)
const V5: [string, string, string][] = [
  ["preview", "the whole intro in one go (tap to the page)", "13.7s"],
  ["light", "tap: the light shoots out, then races round the edge", length(manifestV5, "light")],
  ["lock", "the outline seals", length(manifestV5, "lock")],
  ["home", "the home screen: the dock, the apps installing, ours ready, its badge", length(manifestV5, "home")],
  ["open", "our app tapped and zooming open", length(manifestV5, "open")],
  ["load", "the browser loading, sucked into the title", length(manifestV5, "load")],
  ["title", "STREAMERDRAFT: the peak", length(manifestV5, "title")],
  ["dock", "the title shrinks into the logo", length(manifestV5, "dock")],
  ["page", "“Nobody’s watching.” … “Yet.”, the boxes and the gear", length(manifestV5, "page")],
];

// Bassify's bassline (render-bassify.py): it plays under v1+'s sounds
const BASS: [string, string][] = [
  ["bass", "computers, tablets, TVs and headphones: the full, deep sub"],
  ["bass-phone", "phones: less of the deep sub (a phone speaker can't play it), more of what a phone can"],
];

const PAGE_SOUNDS = ["ui-open", "ui-close", "ui-tick-on-1", "ui-tick-off-1", "ui-step", "ui-sent", "ui-success", "ui-error", "ui-copy"];

function length(manifest: object, name: string) {
  const info = (manifest as Record<string, { length?: number }>)[name];
  return info?.length ? `${info.length.toFixed(2)}s` : "";
}

export default function SoundBoard() {
  if (process.env.NODE_ENV === "production") notFound();
  const cell = { padding: "10px 12px", borderBottom: "1px solid #2a2a2e", verticalAlign: "middle" } as const;
  return (
    <main style={{ minHeight: "100vh", background: "#0b0b0d", color: "#f2f2f5", fontFamily: "system-ui, sans-serif", padding: "32px 20px 64px" }}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <h1 style={{ margin: "0 0 6px", fontSize: 28 }}>Sound board</h1>
        <p style={{ margin: "0 0 28px", color: "#a1a1aa", lineHeight: 1.5 }}>
          Bassify is what the site plays: v1+ (v1, polished: scripts/make-v1plus.py) with a bassline under
          it (scripts/render-bassify.py). v5 (&ldquo;Scenes&rdquo;, scripts/render-intro.py), v2 and v1 are
          the versions before; v3 (&ldquo;Lights on&rdquo;) is at the bottom, set aside. Listen on your
          phone&apos;s speaker as well as headphones: that&apos;s where most people will hear it.
        </p>

        <h2 style={{ fontSize: 18, margin: "0 0 8px" }}>Bassify: the bassline on its own</h2>
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 36 }}>
          <tbody>
            {BASS.map(([name, about]) => (
              <tr key={name}>
                <td style={cell}>
                  <b>{name}</b>
                  <div style={{ color: "#a1a1aa", fontSize: 13, marginTop: 2 }}>{about}</div>
                </td>
                <td style={cell}>
                  <audio controls preload="none" src={`/sounds/bassify/${name}.mp3`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2 style={{ fontSize: 18, margin: "0 0 8px" }}>The intro: v5 (the one before)</h2>
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 36 }}>
          <tbody>
            {V5.map(([name, about, len]) => (
              <tr key={name}>
                <td style={cell}>
                  <b>{name}</b>
                  <div style={{ color: "#a1a1aa", fontSize: 13, marginTop: 2 }}>{about}</div>
                </td>
                <td style={cell}>
                  <audio controls preload="none" src={`/sounds/v5/${name}.mp3`} />
                  <div style={{ color: "#71717a", fontSize: 12 }}>{len}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2 style={{ fontSize: 18, margin: "0 0 8px" }}>The intro: v1 and v2</h2>
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 36 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#a1a1aa", fontSize: 13 }}>
              <th style={cell}>Sound</th>
              <th style={cell}>v1</th>
              <th style={cell}>v2</th>
            </tr>
          </thead>
          <tbody>
            {SOUND_NAMES.map((name) => (
              <tr key={name}>
                <td style={cell}>
                  <b>{name}</b>
                  <div style={{ color: "#a1a1aa", fontSize: 13, marginTop: 2 }}>{ABOUT[name]}</div>
                </td>
                <td style={cell}>
                  <audio controls preload="none" src={`/sounds/v1/${name}.mp3`} />
                  <div style={{ color: "#71717a", fontSize: 12 }}>{length(manifestV1, name)}</div>
                </td>
                <td style={cell}>
                  <audio controls preload="none" src={`/sounds/${name}.mp3`} />
                  <div style={{ color: "#71717a", fontSize: 12 }}>{length(manifestV2, name)}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2 style={{ fontSize: 18, margin: "0 0 8px" }}>The page: v2</h2>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            {PAGE_SOUNDS.map((name) => (
              <tr key={name}>
                <td style={cell}>
                  <b>{name}</b>
                  <div style={{ color: "#a1a1aa", fontSize: 13, marginTop: 2 }}>{ABOUT[name]}</div>
                </td>
                <td style={cell}>
                  <audio controls preload="none" src={`/sounds/${name}.mp3`} />
                  <div style={{ color: "#71717a", fontSize: 12 }}>{length(manifestV2, name)}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2 style={{ fontSize: 18, margin: "36px 0 8px" }}>v3: Lights on (set aside)</h2>
        <LiveBoard />
      </div>
    </main>
  );
}
