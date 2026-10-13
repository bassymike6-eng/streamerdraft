// src/components/launch/SkeletonPage.tsx
//
// WHAT THIS IS
// The page while it waits for content: loading placeholders (like Indeed's and
// PayPal's apps). Two effects, both in step across the whole page:
//   - a thin red light running round each box's border (BoxLight, drawn with
//     light.ts). Every box's light is at the same point of its lap at the same moment.
//   - the grey placeholders pulse together (the "pulse" animation in the CSS).
//
// In F2 the real content replaces these slots one by one.
// The logo in the top left isn't here: it's the title, docked (see Wordmark.tsx).
//
// --i only staggers the boxes fading in.

import { useEffect, useRef, type CSSProperties } from "react";
import { prefersReducedMotion } from "./detect";
import { drawLight, makeShape, parseColor, perimeter, prepareCanvas, type Shape } from "./light";
import { LED } from "./timeline";
import styles from "./LaunchIntro.module.css";

const i = (n: number) => ({ "--i": n }) as CSSProperties;
const s = styles;

// The light round one box (a canvas the size of the box). SkeletonPage draws
// all of them together.
function BoxLight() {
  return <canvas className={s.boxLight} data-box-light="" aria-hidden="true" />;
}

const BOX_LINE = 1.5; // line thickness round the boxes, in px

// A box's corner radius in px (the CSS can give it as px or as a %).
function radiusOf(box: HTMLElement, w: number, h: number) {
  const value = getComputedStyle(box).borderTopLeftRadius;
  const n = parseFloat(value) || 0;
  return value.endsWith("%") ? (n / 100) * Math.min(w, h) : n;
}

function ListRow() {
  return (
    <div className={s.lrow}>
      <span className={`${s.skc} ${s.shim}`} />
      <span className={s.lcol}>
        <span className={`${s.skl} ${s.shim} ${s.w45}`} />
        <span className={`${s.skl} ${s.shim} ${s.w80}`} />
      </span>
    </div>
  );
}

function HeroColumn() {
  return (
    <span className={s.hcol}>
      <span className={`${s.skc} ${s.shim}`} />
      <span className={`${s.skl} ${s.shim} ${s.w56px}`} />
    </span>
  );
}

function MiniCard({ n }: { n: number }) {
  return (
    <div className={`${s.sk} ${s.skIn} ${s.card} ${s.mini}`} style={i(n)}>
      <BoxLight />
      <span className={`${s.sq} ${s.shim}`} />
      <span className={`${s.skl} ${s.shim} ${s.w60}`} />
      <span className={`${s.skl} ${s.shim} ${s.w30}`} />
    </div>
  );
}

// running: true once the page is on screen (the "dock" phase onwards).
export function SkeletonPage({ running }: { running: boolean }) {
  const page = useRef<HTMLDivElement>(null);

  // Moves every box's light. One clock for all of them, so they stay in step.
  useEffect(() => {
    if (!running || !page.current || prefersReducedMotion()) return;
    const canvases = [...page.current.querySelectorAll<HTMLCanvasElement>("canvas[data-box-light]")];
    const boxes = canvases.map((canvas) => ({ canvas, box: canvas.parentElement as HTMLElement, size: "", shape: null as Shape | null }));
    const css = getComputedStyle(page.current);
    const color = parseColor(css.getPropertyValue("--red"));
    const hot = parseColor(css.getPropertyValue("--red-hot"));
    const start = performance.now();
    let frame = 0;

    const loop = (now: number) => {
      frame = requestAnimationFrame(loop); // book the next frame first, so nothing below can stop the loop
      const head = ((now - start) / 1000 / LED.boxLap) % 1; // the same for every box: they move in step
      for (const b of boxes) {
        try {
          const drawing = prepareCanvas(b.canvas);
          if (!drawing || !drawing.w || !drawing.h) continue; // hidden (e.g. the third row on a phone)
          const { ctx, w, h } = drawing;
          const size = `${w}x${h}`;
          if (size !== b.size) {
            // Only work out the outline again when the box changes size.
            const inset = BOX_LINE / 2;
            b.shape = makeShape(w / 2, h / 2, w - BOX_LINE, h - BOX_LINE, radiusOf(b.box, w, h) - inset);
            b.size = size;
          }
          const shape = b.shape!;
          // A short light with a quick fade, so it reads as a moving light, not a border.
          drawLight(ctx, shape, { head, length: LED.boxLength * perimeter(shape), width: BOX_LINE, color, hot, fade: 2.2 });
        } catch {
          // one box failing to draw shouldn't freeze the others
        }
      }
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [running]);

  return (
    <div ref={page} className={`${s.layer} ${s.site}`} aria-busy="true" aria-label="Loading">
      <header className={s.skHead}>
        <span className={`${s.sk} ${s.skIn} ${s.shim} ${s.c40}`} style={i(1)}><BoxLight /></span>
        <span className={`${s.sk} ${s.skIn} ${s.shim} ${s.c40}`} style={i(2)}><BoxLight /></span>
      </header>

      <div className={s.skWrap}>
        <div className={s.skTabs}>
          <span className={`${s.sk} ${s.skIn} ${s.shim} ${s.pill} ${s.pillOn}`} style={i(3)}><BoxLight /></span>
          <span className={`${s.sk} ${s.skIn} ${s.shim} ${s.pill}`} style={i(4)}><BoxLight /></span>
          <span className={`${s.sk} ${s.skIn} ${s.shim} ${s.pill}`} style={i(5)}><BoxLight /></span>
          <span className={`${s.sk} ${s.skIn} ${s.shim} ${s.pill}`} style={i(6)}><BoxLight /></span>
        </div>

        <div className={s.skGrid}>
          <div className={`${s.sk} ${s.skIn} ${s.card} ${s.hero}`} style={i(7)}>
            <BoxLight />
            <div className={s.heroTop}>
              <span className={`${s.skl} ${s.shim} ${s.big}`} />
              <span className={`${s.skl} ${s.shim} ${s.w60}`} />
              <span className={`${s.skl} ${s.shim} ${s.w30}`} />
            </div>
            <div className={s.heroRow}>
              <HeroColumn />
              <HeroColumn />
              <HeroColumn />
            </div>
          </div>

          <div className={`${s.sk} ${s.skIn} ${s.card} ${s.list}`} style={i(8)}>
            <BoxLight />
            <ListRow />
            <ListRow />
            <ListRow />
          </div>
        </div>

        {/* Only shown on wider screens */}
        <div className={s.skRow3}>
          <MiniCard n={9} />
          <MiniCard n={10} />
          <MiniCard n={11} />
        </div>
      </div>
    </div>
  );
}
