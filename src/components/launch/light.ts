// src/components/launch/light.ts
//
// WHAT THIS IS
// Draws the red lights on a <canvas>:
//   - EdgeLight.tsx: round the play button, then the screen edge
//   - SkeletonPage.tsx: round each loading box on the page
//
// HOW THE LIGHT STAYS ONE SMOOTH, UNBROKEN LINE (in every browser)
// The outline is made of straight edges and quarter-circle corners. The light
// is drawn piece by piece over the stretch it covers, each piece with the
// gradient that fits it exactly:
//   a straight edge   a LINEAR gradient along it
//   a corner          a CONIC gradient (one that goes round like a clock hand)
//                     centred on that corner's own circle
// so the fade is spread evenly by distance, round corners too, whatever the shape.
//
// WHY NOT ONE GRADIENT FOR THE WHOLE SHAPE (the last version)
// One conic gradient centred on the middle of the shape is perfect for a
// circle or a square. But on a long thin capsule like the footer (1300 x 64),
// seen from the middle, each rounded end is only about 5 degrees wide: the
// light's whole fade had to squeeze into a sliver of the gradient right where
// it turns the corner. Chrome's graphics card drawing (not every browser does
// it the same way) couldn't hold that much detail in so small an angle, and
// the light smeared into a streak at the corners. Per-piece gradients never
// squeeze, so there's nothing to smear.
//
// WHY THE PIECES DON'T SHOW A JOIN
// Where two pieces meet, the edge pixels are part one piece, part the other.
// Painted normally, the second one would half-cover the first and leave a faint
// line. Painted with "lighter" (the two are ADDED together), the parts add back
// up to exactly one whole pixel, so the join disappears.
//
// The light's position and length are measured ALONG the outline in px, so it
// keeps the same speed and length round corners.

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

// The outline as pieces, in order, going clockwise from the middle of the top edge.
type Piece =
  | { kind: "line"; length: number; x: number; y: number; dx: number; dy: number } // from (x, y), heading (dx, dy)
  | { kind: "arc"; length: number; cx: number; cy: number; start: number }; // round (cx, cy), from angle `start`

function piecesOf({ cx, cy, w, h, r }: Shape): Piece[] {
  const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2;
  const arc = (TAU / 4) * r;
  const all: Piece[] = [
    { kind: "line", length: w / 2 - r, x: cx, y: y0, dx: 1, dy: 0 }, // top edge, middle to the right
    { kind: "arc", length: arc, cx: x1 - r, cy: y0 + r, start: -TAU / 4 }, // top-right corner
    { kind: "line", length: h - 2 * r, x: x1, y: y0 + r, dx: 0, dy: 1 }, // right edge
    { kind: "arc", length: arc, cx: x1 - r, cy: y1 - r, start: 0 }, // bottom-right corner
    { kind: "line", length: w - 2 * r, x: x1 - r, y: y1, dx: -1, dy: 0 }, // bottom edge
    { kind: "arc", length: arc, cx: x0 + r, cy: y1 - r, start: TAU / 4 }, // bottom-left corner
    { kind: "line", length: h - 2 * r, x: x0, y: y1 - r, dx: 0, dy: -1 }, // left edge
    { kind: "arc", length: arc, cx: x0 + r, cy: y0 + r, start: TAU / 2 }, // top-left corner
    { kind: "line", length: w / 2 - r, x: x0 + r, y: y0, dx: 1, dy: 0 }, // top edge, back to the middle
  ];
  return all.filter((piece) => piece.length > 0.01); // (a circle has no straight edges)
}

// The point `t` px into a piece
function pointOn(piece: Piece, t: number, r: number): [number, number] {
  if (piece.kind === "line") return [piece.x + piece.dx * t, piece.y + piece.dy * t];
  const a = piece.start + (r > 0 ? t / r : 0);
  return [piece.cx + r * Math.cos(a), piece.cy + r * Math.sin(a)];
}

// The point `dist` px along the outline, going clockwise from the middle of the top edge.
function pointAt(s: Shape, dist: number): [number, number] {
  let left = mod(dist, perimeter(s));
  for (const piece of piecesOf(s)) {
    if (left <= piece.length) return pointOn(piece, left, s.r);
    left -= piece.length;
  }
  return [s.cx, s.cy - s.h / 2];
}

