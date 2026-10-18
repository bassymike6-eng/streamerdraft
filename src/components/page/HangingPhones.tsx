// src/components/page/HangingPhones.tsx
//
// WHAT THIS IS
// On computers, the headphones (part of the streaming gear, Gear.tsx) hang on
// the red "Join the draft" button, the way you'd hang them over the top of a
// monitor: the headband over the button's top edge near its right end, one
// cup hanging in front, the other behind. They pop in with the rest of the
// gear, and their red light comes on.
//
// HOW IT SITS ON THE BUTTON
// Two pictures of the same render, lined up exactly: the whole headphones
// BEHIND the button, and just their front half IN FRONT of it, so the button
// passes through the headband (gearArt.ts, from the 3D render). They're
// pinned to the point where the headband rests on the button's top edge.
//
// IT REACTS TO THE BUTTON
//   pointer over it   a gentle sway
//   pressed           a jolt...
//   the pop-up opens  ...and they go: the button grows into the pop-up
//                     (Sheet.tsx hides the button while it's open)
//   the pop-up closes they drop back onto the button and swing, settling
// (No movement for people who've asked for less: Gear.module.css.)
//
// Phones keep the headphones on the footer instead (Gear.tsx): no room here.

import { useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import g from "./Gear.module.css";
import { GEAR_ART } from "./gearArt";

type Move = "rest" | "sway" | "jolt" | "away" | "back";
const art = GEAR_ART.hang;
const srcSet = (list: [string, number][]) => list.map(([src, w]) => `${src} ${w}w`).join(", ");
const SIZES = "(min-width: 1000px), ((min-width: 760px) and (orientation: landscape)) 110px, 1px";
// how wide they are, in button-heights, and how far the front strap reaches
// left of where the headband rests (a share of that width: from the render)
const SIZE = 1.6;
const STRAP = 0.23;

export function HangingPhones({ button }: { button: RefObject<HTMLButtonElement | null> }) {
  const [at, setAt] = useState<{ x: number; y: number; w: number } | null>(null);
  const [move, setMove] = useState<Move>("rest");
  const back = useRef<HTMLSpanElement>(null);
  const front = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const btn = button.current;
    if (!btn) return;
    // where the headband rests: on the top edge near the right end, just past
    // the words (so the strap never covers them), and never right round the
    // end. Past where the end starts to round off, it sits a touch lower,
    // on the curve. They're sized to the button.
    const place = () => {
      const h = btn.offsetHeight;
      const r = h / 2;
      const w = h * SIZE;
      const right = btn.offsetLeft + btn.offsetWidth;
      const label = btn.querySelector(":scope > span > span");
      const words = label ? label.getBoundingClientRect().right - btn.getBoundingClientRect().left + btn.offsetLeft : 0;
      const x = Math.min(Math.max(right - h * 0.42, words + 10 + w * STRAP), right - h * 0.2);
      const round = Math.max(0, x - (right - r));
      setAt({ x, y: btn.offsetTop + r - Math.sqrt(r * r - round * round), w });
    };
    place();
    document.fonts?.ready.then(place);
    const sizes = new ResizeObserver(place);
    sizes.observe(btn);
    if (btn.parentElement) sizes.observe(btn.parentElement);
    // start a movement (from the top, even if it's the same one again). A
    // hover doesn't cut into a bigger one (the button reappears under the
    // pointer as the pop-up closes, mid-swing)
    let busy = 0;
    const go = (m: Move) => {
      const now = performance.now();
      if (m === "sway" && now < busy) return;
      busy = now + (m === "back" ? 1600 : m === "jolt" ? 500 : 0);
      setMove(m);
      for (const el of [back.current, front.current]) {
        if (!el) continue;
        el.style.animation = "none";
        void el.offsetWidth; // (makes the browser notice, so it starts again)
        el.style.animation = "";
      }
    };
    // the pop-up hides the button while it's open, and shows it again once it
    // has shrunk back into it
    let hidden = btn.style.visibility === "hidden";
    const watch = new MutationObserver(() => {
      const now = btn.style.visibility === "hidden";
      if (now !== hidden) {
        hidden = now;
        go(now ? "away" : "back");
      }
    });
    watch.observe(btn, { attributes: true, attributeFilter: ["style"] });
    const press = () => go("jolt");
    const over = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && !hidden) go("sway");
    };
    btn.addEventListener("pointerdown", press);
    btn.addEventListener("pointerenter", over);
    return () => {
      sizes.disconnect();
      watch.disconnect();
      btn.removeEventListener("pointerdown", press);
      btn.removeEventListener("pointerenter", over);
    };
  }, [button]);

  if (!art.front || !art.hang) return null;
  const style = {
    left: at ? `${at.x}px` : undefined,
    top: at ? `${at.y}px` : undefined,
    "--hw": at ? `${at.w}px` : undefined,
    "--i": 3,
    "--hx": `${-art.hang.x}%`,
    "--hy": `${-art.hang.y}%`,
  } as CSSProperties;
  const pic = (list: [string, number][], className: string, extra?: CSSProperties) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img className={className} src={list[0][0]} srcSet={srcSet(list)} sizes={SIZES} alt="" loading="lazy" decoding="async" draggable={false} style={extra} />
  );
  const { lit, led } = art;
  return (
    <>
      {/* the whole headphones, behind the button */}
      <span ref={back} className={`${g.hang} ${g.hangBack}`} style={style} data-move={move} aria-hidden="true" hidden={!at}>
        <span className={g.hangPop}>
          <span className={g.art} style={{ aspectRatio: `${art.w} / ${art.h}` }}>{pic(art.src, g.shot)}</span>
        </span>
      </span>
      {/* their front half, in front of it (with the light) */}
      <span ref={front} className={`${g.hang} ${g.hangFront}`} style={style} data-move={move} aria-hidden="true" hidden={!at}>
        <span className={g.hangPop}>
          <span className={g.art} style={{ aspectRatio: `${art.w} / ${art.h}` }}>
            {pic(art.front, g.shot)}
            {pic(lit.src, g.lit, { left: `${lit.x}%`, top: `${lit.y}%`, width: `${lit.w}%`, height: `${lit.h}%` })}
            <i className={g.glow} style={{ left: `${led.x}%`, top: `${led.y}%` }} />
          </span>
        </span>
      </span>
    </>
  );
}
