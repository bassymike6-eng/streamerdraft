// src/components/sound/dsp.ts
//
// WHAT THIS IS
// The building blocks every v3 sound is made from: noise, envelopes,
// filters, ringing objects, oscillators, saturation, loudness, a limiter.
// patches.ts snaps these together into the actual sounds.
//
// Everything here is plain maths on arrays of numbers (one number per
// sample, 48,000 a second), with no browser features. So the same code runs
// in the browser's background thread (synth.worker.ts) and in Node for tests,
// and sounds exactly the same everywhere.
//
// WORDS USED BELOW
//   sample rate (sr)  numbers per second of sound (48,000)
//   T60               how long something takes to fade away (to -60 dB, about
//                     a thousandth of its loudness): a glass ring might be
//                     0.5 s, a click 0.02 s, a stadium's echo 2.6 s
//   Q                 how narrow a filter is: 0.7 is broad and smooth, 10 is
//                     a narrow ringing band
//   LUFS              how loud something SOUNDS (not how high its peaks are),
//                     the broadcast standard (ITU BS.1770)

export const SR = 48000;
const TAU = Math.PI * 2;

export type Channels = Float32Array[]; // 1 (mono) or 2 (stereo: left, right)

// ---- Random numbers you can repeat: the same seed gives the same sound ----
export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0 || 1;
  }
  next(): number {
    // mulberry32: small, fast and good enough for sound
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number) {
    return a + (b - a) * this.next();
  }
  signed() {
    return this.next() * 2 - 1;
  }
  // around 1, give or take `by` (0.05 = up to 5% either way)
  nudge(by: number) {
    return 1 + this.signed() * by;
  }
  gauss() {
    const u = Math.max(1e-9, this.next());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * this.next());
  }
  int(a: number, b: number) {
    return Math.floor(this.range(a, b + 1));
  }
}

export const len = (seconds: number, sr: number) => Math.max(1, Math.round(seconds * sr));
export const dbToGain = (db: number) => 10 ** (db / 20);
export const gainToDb = (g: number) => 20 * Math.log10(Math.max(g, 1e-12));
export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export function silence(seconds: number, sr: number) {
  return new Float32Array(len(seconds, sr));
}

// Adds `src` into `dst`, starting `at` seconds in, times `gain`
export function mixInto(dst: Float32Array, src: Float32Array, at: number, sr: number, gain = 1) {
  const o = Math.round(at * sr);
  const end = Math.min(dst.length, o + src.length);
  for (let i = Math.max(0, o); i < end; i++) dst[i] += src[i - o] * gain;
  return dst;
}

export function scale(x: Float32Array, g: number) {
  for (let i = 0; i < x.length; i++) x[i] *= g;
  return x;
}

export function multiply(x: Float32Array, by: Float32Array) {
  const n = Math.min(x.length, by.length);
  for (let i = 0; i < n; i++) x[i] *= by[i];
  for (let i = n; i < x.length; i++) x[i] = 0;
  return x;
}

export function add(...parts: Float32Array[]) {
  const out = new Float32Array(Math.max(...parts.map((p) => p.length)));
  for (const p of parts) for (let i = 0; i < p.length; i++) out[i] += p[i];
  return out;
}

// Short fades at the very start and end, so nothing ever clicks on or off
export function edges(x: Float32Array, sr: number, fadeIn = 0.001, fadeOut = 0.004) {
  const a = Math.min(x.length, len(fadeIn, sr));
  const b = Math.min(x.length, len(fadeOut, sr));
  for (let i = 0; i < a; i++) x[i] *= i / a;
  for (let i = 0; i < b; i++) x[x.length - 1 - i] *= i / b;
  return x;
}

// Scales so the loudest sample is `to` (1 = full scale): for balancing layers
// inside a sound before mixing them, whatever level each came out at
export function norm(x: Float32Array, to = 1) {
  let p = 0;
  for (let i = 0; i < x.length; i++) p = Math.max(p, Math.abs(x[i]));
  return p > 0 ? scale(x, to / p) : x;
}

export function reverse(x: Float32Array) {
  return x.slice().reverse();
}

