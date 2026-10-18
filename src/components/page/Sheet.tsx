// src/components/page/Sheet.tsx
//
// WHAT THIS IS
// The pop-up every "see more" on the page opens into (and the sign-up next):
//   phone     a sheet from the bottom (drag it down to close)
//   computer  a card in the middle of the screen
//
// IT GROWS OUT OF WHAT YOU TAPPED (pass `origin`)
// Like an App Store card: the thing you tap doesn't open a separate pop-up,
// it grows into it. The pop-up's frame starts exactly over the tapped box
// (same spot, size and corners), then stretches out to its full size, while
// its contents (already laid out at full size) are uncovered as it grows.
// Closing runs it backwards, shrinking it back into the box. (If the box has
// changed while it was open, e.g. "Apply to scout" turned into the one
// "Application pending" button, it shrinks into whatever `origin` is NOW.)
// (The technique is called FLIP: First, Last, Invert, Play. Measure where it
// starts and ends, then animate between the two.)
//
// IT CHANGES SIZE SMOOTHLY
// When what's inside changes while it's open (the sign-up form turning into
// "Check your email", a mistake appearing under a box), the pop-up glides to
// its new height instead of jumping.
//
// IT LOADS IN LIKE THE PAGE
// As it opens, its contents show as grey loading shapes with the red light
// running round its edge (the same light as the page's boxes), then fill in
// one after another. Mark each part with `slot.text` (words) or `slot.box`
// (a box), plus `--n` for its turn (sheetOrder(n)). `ready={false}` holds it on
// the loading shapes until whatever it's waiting for (e.g. a number) arrives.
//
// HOW IT WORKS UNDERNEATH
// It's the browser's own <dialog>, opened with showModal(), which gives us:
//   - the browser's "top layer": above EVERYTHING (even the floating logo)
//   - the page behind can't be clicked or tabbed into while it's open
//   - Esc closes it, and focus goes back to whatever opened it
// It's "controlled": the parent says open or not, and onClose asks the parent
// to close it.

import { useEffect, useId, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode, type RefObject } from "react";
import { prefersReducedMotion } from "@/components/launch/detect";
import type { PageStage } from "./SitePage";
import { uiSound } from "./uiSound";
import { useBoxLights } from "./useBoxLights";
import s from "./Sheet.module.css";

const GROW_MS = 560; // the open: tapped box -> full pop-up
const SHRINK_MS = 420; // the close: back into the box
const SLIDE_MS = 380; // closing without a box to go back to (matches Sheet.module.css)
const LOAD_MS = 260; // how long the loading shapes show once it's open (if nothing else is loading)
const RESIZE_MS = 420; // when what's inside changes size (e.g. the form becomes "Check your email")
const DRAG_TO_CLOSE = 110; // px: drag the sheet down this far and let go to close it
const EASE_OPEN = "cubic-bezier(.32,.72,0,1)"; // iOS's sheet curve: quick, then a long soft landing
const EASE_CLOSE = "cubic-bezier(.4,0,.2,1)";

// For the parts inside a sheet: what kind of loading shape, and their turn to fill in
export const slot = { text: `${s.slot} ${s.slotText}`, box: `${s.slot} ${s.slotBox}` };
export const sheetOrder = (n: number) => ({ "--n": n }) as CSSProperties;

type Rect = { top: number; left: number; width: number; height: number };
const rectOf = (el: Element): Rect => {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
};
// Hides the tapped box while it's "become" the pop-up (it's a page element,
// not React state, so we set its style directly)
function hideBox(box: HTMLElement | null, hidden: boolean) {
  if (box) box.style.visibility = hidden ? "hidden" : "";
}

// A box's real corner radius, in px. A capsule's CSS says "999px" (round
// ends, however long), but the browser only ever draws half its height. Growing
// from "999px" would make the frame a giant circle on the way, so we use what's drawn.
function radiusOf(el: Element, r: Rect) {
  const css = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
  return `${Math.min(css, r.width / 2, r.height / 2)}px`;
}

const px = (r: Rect) => ({ top: `${r.top}px`, left: `${r.left}px`, width: `${r.width}px`, height: `${r.height}px` });