// Where a point `share` of the way round is (0 = the middle of the top edge,
// going clockwise): for the intro's sound to follow the light (EdgeLight.tsx)
export function pointAlong(s: Shape, share: number): [number, number] {
  return pointAt(s, share * perimeter(s));
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

export function drawLight(ctx: CanvasRenderingContext2D, s: Shape, o: LightOptions) {
  const P = perimeter(s);
  ctx.lineWidth = o.width;
  ctx.lineJoin = "round";
  ctx.lineCap = "butt";

  if (o.length > 0 && P > 0) {
    const length = Math.min(o.length, P * 0.995);
    const tail = mod(o.head * P - length, P); // where the light starts (its faint end)
    // Its colour `t` of the way from the tail (0) to the head (1): fading in, then a hotter red at the front
    const colourAt = (t: number) => {
      const alpha = Math.pow(Math.max(0, t), o.fade ?? 1.3);
      const color = t > 0.82 ? mix(o.color, o.hot, (t - 0.82) / 0.18) : o.color;
      return rgba(color, alpha);
    };
    const conic = typeof ctx.createConicGradient === "function";

    ctx.globalCompositeOperation = "lighter"; // (so the joins between pieces vanish: see the top)
    const pieces = piecesOf(s);
    // Walk round the outline from the tail, a piece at a time, until the light's
    // whole length is drawn (twice round the list covers a light that crosses the start)
    let at = 0; // where this piece starts, along the outline
    let done = 0; // how much of the light is drawn
    for (let lap = 0; lap < 2 && done < length; lap++) {
      for (const piece of pieces) {
        const from = Math.max(tail + done - (at + lap * P), 0);
        const to = Math.min(piece.length, tail + length - (at + lap * P));
        at += piece.length;
        if (to <= from || done >= length) continue;
        const t0 = done / length; // how far along the light this bit starts
        const t1 = (done + to - from) / length;
        done += to - from;
        const stops = Math.max(2, Math.min(24, Math.ceil(((to - from) / length) * 32)));

        ctx.beginPath();
        let paint: CanvasGradient | string;
        if (piece.kind === "line") {
          const [ax, ay] = pointOn(piece, from, s.r);
          const [bx, by] = pointOn(piece, to, s.r);
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          paint = ctx.createLinearGradient(ax, ay, bx, by);
          for (let k = 0; k <= stops; k++) paint.addColorStop(k / stops, colourAt(t0 + ((t1 - t0) * k) / stops));
        } else {
          const a0 = piece.start + from / s.r;
          const a1 = piece.start + to / s.r;
          ctx.arc(piece.cx, piece.cy, s.r, a0, a1);
          if (conic) {
            paint = ctx.createConicGradient(a0, piece.cx, piece.cy);
            const span = (a1 - a0) / TAU; // (a quarter turn at most)
            for (let k = 0; k <= stops; k++) paint.addColorStop((span * k) / stops, colourAt(t0 + ((t1 - t0) * k) / stops));
          } else {
            paint = colourAt((t0 + t1) / 2); // (very old browsers: one colour per corner)
          }
        }
        ctx.strokeStyle = paint;
        ctx.stroke();
      }
      at = 0;
    }
    ctx.globalCompositeOperation = "source-over";

    // A small rounded tip on the front, so the head ends neatly
    const [hx, hy] = pointAt(s, o.head * P);
    ctx.beginPath();
    ctx.arc(hx, hy, o.width / 2, 0, TAU);
    ctx.fillStyle = rgba(o.hot, 1);
    ctx.fill();
  }

  // The whole outline, solid (only once the light has gone all the way round),
  // painted UNDER the light ("destination-over"), so the light sits on top of it
  if (o.ring && o.ring > 0) {
    ctx.globalCompositeOperation = "destination-over";
    trace(ctx, s);
    ctx.strokeStyle = rgba(o.color, o.ring);
    ctx.stroke();
    ctx.globalCompositeOperation = "source-over";
  }
}