// ---- Noise ----
export function white(n: number, rng: Rng) {
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = rng.signed();
  return x;
}

// Pink noise (equal energy per octave: sounds like wind or a waterfall, not hiss).
// Paul Kellet's filter.
export function pink(n: number, rng: Rng) {
  const x = new Float32Array(n);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = rng.signed();
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    x[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  return x;
}

// Brown noise (deep rumble)
export function brown(n: number, rng: Rng) {
  const x = new Float32Array(n);
  let v = 0;
  for (let i = 0; i < n; i++) {
    v = (v + rng.signed() * 0.02) * 0.998;
    x[i] = v * 3.5;
  }
  return x;
}

// Sparse crackle: `rate(t)` clicks a second, each a single random sample
export function dust(n: number, sr: number, rng: Rng, rate: (t: number) => number) {
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) if (rng.next() < rate(i / sr) / sr) x[i] = rng.signed();
  return x;
}

// ---- Envelopes ----
// Breakpoints [[seconds, level], ...]. curve 0 = straight lines; positive =
// slow start then fast (like a swell); negative = fast then slow (like a decay)
export function envelope(n: number, sr: number, points: [number, number][], curve = 0) {
  const x = new Float32Array(n);
  let i = 0;
  // before the first point: its level
  const first = Math.min(n, Math.max(0, Math.round(points[0][0] * sr)));
  for (; i < first; i++) x[i] = points[0][1];
  for (let p = 0; p < points.length - 1; p++) {
    const t0 = points[p][0], v0 = points[p][1];
    const t1 = points[p + 1][0], v1 = points[p + 1][1];
    const a = Math.round(t0 * sr), b = Math.min(n, Math.round(t1 * sr));
    const span = Math.max(1, b - a);
    if (curve === 0) {
      for (i = Math.max(a, i); i < b; i++) x[i] = v0 + ((v1 - v0) * (i - a)) / span;
    } else {
      // (e^(curve * f) - 1) / (e^curve - 1), worked out by multiplying as we go
      const k = Math.exp(curve / span), d = Math.exp(curve) - 1;
      i = Math.max(a, i);
      let e = Math.exp((curve * (i - a)) / span);
      for (; i < b; i++) {
        x[i] = v0 + ((v1 - v0) * (e - 1)) / d;
        e *= k;
      }
    }
  }
  const last = points[points.length - 1][1];
  for (; i < n; i++) x[i] = last;
  return x;
}

// A strike: up in `attack` seconds, then dies away exponentially (T60)
export function strikeEnv(n: number, sr: number, attack: number, t60: number) {
  const x = new Float32Array(n);
  const a = Math.max(1, attack * sr);
  const k = -6.907755 / (t60 * sr); // ln(1/1000)
  for (let i = 0; i < n; i++) x[i] = (i < a ? i / a : 1) * Math.exp(k * Math.max(0, i - a));
  return x;
}

// A curve over time (for sweeping a filter, a pitch, a pan...). Worked out
// every `step` samples and joined with straight lines in between: these all
// move slowly, so it sounds identical and costs a sixteenth as much.
export function curve(n: number, sr: number, f: (t: number) => number, step = 16) {
  const x = new Float32Array(n);
  let prev = f(0);
  for (let i = 0; i < n; i += step) {
    const next = f(Math.min(i + step, n - 1) / sr);
    const end = Math.min(step, n - i);
    for (let j = 0; j < end; j++) x[i + j] = prev + ((next - prev) * j) / step;
    prev = next;
  }
  return x;
}

// The arc's rasp: a pulse 100 times a second (the mains hum), as a ready-made
// cycle to repeat (`sharp` = how short each pulse is)
export function mainsPulse(n: number, sr: number, hz: number, sharp: number) {
  const period = sr / hz;
  const cycle = new Float32Array(Math.ceil(period) + 1);
  for (let i = 0; i < cycle.length; i++) cycle[i] = (0.5 + 0.5 * Math.cos((TAU * i) / period)) ** sharp;
  const x = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    x[i] = cycle[ph | 0];
    ph += 1;
    if (ph >= period) ph -= period;
  }
  return x;
}

