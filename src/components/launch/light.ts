// src/components/launch/light.ts
//
// WHAT THIS IS
// Draws the red lights on a <canvas>:
//   - EdgeLight.tsx: round the play button, then the screen edge
//   - SkeletonPage.tsx: round each loading box on the page
//
// HOW THE LIGHT STAYS ONE SMOOTH, UNBROKEN LINE
// We draw the WHOLE outline in one go, painted with a single "conic" gradient
// (one that goes round like a clock hand) centred on the shape. The gradient is
// see-through everywhere except the stretch where the light is, where it fades
// in smoothly from the tail to a bright head. One line, one gradient: no joins,
// no steps. (The last version stacked 8 dashes, and every place one ended
// showed up as a step, which is why it looked cut.)
//
// The light's position and length are measured ALONG the outline in px, so it
// keeps the same speed and length round corners. The gradient's colour stops
// are then placed at the angles where those points actually sit.

export type Shape = { cx: number; cy: number; w: number; h: number; r: number };
export type Rgb = [number, number, number];

const TAU = Math.PI * 2;
const mod = (n: number, m: number) => ((n % m) + m) % m;

// A rounded rectangle centred on (cx, cy). When w = h = 2r it's a circle, so one
// shape covers the play button, a pill, a card and the whole screen.
export function makeShape(cx: number, cy: number, w: number, h: number, radius: number): Shape {
  return { cx, cy, w, h, r: Math.max(0, Math.min(radius, w / 2, h / 2)) };
}

// The outline's total length.
export function perimeter({ w, h, r }: Shape) {
  return 2 * (w - 2 * r) + 2 * (h - 2 * r) + TAU * r;
}

// The point `dist` px along the outline, going clockwise from the middle of the top edge.
function pointAt(s: Shape, dist: number): [number, number] {
  const { cx, cy, w, h, r } = s;
  const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2;
  const arc = (TAU / 4) * r;
  // The outline in order: [length, where that piece puts you after travelling t px]
  const pieces: [number, (t: number) => [number, number]][] = [
    [w / 2 - r, (t) => [cx + t, y0]], // top edge, middle to the right
    [arc, (t) => corner(x1 - r, y0 + r, -TAU / 4, t)], // top-right corner
    [h - 2 * r, (t) => [x1, y0 + r + t]], // right edge
    [arc, (t) => corner(x1 - r, y1 - r, 0, t)], // bottom-right corner
    [w - 2 * r, (t) => [x1 - r - t, y1]], // bottom edge
    [arc, (t) => corner(x0 + r, y1 - r, TAU / 4, t)], // bottom-left corner
    [h - 2 * r, (t) => [x0, y1 - r - t]], // left edge
    [arc, (t) => corner(x0 + r, y0 + r, TAU / 2, t)], // top-left corner
    [w / 2 - r, (t) => [x0 + r + t, y0]], // top edge, back to the middle
  ];
  function corner(ccx: number, ccy: number, start: number, t: number): [number, number] {
    const a = start + (r > 0 ? t / r : 0);
    return [ccx + r * Math.cos(a), ccy + r * Math.sin(a)];
  }
  let left = mod(dist, perimeter(s));
  for (const [length, at] of pieces) {
    if (left <= length) return at(left);
    left -= length;
  }
  return [cx, y0];
}

// Traces the outline onto the canvas (same route as pointAt).
function trace(ctx: CanvasRenderingContext2D, { cx, cy, w, h, r }: Shape) {
  const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2;
  ctx.beginPath();
  ctx.moveTo(cx, y0);
  ctx.lineTo(x1 - r, y0);
  ctx.arc(x1 - r, y0 + r, r, -TAU / 4, 0);
  ctx.lineTo(x1, y1 - r);
  ctx.arc(x1 - r, y1 - r, r, 0, TAU / 4);
  ctx.lineTo(x0 + r, y1);
  ctx.arc(x0 + r, y1 - r, r, TAU / 4, TAU / 2);
  ctx.lineTo(x0, y0 + r);
  ctx.arc(x0 + r, y0 + r, r, TAU / 2, (TAU * 3) / 4);
  ctx.closePath();
}

