// src/components/page/Gear.tsx
//
// WHAT THIS IS
// The streaming gear round the home page: a mic on a boom arm, a mirrorless
// camera, a stream controller and a pair of headphones. Our own designs (no
// real brands or logos), modelled and lit in 3D like product shots, so they
// look as real as the rest of the page feels. Each one has a red light.
//
// THE STORY: "Nobody's watching. Yet."
// The setup's there, switched off, like a streamer's room before they go
// live. While the page loads, the gear is grey shapes, like the page's other
// loading boxes. Then each piece pops in, one after another, with a springy
// bounce (the way Duolingo's power-ups land at the end of a lesson), and as
// each one lands its red light comes on: the camera's tally light, the mic's
// ring, the controller's LIVE key, the headphones' light. The room goes live.
//
// HOW EACH PIECE IS MADE
// One picture of it with the light off (see-through round the edges), and a
// small picture of just the bit round its light, lit, laid exactly on top:
// that one fades in when the light comes on. The pictures, their sizes and
// where the light is: gearArt.ts (made by the render script, with the files
// in public/gear). Each comes in a few widths and the browser picks the one
// that's sharp on that screen (so a phone doesn't download a monitor's).
//
// IT NEVER GETS IN THE WAY
// It sits BEHIND everything (the page's words and buttons are always on top),
// takes up no space (the page fits the screen exactly as before), and you
// can't tap it. It frames the words: on phones the mic and the camera lean in
// from the edges by "Yet." and the headphones sit on the footer (the
// controller stays off there, and isn't downloaded). On computers the
// controller sits on the footer, and the headphones hang on the red "Join the
// draft" button and react to it (HangingPhones.tsx). Screen readers skip it
// (it's decoration).
//
// WHERE EACH PIECE GOES, AND WHEN: Gear.module.css. Their sound: the page
// scene in scripts/render-intro.py.

import type { CSSProperties } from "react";
import g from "./Gear.module.css";
import { GEAR_ART, type GearArt } from "./gearArt";

// which piece, in the order they pop in
const order = (i: number) => ({ "--i": i }) as CSSProperties;

// How wide each piece shows, roughly, on phones and on computers (CSS px),
// so the browser can pick the right picture (it allows for sharp screens
// itself). The exact sizes are in Gear.module.css.
const SHOWN = {
  mic: { phone: 110, wide: 150 },
  camera: { phone: 140, wide: 210 },
  deck: { phone: 0, wide: 240 },
  phones: { phone: 90, wide: 200 },
} as const;
const WIDE = "(min-width: 1000px), ((min-width: 760px) and (orientation: landscape))";

export function Gear() {
  return (
    <div className={g.layer} aria-hidden="true">
      <div className={`${g.item} ${g.mic}`} style={order(0)} data-gear="0"><Piece name="mic" /></div>
      <div className={`${g.item} ${g.camera}`} style={order(1)} data-gear="1"><Piece name="camera" /></div>
      <div className={`${g.item} ${g.deck}`} style={order(2)} data-gear="2"><Piece name="deck" /></div>
      <div className={`${g.item} ${g.phones}`} style={order(3)} data-gear="3"><Piece name="phones" /></div>
    </div>
  );
}

const srcSet = (list: GearArt["src"]) => list.map(([src, w]) => `${src} ${w}w`).join(", ");
// "sizes" for a picture that's `share` of the piece's width
function sizes(name: keyof typeof SHOWN, share = 1) {
  const { phone, wide } = SHOWN[name];
  const px = (n: number) => `${Math.max(1, Math.round(n * share))}px`;
  // (a piece that's off on phones: the smallest picture, which it never downloads anyway)
  return `${WIDE} ${px(wide)}, ${px(phone || 1)}`;
}

function Piece({ name }: { name: keyof typeof SHOWN }) {
  const art = GEAR_ART[name];
  const { lit, led } = art;
  const at = (x: number, y: number) => ({ left: `${x}%`, top: `${y}%` });
  return (
    <span className={g.art} style={{ aspectRatio: `${art.w} / ${art.h}` }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className={g.shot}
        src={art.src[0][0]}
        srcSet={srcSet(art.src)}
        sizes={sizes(name)}
        width={art.w}
        height={art.h}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
      />
      {/* the light, on (just the bit round it) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className={g.lit}
        src={lit.src[0][0]}
        srcSet={srcSet(lit.src)}
        sizes={sizes(name, lit.w / 100)}
        style={{ ...at(lit.x, lit.y), width: `${lit.w}%`, height: `${lit.h}%` }}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
      />
      {/* and its soft red glow */}
      <i className={g.glow} style={at(led.x, led.y)} />
    </span>
  );
}