// ---- Filters ----
// A state-variable filter (Andrew Simper's "TPT" design): stays smooth and
// stable even when its frequency sweeps fast, which is most of what we do.
export type FilterMode = "lp" | "bp" | "hp" | "notch";
type Param = number | Float32Array;
const at = (p: Param, i: number) => (typeof p === "number" ? p : p[Math.min(i, p.length - 1)]);

export function svf(x: Float32Array, sr: number, mode: FilterMode, cutoff: Param, q: Param = 0.707) {
  const y = new Float32Array(x.length);
  let ic1 = 0, ic2 = 0;
  let a1 = 0, a2 = 0, a3 = 0, k = 1;
  const nyq = sr * 0.49;
  for (let i = 0; i < x.length; i++) {
    if ((i & 15) === 0 || i === 0) {
      // (the settings are worked out every 16 samples: smooth enough, much faster)
      const fc = clamp(at(cutoff, i), 10, nyq);
      const g = Math.tan((Math.PI * fc) / sr);
      k = 1 / Math.max(0.05, at(q, i));
      a1 = 1 / (1 + g * (g + k));
      a2 = g * a1;
      a3 = g * a2;
    }
    const v0 = x[i];
    const v3 = v0 - ic2;
    const v1 = a1 * ic1 + a2 * v3;
    const v2 = ic2 + a2 * ic1 + a3 * v3;
    ic1 = 2 * v1 - ic1;
    ic2 = 2 * v2 - ic2;
    if (mode === "lp") y[i] = v2;
    else if (mode === "bp") y[i] = v1 * k; // (scaled so its peak is 0 dB)
    else if (mode === "hp") y[i] = v0 - k * v1 - v2;
    else y[i] = v0 - k * v1;
  }
  return y;
}

// The classic "cookbook" EQ filters (Robert Bristow-Johnson), for fixed tone shaping
export type EqKind = "lowpass" | "highpass" | "bandpass" | "peak" | "lowshelf" | "highshelf";
export function eq(x: Float32Array, sr: number, kind: EqKind, f: number, q = 0.707, db = 0) {
  const A = 10 ** (db / 40);
  const w = (TAU * clamp(f, 10, sr * 0.49)) / sr;
  const cs = Math.cos(w), sn = Math.sin(w);
  const alpha = sn / (2 * q);
  let b0 = 0, b1 = 0, b2 = 0, a0 = 1, a1 = 0, a2 = 0;
  switch (kind) {
    case "lowpass": b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = (1 - cs) / 2; a0 = 1 + alpha; a1 = -2 * cs; a2 = 1 - alpha; break;
    case "highpass": b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = (1 + cs) / 2; a0 = 1 + alpha; a1 = -2 * cs; a2 = 1 - alpha; break;
    case "bandpass": b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cs; a2 = 1 - alpha; break;
    case "peak": b0 = 1 + alpha * A; b1 = -2 * cs; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cs; a2 = 1 - alpha / A; break;
    case "lowshelf": {
      const s = 2 * Math.sqrt(A) * alpha;
      b0 = A * (A + 1 - (A - 1) * cs + s); b1 = 2 * A * (A - 1 - (A + 1) * cs); b2 = A * (A + 1 - (A - 1) * cs - s);
      a0 = A + 1 + (A - 1) * cs + s; a1 = -2 * (A - 1 + (A + 1) * cs); a2 = A + 1 + (A - 1) * cs - s;
      break;
    }
    case "highshelf": {
      const s = 2 * Math.sqrt(A) * alpha;
      b0 = A * (A + 1 + (A - 1) * cs + s); b1 = -2 * A * (A - 1 + (A + 1) * cs); b2 = A * (A + 1 + (A - 1) * cs - s);
      a0 = A + 1 - (A - 1) * cs + s; a1 = 2 * (A - 1 - (A + 1) * cs); a2 = A + 1 - (A - 1) * cs - s;
      break;
    }
  }
  return biquad(x, b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0);
}

function biquad(x: Float32Array, b0: number, b1: number, b2: number, a1: number, a2: number) {
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v;
    y[i] = v;
  }
  return y;
}

