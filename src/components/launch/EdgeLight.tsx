// src/components/launch/EdgeLight.tsx
//
// WHAT THIS IS
// The red light at the start of the intro:
//   idle   runs round the play button
//   tap    grows out to the screen's edge, hugging its rounded corners,
//          then goes exactly once round the edge, back to where it arrived
//   fill   that lap is done: the outline completes all the way round
//   home   fades out as the home screen comes in (CSS), and stays gone
//
// WHY THIS PART IS JAVASCRIPT, NOT CSS LIKE THE REST
// A spinning CSS gradient turns at a steady ANGLE, so on a tall phone the light
// crawls along the long sides and whips round the corners. Here the light's
// position is measured along the real outline and moved a set distance every
// frame, so it keeps the same speed and length all the way round. It's drawn
// on a canvas as one smooth line (see light.ts).
//
// TO TUNE IT: speeds, lengths and timings are in LED in timeline.ts.

import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "./detect";
import { lightSpot } from "../sound/lightSpot";
import { drawLight, makeShape, parseColor, perimeter, pointAlong, prepareCanvas } from "./light";
import { LED, type Phase } from "./timeline";
import styles from "./LaunchIntro.module.css";

const BUTTON = 88; // the play button's size (matches .go in the CSS)
const INSET = 1.5; // keeps the line just inside the screen edge so none of it is cut off
const WIDTH = [1.75, 2]; // line thickness: round the button, round the screen

// The light is only drawn in these phases. After them it has faded out for good.
const LIVE: Phase[] = ["idle", "tap", "fill", "home"];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
// Slow start, slow finish: eases out of the button and settles into the edge.
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

export function EdgeLight({ phase, edgeRadius }: { phase: Phase; edgeRadius: number }) {
  const box = useRef<HTMLCanvasElement>(null);

  // The animation loop reads these, so it never has to restart when they change.
  const phaseRef = useRef(phase);
  const radiusRef = useRef(edgeRadius);
  const tapAt = useRef<number | null>(null);

  useEffect(() => {
    phaseRef.current = phase;
    if (phase === "tap") tapAt.current = performance.now();
  }, [phase]);

  useEffect(() => {
    radiusRef.current = edgeRadius;
  }, [edgeRadius]);

  useEffect(() => {
    const canvas = box.current;
    // Reduced motion: the intro jumps straight to the page, so there's no light to draw.
    if (!canvas || prefersReducedMotion()) return;
    // The reds come from the CSS (--red, --red-hot), so there's one place to change them.
    const css = getComputedStyle(canvas);
    const color = parseColor(css.getPropertyValue("--red"));
    const hot = parseColor(css.getPropertyValue("--red-hot"));

    let head = 0; // where the front of the light is, as a share of the way round (0 = top middle)
    let arrived: number | null = null; // where it was when it reached the screen edge
    let last = performance.now();
    let frame = 0;

    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); // capped, so a hidden tab doesn't make it jump
      last = now;

      // 1. Where we are: morph 0 = round the button, 1 = round the screen edge
      let morph = 1;
      let closed = 0; // the full outline completing after the lap (0 to 1)
      if (phaseRef.current === "idle") {
        morph = 0;
        head += dt / LED.idleLap;
      } else if (tapAt.current !== null) {
        const t = (now - tapAt.current) / 1000; // seconds since the tap
        if (t < LED.grow) {
          // Growing out. Speed is in laps per second, so it feels the same on the button and the edge.
          morph = easeInOut(t / LED.grow);
          head += dt / lerp(LED.idleLap, LED.edgeLap, morph);
        } else {
          // On the edge: exactly one lap, ending where it arrived. Timed, not counted,
          // so it finishes right when timeline.ts starts the "fill" phase.
          arrived ??= head;
          head = arrived + clamp01((t - LED.grow) / LED.edgeLap);
          closed = easeOut(clamp01((t - LED.grow - LED.edgeLap) / LED.close));
        }
      }

      // 2. The outline: the button's circle stretching into the screen's rounded rectangle
      const drawing = prepareCanvas(canvas);
      if (!drawing) return;
      const { ctx, w: W, h: H } = drawing;
      const shape = makeShape(
        W / 2,
        H / 2,
        lerp(BUTTON, W - INSET * 2, morph),
        lerp(BUTTON, H - INSET * 2, morph),
        lerp(BUTTON / 2, radiusRef.current - INSET, morph),
      );

      // 3. The light itself, plus the full outline once the lap is done
      // where the front of the light is, for its sound to follow (v3: sound/engine.ts)
      const [lx, ly] = pointAlong(shape, head);
      lightSpot.x = lx / W;
      lightSpot.y = ly / H;
      lightSpot.at = now;

      drawLight(ctx, shape, {
        head,
        length: lerp(LED.buttonLength, LED.edgeLength, morph) * perimeter(shape),
        width: lerp(WIDTH[0], WIDTH[1], morph),
        color,
        hot,
        ring: closed,
      });
    };

    const loop = (now: number) => {
      if (!LIVE.includes(phaseRef.current)) return; // faded out for good: stop the loop
      frame = requestAnimationFrame(loop); // book the next frame first, so an error below can't stop the loop
      try {
        draw(now);
      } catch {
        // skip this frame
      }
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <canvas ref={box} className={styles.halo} aria-hidden="true" />
  );
}
