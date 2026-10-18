// src/components/sound/place.ts
//
// WHERE A SOUND COMES FROM: shared by every version of the site's sound.
//   panFor(element)   something on the page -> how far left / right its sound
//                     sits (a pop-up opens from the side you tapped, each part
//                     of the page pops from where it is)
//   followLight(...)  moves a playing sound with the intro's red light as it
//                     runs round the screen (lightSpot.ts), left to right, and
//                     brighter at the top of the screen, darker at the bottom
// Kept gentle: never hard into one ear, and gentler still on narrow screens,
// where left and right are only a few centimetres apart.

import { lightSpot } from "./lightSpot";

// Moves a sound with the intro's light, every frame it's playing
export function followLight(ctx: AudioContext, from: number, seconds: number, tone: BiquadFilterNode | null, panner: StereoPannerNode | null) {
  const end = from + seconds;
  const step = () => {
    const now = ctx.currentTime;
    if (now > end) return;
    if (now >= from - 0.05) {
      panner?.pan.setTargetAtTime((lightSpot.x * 2 - 1) * 0.85, now, 0.03);
      // brighter at the top of the screen, darker at the bottom
      tone?.frequency.setTargetAtTime(2200 + 9000 * (1 - lightSpot.y) ** 1.3, now, 0.04);
    }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// Where on the screen something is, as a left / right position for its sound.
// Kept gentle (most of the way, never hard into one ear), and gentler still
// on narrow screens, where left and right are only a few centimetres apart.
export function panFor(element?: Element | null): number | undefined {
  if (!element || typeof window === "undefined") return undefined;
  const r = element.getBoundingClientRect();
  if (!r.width && !r.height) return undefined;
  const x = (r.left + r.width / 2) / Math.max(1, window.innerWidth);
  const width = Math.min(1, window.innerWidth / 1000);
  return Math.max(-1, Math.min(1, (x * 2 - 1) * (0.35 + 0.4 * width)));
}