// Removes any slow drift away from zero (it wastes loudness and can thump)
export function dcBlock(x: Float32Array, sr: number) {
  const y = new Float32Array(x.length);
  const r = 1 - (TAU * 12) / sr;
  let x1 = 0, y1 = 0;
  for (let i = 0; i < x.length; i++) {
    y1 = x[i] - x1 + r * y1;
    x1 = x[i];
    y[i] = y1;
  }
  return y;
}

// ---- Ringing objects (modal synthesis) ----
// A struck object (glass, metal, plastic, wood) rings at a handful of its own
// frequencies ("modes"), each fading at its own speed. Real materials:
//   glass / metal   few modes, NOT whole-number multiples, long rings
//   plastic / wood  modes die fast, the high ones fastest
// excite: what hits it (a click, a burst of noise). Each mode is a tiny
// resonator, so the hit's own character shapes the ring.
export type Mode = { f: number; t60: number; g: number };
export function resonate(excite: Float32Array, sr: number, list: Mode[]) {
  const y = new Float32Array(excite.length);
  for (const m of list) {
    if (m.f >= sr * 0.45 || m.g === 0) continue;
    const w = (TAU * m.f) / sr;
    const r = Math.exp(-6.907755 / (m.t60 * sr));
    const b = 2 * r * Math.cos(w), c = -r * r;
    const g = m.g * Math.sin(w); // (a single click then rings at exactly g)
    let y1 = 0, y2 = 0;
    for (let i = 0; i < excite.length; i++) {
      const v = excite[i] + b * y1 + c * y2;
      y2 = y1; y1 = v;
      y[i] += v * g;
    }
  }
  return y;
}

// The same idea without anything hitting it: just the ring, from a perfect
// tap (cheaper, and exact: for bells and glass tones)
export function ring(n: number, sr: number, list: Mode[], attack = 0.0006, rng?: Rng) {
  const y = new Float32Array(n);
  const a = Math.max(1, attack * sr);
  for (const m of list) {
    if (m.f >= sr * 0.45) continue;
    const w = (TAU * m.f) / sr;
    const k = Math.exp(-6.907755 / (m.t60 * sr));
    const ph = rng ? rng.next() * TAU : 0;
    let e = 1;
    // a rotating pair (cos, sin) is far cheaper than calling sin() every sample
    let c = Math.cos(ph), s = Math.sin(ph);
    const cw = Math.cos(w), sw = Math.sin(w);
    for (let i = 0; i < n; i++) {
      const env = i < a ? i / a : e;
      y[i] += m.g * env * s;
      if (i >= a) e *= k;
      const c2 = c * cw - s * sw;
      s = s * cw + c * sw;
      c = c2;
    }
  }
  return y;
}

// ---- Oscillators ----
// One cycle of a wave, worked out once and then read round and round (a
// "wavetable"): far quicker than adding up sine waves every sample, which
// matters on a phone. 2048 points a cycle, read with straight-line
// interpolation between them.
const TABLE = 2048;
function readTable(table: Float32Array, n: number, sr: number, freq: Param, phase = 0) {
  const y = new Float32Array(n);
  let ph = phase * TABLE;
  for (let i = 0; i < n; i++) {
    const a = ph | 0;
    const f = ph - a;
    y[i] = table[a] + (table[a + 1] - table[a]) * f;
    ph += (at(freq, i) * TABLE) / sr;
    while (ph >= TABLE) ph -= TABLE;
  }
  return y;
}
let sineTable: Float32Array | null = null;

// freq: a fixed frequency, or one per sample (for glides)
export function sine(n: number, sr: number, freq: Param, phase = 0) {
  if (typeof freq === "number") {
    // a fixed note: a rotating pair of numbers is exact and quicker still
    const y = new Float32Array(n);
    const w = (TAU * freq) / sr;
    const cw = Math.cos(w), sw = Math.sin(w);
    let c = Math.cos(TAU * phase), s = Math.sin(TAU * phase);
    for (let i = 0; i < n; i++) {
      y[i] = s;
      const c2 = c * cw - s * sw;
      s = s * cw + c * sw;
      c = c2;
      if ((i & 1023) === 1023) {
        // (keeps it exactly round over long sounds)
        const m = 1 / Math.hypot(c, s);
        c *= m;
        s *= m;
      }
    }
    return y;
  }
  if (!sineTable) {
    sineTable = new Float32Array(TABLE + 1);
    for (let i = 0; i <= TABLE; i++) sineTable[i] = Math.sin((TAU * i) / TABLE);
  }
  return readTable(sineTable, n, sr, freq, phase);
}

