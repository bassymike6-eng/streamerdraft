// src/components/page/useBoxLights.ts
//
// WHAT THIS IS
// The thin lights that run round every capsule on the page (Join the draft,
// Join as a scout, the voice note, Road to 300, How it works). Every
// <canvas data-box-light> inside `page` gets one. They come on while the page
// is loading and STAY on once it's loaded: that's what keeps the page alive.
//
// They all move in step: one clock for every light on the page AND in any
// pop-up (it's the browser's own clock), so each one is at the same point of
// its lap at the same moment, and nothing jumps when content arrives.
//
// WHAT EACH CANVAS CAN ASK FOR (data attributes on the <canvas>)
//   data-color="white"  once its box has filled in, the light turns white
//                       (Join the draft: a red light on a red button wouldn't show).
//                       It turns at the same moment the box fills in: data-at,
//                       in seconds after the content arrives (revealAt in timeline.ts).
//   --light-tip (CSS)   the colour at the very front of the light: in the dark
//                       look white (a red light with a white-hot tip), in the
//                       bright look a brighter red (Page.module.css). Each box
//                       can set its own (the voice note does: it's the
//                       opposite colour to the page).
//   data-progress="0.4" a progress line instead of a running light: it fills
//                       clockwise from the top middle, over a faint full outline
//                       (the voice note while it plays: VoiceNote.tsx sets this
//                       every frame). Remove the attribute to go back to running.
//
// The drawing itself is shared with the intro's lights: src/components/launch/light.ts.

import { useEffect, useRef, type RefObject } from "react";
import { prefersReducedMotion } from "@/components/launch/detect";
import { drawLight, makeShape, parseColor, perimeter, prepareCanvas, type Rgb, type Shape } from "@/components/launch/light";
import { LED } from "@/components/launch/timeline";
import type { PageStage } from "./SitePage";

const LINE = 1.5; // line thickness, in px
const BLEND = 0.35; // seconds a light takes to change colour
const WHITE: Rgb = [255, 255, 255];

// A box's corner radius in px (the CSS can give it as px or as a %).
function radiusOf(box: HTMLElement, w: number, h: number) {
  const value = getComputedStyle(box).borderTopLeftRadius;
  const n = parseFloat(value) || 0;
  return value.endsWith("%") ? (n / 100) * Math.min(w, h) : n;
}

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t)) as Rgb;

type Box = { canvas: HTMLCanvasElement; box: HTMLElement; size: string; radius: string; shape: Shape | null; tip: Rgb | null };

export function useBoxLights(page: RefObject<HTMLElement | null>, stage: PageStage) {
  // When the real content arrived (for each light's colour change)
  const contentStart = useRef<number | null>(null);

  useEffect(() => {
    if (stage === "hidden") contentStart.current = null; // (a pop-up that closes starts again next time)
    if (stage === "hidden" || !page.current) return;
    const reduced = prefersReducedMotion();
    if (stage === "content") contentStart.current ??= performance.now();

    // Only this area's own lights: the page leaves its pop-ups' lights to them
    // (a pop-up is a <dialog> inside the page), and a pop-up draws just its own.
    const area = page.current;
    const home = area.closest("dialog");
    const findBoxes = (was: Box[] = []): Box[] =>
      [...area.querySelectorAll<HTMLCanvasElement>("canvas[data-box-light]")]
        .filter((canvas) => canvas.closest("dialog") === home)
        // (a box we already had keeps its worked-out outline)
        .map((canvas) => was.find((b) => b.canvas === canvas) ?? { canvas, box: canvas.parentElement as HTMLElement, size: "", radius: "", shape: null, tip: null });
    let boxes = findBoxes();
    // Boxes can come and go while it's showing (e.g. "Join as a scout" leaves
    // once they've signed up, and comes back if they start again): look again
    // whenever something's added or taken away
    const watch = new MutationObserver(() => {
      boxes = findBoxes(boxes);
    });
    watch.observe(area, { childList: true, subtree: true });
    const css = getComputedStyle(area);
    const red = parseColor(css.getPropertyValue("--red"));
    const hot = parseColor(css.getPropertyValue("--red-hot"));
    // each box's tip colour (--light-tip), looked at again now and then in case the look changes
    const tipOf = (b: Box): Rgb => {
      const value = getComputedStyle(b.box).getPropertyValue("--light-tip").trim();
      return value ? parseColor(value) : hot;
    };
    let frame = 0;
    let frames = 0;

    const loop = (now: number) => {
      frame = requestAnimationFrame(loop); // book the next frame first, so nothing below can stop the loop
      const head = (now / 1000 / LED.boxLap) % 1; // the browser's clock: the same for every light, everywhere
      const sinceContent = contentStart.current === null ? -1 : (now - contentStart.current) / 1000;
      const freshTips = frames++ % 90 === 0;

      for (const b of boxes) {
        try {
          const progressAttr = b.canvas.dataset.progress;
          // Reduced motion: no running lights, but a progress line still shows progress
          if (reduced && progressAttr === undefined) continue;
          const drawing = prepareCanvas(b.canvas);
          if (!drawing || !drawing.w || !drawing.h) continue; // hidden (e.g. display: none)
          const { ctx, w, h } = drawing;

          // Only work out the outline again when the box changes size (the voice
          // note grows while it plays, so this runs every frame of that, which is fine)
          const size = `${w}x${h}`;
          if (size !== b.size || !b.shape) {
            b.shape = makeShape(w / 2, h / 2, w - LINE, h - LINE, radiusOf(b.box, w, h) - LINE / 2);
            b.size = size;
          }
          const P = perimeter(b.shape);

          // Its colour: red, or (once its box has filled in) the colour it asked for
          if (freshTips || !b.tip) b.tip = tipOf(b);
          let color = red;
          let tip = b.tip;
          if (b.canvas.dataset.color === "white" && sinceContent >= 0) {
            const at = Number(b.canvas.dataset.at ?? 0);
            const t = Math.min(1, Math.max(0, (sinceContent - at) / BLEND));
            color = mix(red, WHITE, t);
            tip = mix(hot, WHITE, t);
          }

          if (progressAttr !== undefined) {
            // Progress: a solid line from the top middle, over a faint full outline
            const p = Math.min(1, Math.max(0, Number(progressAttr) || 0));
            drawLight(ctx, b.shape, { head: p, length: p * P, width: LINE + 0.5, color, hot: tip, ring: 0.22, fade: 0.0001 });
          } else {
            drawLight(ctx, b.shape, { head, length: LED.boxLength * P, width: LINE, color, hot: tip, fade: 2.2 });
          }
        } catch {
          // one box failing to draw shouldn't freeze the others
        }
      }
    };
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      watch.disconnect();
    };
  }, [page, stage]);
}