const rgba = ([r, g, b]: Rgb, a: number) => `rgba(${r},${g},${b},${a.toFixed(3)})`;
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t)) as Rgb;

// "#E50914" -> [229, 9, 20]
export function parseColor(css: string): Rgb {
  const hex = css.trim().replace("#", "");
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex;
  const n = parseInt(full, 16);
  return Number.isNaN(n) ? [229, 9, 20] : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Makes the canvas sharp on high-res screens (phones are 2-3 pixels per CSS px),
// clears it, and returns it ready to draw on in CSS px.
export function prepareCanvas(canvas: HTMLCanvasElement) {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const pw = Math.round(w * dpr);
  const ph = Math.round(h * dpr);
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw;
    canvas.height = ph;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}

type LightOptions = {
  head: number; // where the front of the light is, as a share of the way round (0 = top middle)
  length: number; // how long the light is, in px
  width: number; // line thickness, in px
  color: Rgb; // the light's red
  hot: Rgb; // the slightly brighter red at its very front
  ring?: number; // 0-1: the whole outline drawn solid (when the edge completes)
  fade?: number; // how quickly the tail fades: 1 = evenly, higher = a shorter, brighter tail
};

const STOPS = 48; // colour stops along the light: plenty for a perfectly smooth fade

export function drawLight(ctx: CanvasRenderingContext2D, s: Shape, o: LightOptions) {
  const P = perimeter(s);
  ctx.lineWidth = o.width;
  ctx.lineJoin = "round";
  ctx.lineCap = "butt";

  // The whole outline, solid (only once the light has gone all the way round)
  if (o.ring && o.ring > 0) {
    trace(ctx, s);
    ctx.strokeStyle = rgba(o.color, o.ring);
    ctx.stroke();
  }
  if (o.length <= 0 || P <= 0) return;

  const length = Math.min(o.length, P * 0.995);
  const headDist = mod(o.head, 1) * P;
  const tailDist = headDist - length;
  const angleAt = (d: number) => {
    const [x, y] = pointAt(s, d);
    return Math.atan2(y - s.cy, x - s.cx);
  };

  // Older browsers without conic gradients: a plain solid dash instead.
  if (typeof ctx.createConicGradient !== "function") {
    ctx.setLineDash([length, P - length]);
    ctx.lineDashOffset = -tailDist;
    trace(ctx, s);
    ctx.strokeStyle = rgba(o.color, 1);
    ctx.stroke();
    ctx.setLineDash([]);
    return;
  }

  // One gradient going round the shape's centre, starting at the tail.
  const start = angleAt(tailDist);
  const gradient = ctx.createConicGradient(start, s.cx, s.cy);
  let last = 0;
  for (let k = 0; k <= STOPS; k++) {
    const t = k / STOPS; // 0 = tail, 1 = head
    const turn = k === 0 ? 0 : Math.max(last, mod(angleAt(tailDist + length * t) - start, TAU) / TAU);
    last = Math.min(turn, 1);
    const alpha = Math.pow(t, o.fade ?? 1.3); // fades in from the tail, full at the head
    const color = t > 0.82 ? mix(o.color, o.hot, (t - 0.82) / 0.18) : o.color;
    gradient.addColorStop(last, rgba(color, alpha));
  }
  // Straight after the head: nothing (a clean, sharp front end)
  gradient.addColorStop(Math.min(1, last + 0.0005), rgba(o.color, 0));
  gradient.addColorStop(1, rgba(o.color, 0));

  trace(ctx, s);
  ctx.strokeStyle = gradient;
  ctx.stroke();

  // A small rounded tip on the front, so the head ends neatly
  const [hx, hy] = pointAt(s, headDist);
  ctx.beginPath();
  ctx.arc(hx, hy, o.width / 2, 0, TAU);
  ctx.fillStyle = rgba(o.hot, 1);
  ctx.fill();
}
