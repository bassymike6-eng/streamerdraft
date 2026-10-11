// src/components/launch/Wordmark.tsx
//
// WHAT THIS IS
// STREAMERDRAFT, drawn three times on top of itself in three colours.
// When it comes in, the copies start split apart and slide together.
//   dark look:   red + green + blue, blended with "screen"   -> they add up to white
//   bright look: cyan + magenta + yellow, blended "multiply" -> they add up to black
//
// It's an SVG with a fixed 1000 x 200 box and textLength="1000", so the word is
// always exactly that shape. That's what lets geometry.ts shrink it into the
// top-left corner precisely, whatever the screen size.

import styles from "./LaunchIntro.module.css";

// The three colour copies. Each has its own fixed key, so React can tell them
// apart even if the stylesheet hasn't loaded yet.
const LAYERS = [
  { key: "layer-1", className: styles.wt1 },
  { key: "layer-2", className: styles.wt2 },
  { key: "layer-3", className: styles.wt3 },
];

export function Wordmark() {
  return (
    <div className={styles.wmk} aria-hidden="true">
      <div className={styles.wmkIn}>
        <svg className={styles.wmSvg} viewBox="0 0 1000 200">
          {LAYERS.map((layer) => (
            <text key={layer.key} className={`${styles.wt} ${layer.className}`} x="0" y="158" textLength="1000" lengthAdjust="spacingAndGlyphs">
              STREAMERDRAFT
            </text>
          ))}
        </svg>
      </div>
    </div>
  );
}