export function Sheet({ open, onClose, origin, ready = true, title, subtitle, children, footer }: {
  open: boolean;
  onClose: () => void;
  origin?: RefObject<HTMLElement | null>; // the box it grows out of (and shrinks back into)
  ready?: boolean; // false: keep showing the loading shapes
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode; // a bar at the bottom that stays put while the rest scrolls
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const drag = useRef<{ startY: number; startTime: number; dy: number } | null>(null);
  // The box we hid when it opened (it might not be the one it closes into)
  const hiddenBox = useRef<HTMLElement | null>(null);
  const draggedShut = useRef(false);
  // hidden (closed) -> skeleton (opening / loading) -> content
  const [stage, setStage] = useState<PageStage>("hidden");
  const [opened, setOpened] = useState(false); // finished opening
  // When `open` turns true: back to the loading shapes (React's way of resetting
  // state when a prop changes: during render, not in an effect)
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setStage("skeleton");
      setOpened(false);
    }
  }

  useBoxLights(dialog, stage);

  // Fill in once it's open and whatever it's waiting for has arrived
  useEffect(() => {
    if (!opened || !ready) return;
    const t = window.setTimeout(() => setStage("content"), prefersReducedMotion() ? 0 : LOAD_MS);
    return () => window.clearTimeout(t);
  }, [opened, ready]);

  // Open and close the real <dialog> when `open` changes
  useEffect(() => {
    const d = dialog.current;
    const p = panel.current;
    if (!d || !p) return;
    const reduced = prefersReducedMotion();
    const box = origin?.current ?? null;
    let anim: Animation | null = null;
    let timer = 0;

    // Puts everything back to how the stylesheet has it
    const settle = () => {
      d.removeAttribute("data-morph");
      for (const key of ["position", "inset", "margin", "top", "left", "width", "height"]) d.style.removeProperty(key);
      p.style.removeProperty("width");
      p.style.removeProperty("height");
    };

    if (open) {
      d.removeAttribute("data-closing");
      if (d.open) {
        // re-opened while it was still closing: stay open, as it was
        settle();
        if (!reduced) {
          hideBox(box, true);
          hiddenBox.current = box;
        }
        return;
      }
      draggedShut.current = false;
      uiSound("open", box); // (from the side of the screen it grows out of)

      if (!box || reduced) {
        d.showModal();
        timer = window.setTimeout(() => setOpened(true), reduced ? 0 : 300);
        return () => window.clearTimeout(timer);
      }

      // ---- Grow out of the box ----
      d.setAttribute("data-morph", ""); // (switches off the usual slide/pop animation)
      d.showModal();
      const to = rectOf(d); // where the stylesheet puts it: its full size
      const from = rectOf(box);
      const fromRadius = radiusOf(box, from);
      const toRadius = getComputedStyle(d).borderRadius;
      const fromBg = getComputedStyle(box).backgroundColor;
      const toBg = getComputedStyle(d).backgroundColor;
      // the contents stay laid out at full size while the frame grows round them
      p.style.width = `${to.width}px`;
      p.style.height = `${to.height}px`;
      Object.assign(d.style, { position: "fixed", inset: "auto", margin: "0" });
      hideBox(box, true); // the box IS the pop-up now
      hiddenBox.current = box;
      anim = d.animate(
        [
          { ...px(from), borderRadius: fromRadius, backgroundColor: fromBg },
          { ...px(to), borderRadius: toRadius, backgroundColor: toBg },
        ],
        { duration: GROW_MS, easing: EASE_OPEN },
      );
      // the loading shapes fade in as it grows (not all at once on the first frame)
      p.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, delay: 70, easing: "ease-out", fill: "backwards" });
      anim.onfinish = () => {
        settle();
        setOpened(true);
      };
      return () => {
        // closed before it finished growing: drop the half-done grow
        if (anim?.playState !== "finished") {
          anim?.cancel();
          settle();
          setOpened(true);
        }
      };
    }

    // ---- Closing ----
    if (!d.open) return;
    uiSound("close", origin?.current);
    // Shrink into the box only if it's still on the page (it has a size)
    const target = box && box.getClientRects().length > 0 ? box : null;
    const restoreBox = () => {
      hideBox(hiddenBox.current, false);
      hideBox(target, false);
      hiddenBox.current = null;
    };
    const finish = () => {
      d.close();
      d.removeAttribute("data-closing");
      d.style.removeProperty("--drag");
      settle();
      restoreBox();
      setStage("hidden");
      setOpened(false);
    };

    if (!target || reduced || draggedShut.current) {
      // slide away (or, dragged down, carry on down from where it was let go)
      d.setAttribute("data-closing", "");
      timer = window.setTimeout(finish, reduced ? 0 : SLIDE_MS);
      return () => window.clearTimeout(timer);
    }

    // ---- Shrink back into the box ----
    hideBox(target, true); // (a different box from the one it grew out of? hide that one too)
    const from = rectOf(d);
    const to = rectOf(target);
    const fromRadius = getComputedStyle(d).borderRadius;
    const toRadius = radiusOf(target, to);
    const fromBg = getComputedStyle(d).backgroundColor;
    const toBg = getComputedStyle(target).backgroundColor;
    p.style.width = `${from.width}px`;
    p.style.height = `${from.height}px`;
    d.setAttribute("data-morph", "");
    d.setAttribute("data-closing", ""); // (fades the dim backdrop and the contents)
    Object.assign(d.style, { position: "fixed", inset: "auto", margin: "0" });
    anim = d.animate(
      [
        { ...px(from), borderRadius: fromRadius, backgroundColor: fromBg },
        { ...px(to), borderRadius: toRadius, backgroundColor: toBg },
      ],
      { duration: SHRINK_MS, easing: EASE_CLOSE, fill: "forwards" },
    );
    anim.onfinish = () => {
      finish();
      anim?.cancel(); // drop the held last frame now it's closed
    };
    return () => {
      // re-opened before it finished shrinking: drop the half-done shrink
      if (anim?.playState !== "finished") {
        anim?.cancel();
        settle();
      }
    };
    // `origin` is a ref: reading .current inside is enough
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ---- Glide to a new height when what's inside changes ----
  // A ResizeObserver tells us (after the browser's worked out the new layout,
  // before it paints) that the contents changed size. We then animate the frame
  // from its old height to the new one, with the contents held at their new
  // size inside it (the same trick as the grow).
  useEffect(() => {
    const d = dialog.current;
    const p = panel.current;
    if (!open || !opened || !d || !p) return;
    let last = d.getBoundingClientRect().height;
    let glide: Animation | null = null;
    const observer = new ResizeObserver(() => {
      if (glide) return; // (that's us holding the contents still)
      const next = d.getBoundingClientRect().height;
      const from = last;
      last = next;
      const busy = d.hasAttribute("data-morph") || d.hasAttribute("data-closing") || d.hasAttribute("data-dragging");
      if (Math.abs(next - from) < 4 || busy || prefersReducedMotion()) return;
      p.style.height = `${next}px`;
      glide = d.animate([{ height: `${from}px` }, { height: `${next}px` }], { duration: RESIZE_MS, easing: EASE_OPEN });
      glide.onfinish = glide.oncancel = () => {
        glide = null;
        p.style.removeProperty("height");
        last = d.getBoundingClientRect().height;
      };
    });
    observer.observe(p);
    return () => {
      observer.disconnect();
      glide?.cancel();
    };
  }, [open, opened]);

  // ---- Drag down to close (phone) ----
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button")) return; // not when pressing the close button
    drag.current = { startY: e.clientY, startTime: performance.now(), dy: 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
    dialog.current?.setAttribute("data-dragging", "");
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const pulled = e.clientY - d.startY;
    // Down follows your finger; up only gives a little (it's already fully open)
    d.dy = pulled > 0 ? pulled : pulled * 0.15;
    dialog.current?.style.setProperty("--drag", `${d.dy}px`);
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    dialog.current?.removeAttribute("data-dragging");
    const speed = d.dy / Math.max(1, performance.now() - d.startTime); // px per ms
    if (d.dy > DRAG_TO_CLOSE || (d.dy > 20 && speed > 0.6)) {
      draggedShut.current = true; // carry on down, rather than shrinking back
      onClose();
    } else {
      dialog.current?.style.setProperty("--drag", "0px"); // springs back
    }
  };

  return (
    <dialog
      ref={dialog}
      className={s.sheet}
      aria-labelledby={titleId}
      // Esc: animate out instead of the browser's instant close
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      // If the browser closes it anyway, keep the parent in step
      onClose={() => open && onClose()}
      // A click on the dim area outside the panel lands on the <dialog> itself
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* the red light round its edge (useBoxLights.ts) */}
      <canvas className={s.light} data-box-light="" aria-hidden="true" />
      <div ref={panel} className={s.panel} data-stage={stage}>
        <div className={s.top} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
          <span className={s.grab} aria-hidden="true" />
          <div className={s.head}>
            <div className={s.titles}>
              <h2 id={titleId} className={`${slot.text} ${s.title}`} style={sheetOrder(0)}>{title}</h2>
              {subtitle && <p className={`${slot.text} ${s.subtitle}`} style={sheetOrder(1)}>{subtitle}</p>}
            </div>
            <button type="button" className={s.close} onClick={onClose} aria-label="Close">
              <svg viewBox="0 0 14 14" aria-hidden="true"><path d="M3 3l8 8M11 3l-8 8" /></svg>
            </button>
          </div>
        </div>
        <div className={s.body}>{children}</div>
        {footer && <div className={s.foot}>{footer}</div>}
      </div>
    </dialog>
  );
}
