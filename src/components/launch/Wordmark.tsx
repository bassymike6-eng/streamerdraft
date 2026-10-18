// src/components/launch/Wordmark.tsx
//
// WHAT THIS IS
// The title, drawn three times on top of itself: two "ghost" copies underneath
// (white and dark red) and the red one on top. When it comes in, the copies
// start split apart, slide together, then the ghosts fade (see the CSS).
//
// It's in the brand font (src/lib/brand-font.ts). The SVG's box is the word's
// real measured shape in that font (WordBox), so any font fits without being
// squashed or stretched. geometry.ts uses the same shape to size the title
// and shrink it into the top-left corner as the logo.

import type { WordBox } from "@/lib/brand-font";
import styles from "./LaunchIntro.module.css";

// The three copies. Each has its own fixed key, so React can tell them
// apart even if the stylesheet hasn't loaded yet.
const LAYERS = [
  { key: "layer-1", className: styles.wt1 },
  { key: "layer-2", className: styles.wt2 },
  { key: "layer-3", className: styles.wt3 },
];

export function Wordmark({ text, box }: { text: string; box: WordBox }) {
  return (
    <div className={styles.wmk} aria-hidden="true">
      <div className={styles.wmkIn}>
        <svg className={styles.wmSvg} viewBox={`0 0 ${box.width} ${box.height}`}>
          {LAYERS.map((layer) => (
            <text key={layer.key} className={`${styles.wt} ${layer.className}`} x={box.x} y={box.y}>
              {text}
            </text>
          ))}
        </svg>
      </div>
    </div>
  );
}

// The logo the page keeps once the intro's over: just the red copy, drawn the
// same way and the same size as the docked title. The page (SitePage.tsx) puts
// it in its header, exactly where the title docked, and the intro's own title
// hides at that moment. So the logo is part of the page and scrolls with it,
// instead of floating on its own layer over the top.
export function LogoMark({ text, box }: { text: string; box: WordBox }) {
  return (
    <svg className={styles.wmSvg} viewBox={`0 0 ${box.width} ${box.height}`} aria-hidden="true">
      <text className={`${styles.wt} ${styles.wt3}`} x={box.x} y={box.y}>
        {text}
      </text>
    </svg>
  );
}