// Many harmonics of one note at once (additive synthesis). amps[k] is the
// level of harmonic k+1. Harmonics that would go above what the sample rate
// can hold (at the highest pitch this note reaches) are left out, so nothing
// ever aliases (folds back down as a nasty whistle).
export function harmonics(n: number, sr: number, f0: Param, amps: number[], rng?: Rng) {
  let top = 0;
  if (typeof f0 === "number") top = f0;
  else for (let i = 0; i < f0.length; i++) top = Math.max(top, f0[i]);
  const table = new Float32Array(TABLE + 1);
  for (let k = 0; k < amps.length; k++) {
    if ((k + 1) * top > sr * 0.45) break;
    const ph = rng ? rng.next() * TAU : 0;
    const w = ((k + 1) * TAU) / TABLE, cw = Math.cos(w), sw = Math.sin(w);
    let c = Math.cos(ph), sn = Math.sin(ph);
    for (let i = 0; i <= TABLE; i++) {
      table[i] += amps[k] * sn;
      const c2 = c * cw - sn * sw;
      sn = sn * cw + c * sw;
      c = c2;
    }
  }
  return readTable(table, n, sr, f0);
}

// ---- Saturation (warmth, and bass you can hear on a phone) ----
// tanh soft clipping, with "antiderivative anti-aliasing" so driving it hard
// doesn't add the harsh fizz digital distortion usually does.
export function saturate(x: Float32Array, drive: number) {
  const y = new Float32Array(x.length);
  const F = (v: number) => Math.log(Math.cosh(v)); // the antiderivative of tanh
  const norm = 1 / Math.tanh(Math.max(drive, 1e-3));
  let x1 = 0, F1 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i] * drive;
    const Fv = F(v);
    const d = v - x1;
    y[i] = (Math.abs(d) < 1e-5 ? Math.tanh((v + x1) / 2) : (Fv - F1) / d) * norm;
    x1 = v;
    F1 = Fv;
  }
  return y;
}

// Phone speakers can't play deep bass (below about 250 Hz it just isn't
// there). The ear fills in a missing low note from its higher harmonics, so
// we add harmonics of the bass that phones CAN play (the "missing
// fundamental" trick): on headphones you get the real thing, on a phone you
// still feel where it is.
export function phoneBass(sub: Float32Array, sr: number, amount = 0.35) {
  const driven = saturate(eq(sub, sr, "lowpass", 160, 0.7), 4);
  const band = eq(eq(driven, sr, "highpass", 180, 0.7), sr, "lowpass", 900, 0.7);
  const y = sub.slice();
  for (let i = 0; i < y.length; i++) y[i] += band[i] * amount;
  return edges(y, sr, 0.0005, Math.min(0.05, y.length / sr / 4));
}

// ---- Stereo ----
// Places a mono sound left (-1) to right (+1), equal power, fixed or moving
export function pan(x: Float32Array, p: Param): Channels {
  const l = new Float32Array(x.length), r = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) {
    const a = ((clamp(at(p, i), -1, 1) + 1) * Math.PI) / 4;
    l[i] = x[i] * Math.cos(a);
    r[i] = x[i] * Math.sin(a);
  }
  return [l, r];
}

export function mixStereo(n: number, parts: { ch: Channels; at?: number; gain?: number }[], sr: number): Channels {
  const l = new Float32Array(n), r = new Float32Array(n);
  for (const p of parts) {
    mixInto(l, p.ch[0], p.at ?? 0, sr, p.gain ?? 1);
    mixInto(r, p.ch[p.ch.length > 1 ? 1 : 0], p.at ?? 0, sr, p.gain ?? 1);
  }
  return [l, r];
}

// ---- Loudness (ITU BS.1770 K-weighting) ----
function kWeight(x: Float32Array, sr: number) {
  // stage 1: the head's effect (a high shelf, +4 dB above ~1.7 kHz)
  let K = Math.tan((Math.PI * 1681.974450955533) / sr);
  const Vh = 10 ** (3.999843853973347 / 20), Vb = Vh ** 0.4996667741545416, Q1 = 0.7071752369554196;
  let a0 = 1 + K / Q1 + K * K;
  const s1 = biquad(x, (Vh + (Vb * K) / Q1 + K * K) / a0, (2 * (K * K - Vh)) / a0, (Vh - (Vb * K) / Q1 + K * K) / a0, (2 * (K * K - 1)) / a0, (1 - K / Q1 + K * K) / a0);
  // stage 2: ignores the very lowest bass (a high-pass at ~38 Hz)
  K = Math.tan((Math.PI * 38.13547087602444) / sr);
  const Q2 = 0.5003270373238773;
  a0 = 1 + K / Q2 + K * K;
  return biquad(s1, 1, -2, 1, (2 * (K * K - 1)) / a0, (1 - K / Q2 + K * K) / a0);
}

// The loudest stretch of `window` seconds, in LUFS. Short window (0.1 s) for
// clicks and taps, the standard 0.4 s ("momentary") for everything longer.
export function loudness(ch: Channels, sr: number, window = 0.4) {
  const weighted = ch.map((c) => kWeight(c, sr));
  const n = weighted[0].length;
  const w = Math.max(1, Math.min(n, len(window, sr)));
  const hop = Math.max(1, Math.floor(w / 8));
  const sq = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (const c of weighted) s += c[i] * c[i];
    sq[i + 1] = sq[i] + s;
  }
  let best = 0;
  for (let i = 0; i + w <= n; i += hop) best = Math.max(best, (sq[i + w] - sq[i]) / w);
  return -0.691 + 10 * Math.log10(Math.max(best, 1e-12));
}

export function peak(ch: Channels) {
  let p = 0;
  for (const c of ch) for (let i = 0; i < c.length; i++) p = Math.max(p, Math.abs(c[i]));
  return p;
}

// A limiter: catches peaks above `ceiling` dB without squashing the sound
// (it looks a couple of milliseconds ahead, so it's never late to a peak)
export function limit(ch: Channels, sr: number, ceilingDb = -1, release = 0.06) {
  const ceiling = dbToGain(ceilingDb);
  const n = ch[0].length;
  const look = len(0.002, sr);
  const need = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let p = 0;
    for (const c of ch) p = Math.max(p, Math.abs(c[i]));
    need[i] = p > ceiling ? ceiling / p : 1;
  }
  // the gain needed over the next `look` samples (a running minimum, kept in
  // a queue so it's quick), taken at once, then let go slowly
  const ahead = new Float32Array(n);
  const queue = new Int32Array(n);
  let head = 0, tail = 0;
  for (let i = n - 1; i >= 0; i--) {
    while (tail > head && need[queue[tail - 1]] >= need[i]) tail--;
    queue[tail++] = i;
    while (queue[head] > i + look) head++;
    ahead[i] = need[queue[head]];
  }
  const g = new Float32Array(n);
  const rel = Math.exp(-1 / (release * sr));
  let cur = 1;
  for (let i = 0; i < n; i++) {
    const want = ahead[i];
    cur = want < cur ? want : want + (cur - want) * rel;
    g[i] = cur;
  }
  for (const c of ch) for (let i = 0; i < n; i++) c[i] *= g[i];
  return ch;
}

// Sets a sound to exactly `lufs` loud, then makes sure no peak goes over -1 dB
export function finish(ch: Channels, sr: number, lufs: number, window = 0.4) {
  for (let k = 0; k < ch.length; k++) ch[k] = dcBlock(ch[k], sr);
  const now = loudness(ch, sr, window);
  if (Number.isFinite(now)) {
    const g = dbToGain(lufs - now);
    for (const c of ch) scale(c, g);
  }
  limit(ch, sr, -1);
  for (const c of ch) edges(c, sr, 0.0005, 0.01);
  return ch;
}
