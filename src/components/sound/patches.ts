// src/components/sound/patches.ts
//
// WHAT THIS IS
// Every sound in v3, as a recipe. No sound files: each one is built from
// scratch (dsp.ts) in the visitor's browser, a moment before it's needed,
// and a little differently every time (each render gets a new random seed).
//
// THE IDEA: "LIGHTS ON"
// StreamerDraft is for the streamer nobody's watching yet. So the sound is a
// stadium at night, before anyone's there:
//   - the power breaker thrown (tap play)
//   - the floodlights warming up and buzzing (the light growing out)
//   - their electric hum racing round the edge (the light lapping the screen)
//   - the banks of floodlights clunking on, left, right, centre (the ring locks)
//   - the name called: a deep hit, and the press photographers' cameras going off
//   - "Nobody's watching.": wind across an empty stadium
//   - "Yet.": a hit, and the main floodlights slamming on at full power
// No tunes, no jingles, no beeps. Everything is a physical thing: power,
// light, metal, glass, air, cameras. The page's own sounds are the same
// world up close: switches, a puff of air, a camera shutter, a knock.
//
// THE ONE "NOTE": THE FLOODLIGHTS' HUM
// Lights on UK mains power (50 times a second) hum at 100 Hz, plus its
// overtones: 200, 300, 400, 500, 600... Any tone in v3 is one of those. When
// you're confirmed, the hum blooms into the chord its own overtones make
// (4 : 5 : 6, a pure major chord: 400, 500 and 600 Hz).
//
// HOW EACH RECIPE IS WRITTEN
// render(sr, rng, options) returns the sound, "dry" (no echo). The echo comes
// from the space it plays in (engine.ts): the STADIUM (big, dark, long, with
// the slap back off the far stand) for the intro's big moments, or the BOOTH
// (small and close) for the page. Each recipe's loudness is then set exactly
// (`lufs`), so however the dice fall, it always sits at the same level.
//
// TO CHANGE A SOUND: edit its recipe below, then hear it on the sound board
// (npm run dev, then /dev/sounds): every Play makes a fresh one.

import {
  add, brown, clamp, curve, dust, edges, envelope, eq, finish, harmonics, len, mainsPulse, mixInto, mixStereo, multiply, norm, pan,
  phoneBass, pink, resonate, ring, Rng, saturate, scale, silence, sine, strikeEnv, svf, white,
  type Channels, type Mode,
} from "./dsp";
import { LED, PHASE_TIMES } from "../launch/timeline";

export const HUM = 100; // the floodlights' hum (UK mains, 50 Hz, hums at twice that)

// When the intro's scenes start (seconds after the tap), for the sounds that
// have to fit exactly between two of them
const sceneAt = (phase: string) => PHASE_TIMES.find((p) => p.phase === phase)?.at ?? 0;
const LOAD_TO_TITLE = sceneAt("title") - sceneAt("load");
const TAP_TO_TITLE = sceneAt("title");

// ======================= Small parts used by many sounds =======================

// A click: a burst of noise rung through a narrow band (how real switches and
// latches click: Andy Farnell, Designing Sound, "Switches")
function click(sr: number, rng: Rng, o: { f: number; q: number; decay: number; attack?: number }) {
  const n = len(o.decay * 5 + 0.01, sr);
  const x = white(n, rng);
  const env = strikeEnv(n, sr, o.attack ?? 0.0004, o.decay * 3);
  for (let i = 0; i < n; i++) x[i] *= env[i];
  return norm(svf(x, sr, "bp", o.f * rng.nudge(0.04), o.q));
}

// A thump: a low sine that drops in pitch as it dies away (a weight landing)
function thump(sr: number, rng: Rng, o: { from: number; to: number; glide: number; t60: number; attack?: number }) {
  const n = len(o.t60 * 1.1, sr);
  const f = curve(n, sr, (t) => o.to + (o.from - o.to) * Math.exp(-t / Math.max(o.glide / 3, 1e-3)));
  const x = sine(n, sr, f);
  const env = strikeEnv(n, sr, o.attack ?? 0.0015, o.t60);
  for (let i = 0; i < n; i++) x[i] *= env[i];
  return norm(edges(x, sr, 0.0005, o.t60 * 0.3));
}

// A short burst of noise, for hitting resonant things with
function burst(sr: number, rng: Rng, o: { decay: number; lowpass?: number; highpass?: number }) {
  const n = len(o.decay * 4 + 0.005, sr);
  let x = white(n, rng);
  const env = strikeEnv(n, sr, 0.0003, o.decay * 3);
  for (let i = 0; i < n; i++) x[i] *= env[i];
  if (o.lowpass) x = eq(x, sr, "lowpass", o.lowpass, 0.7);
  if (o.highpass) x = eq(x, sr, "highpass", o.highpass, 0.7);
  return x;
}

// Something hit and ringing: `excite` into a set of modes
function struck(sr: number, rng: Rng, excite: Float32Array, modes: Mode[], seconds: number) {
  const x = new Float32Array(len(seconds, sr));
  mixInto(x, excite, 0, sr);
  return norm(resonate(x, sr, modes.map((m) => ({ ...m, f: m.f * rng.nudge(0.015) }))));
}

// Moving air: noise through a band that sweeps from one frequency to another
function air(sr: number, rng: Rng, o: { seconds: number; from: number; to: number; q: number; shape: [number, number][]; pinkNoise?: boolean }) {
  const n = len(o.seconds, sr);
  const src = o.pinkNoise === false ? white(n, rng) : pink(n, rng);
  const f = curve(n, sr, (t) => o.from * (o.to / o.from) ** clamp(t / o.seconds, 0, 1));
  const x = svf(src, sr, "bp", f, o.q);
  const env = envelope(n, sr, o.shape, 0);
  for (let i = 0; i < n; i++) x[i] *= env[i] * env[i];
  return norm(x);
}

// The floodlights' hum: 100 Hz and its overtones, with the rasp of the
// arc inside the lamp (noise that pulses 100 times a second)
function hum(sr: number, rng: Rng, o: { seconds: number; bright: number | ((t: number) => number); rasp?: number }) {
  const n = len(o.seconds, sr);
  // A real transformer hum is lumpy, not a smooth row of overtones: a few
  // are much louder than their neighbours. Fixed per sound, random per render.
  const amps = Array.from({ length: 36 }, (_, k) => ((k % 2 === 0 ? 1 : 0.7) / (k + 1) ** 1.05) * rng.range(0.45, 1.25));
  const tone = harmonics(n, sr, curve(n, sr, (t) => HUM * (1 + 0.0015 * Math.sin(t * 2.3))), amps, rng);
  const bright = typeof o.bright === "number" ? () => o.bright as number : o.bright;
  const shaped = svf(tone, sr, "lp", curve(n, sr, (t) => 160 + 5200 * bright(t) ** 1.5), 0.8);
  if (o.rasp) {
    const r = multiply(white(n, rng), mainsPulse(n, sr, HUM, 6));
    const band = norm(svf(r, sr, "bp", 2600, 0.7), 1);
    norm(shaped);
    const b = curve(n, sr, bright, 64);
    for (let i = 0; i < n; i++) shaped[i] += band[i] * o.rasp * b[i];
  }
  return norm(shaped);
}

// The hum's own chord: chosen overtones of 100 Hz, each a pure tone with a
// slow shimmer (two copies a fraction of a hertz apart, gently beating)
function overtones(sr: number, rng: Rng, o: { seconds: number; harmonics: number[]; attack: number; t60: number; levels?: number[] }) {
  const n = len(o.seconds, sr);
  const x = new Float32Array(n);
  o.harmonics.forEach((h, k) => {
    const f = HUM * h;
    const level = (o.levels?.[k] ?? 1) / Math.sqrt(h);
    const beat = rng.range(0.25, 0.8);
    mixInto(x, sine(n, sr, f - beat / 2, rng.next()), 0, sr, level * 0.5);
    mixInto(x, sine(n, sr, f + beat / 2, rng.next()), 0, sr, level * 0.5);
  });
  const env = strikeEnv(n, sr, o.attack, o.t60);
  for (let i = 0; i < n; i++) x[i] *= env[i];
  return norm(x);
}

// A heavy contactor slamming shut: how a bank of floodlights switches on.
// The clack of its contacts, its steel housing ringing (but damped: it's
// bolted to a wall), the thud of the moving part landing, and the contacts
// bouncing. The thud is made from noise, not a sliding tone: a tone that
// slides down is a drum machine's kick, and this should sound like a machine.
function contactor(sr: number, rng: Rng, size = 1) {
  const x = new Float32Array(len(0.7 * size, sr));
  mixInto(x, norm(svf(burst(sr, rng, { decay: 0.0015 }), sr, "bp", (3800 / size) * rng.nudge(0.05), 0.9)), 0, sr, 0.6);
  const housing: Mode[] = [
    { f: 310, t60: 0.06, g: 0.8 }, { f: 520, t60: 0.05, g: 1 }, { f: 790, t60: 0.045, g: 0.8 },
    { f: 1180, t60: 0.035, g: 0.6 }, { f: 1730, t60: 0.025, g: 0.5 }, { f: 2600, t60: 0.02, g: 0.35 },
  ].map((m) => ({ ...m, f: m.f / size, t60: m.t60 * size }));
  mixInto(x, struck(sr, rng, burst(sr, rng, { decay: 0.003, lowpass: 4000 }), housing, 0.4 * size), 0.0005, sr, 0.75);
  const thud = norm(eq(eq(burst(sr, rng, { decay: 0.012 * size }), sr, "lowpass", 170 / size, 0.9), sr, "lowpass", 170 / size, 0.7));
  mixInto(x, norm(phoneBass(thud, sr, 0.4)), 0.001, sr, 0.9);
  mixInto(x, norm(svf(burst(sr, rng, { decay: 0.001 }), sr, "bp", 5200, 1.2)), 0.009 * rng.nudge(0.2), sr, 0.25);
  return x;
}

// A camera shutter. "Ka": the mirror slapping up and the first curtain going.
// "Chik": the second curtain closing and the mirror coming back down. Then
// the little motor winding it on, ready for the next one.
function shutter(sr: number, rng: Rng, o: { far?: number } = {}) {
  const far = o.far ?? 0;
  const x = new Float32Array(len(0.16, sr));
  mixInto(x, norm(svf(burst(sr, rng, { decay: 0.004 }), sr, "bp", 1800 * rng.nudge(0.1), 0.8)), 0, sr, 0.9);
  mixInto(x, struck(sr, rng, burst(sr, rng, { decay: 0.002, lowpass: 3000 }), [{ f: 720, t60: 0.018, g: 1 }, { f: 1340, t60: 0.012, g: 0.6 }], 0.05), 0.001, sr, 0.5);
  mixInto(x, norm(burst(sr, rng, { decay: 0.0012, highpass: 3000 })), 0.006, sr, 0.5);
  const t2 = rng.range(0.04, 0.06);
  mixInto(x, norm(svf(burst(sr, rng, { decay: 0.005 }), sr, "bp", 2600 * rng.nudge(0.1), 1)), t2, sr, 0.8);
  mixInto(x, norm(burst(sr, rng, { decay: 0.001, highpass: 4000 })), t2 + 0.002, sr, 0.45);
  // (the motor's whirr is noise pulsing at its speed, not a tone: a tone
  // reads as a buzzer)
  const m = len(0.05, sr);
  const whirr = multiply(multiply(svf(white(m, rng), sr, "bp", 2400, 0.9), mainsPulse(m, sr, 190 * rng.nudge(0.05), 3)), envelope(m, sr, [[0, 0], [0.008, 1], [0.04, 0.6], [0.05, 0]]));
  mixInto(x, norm(whirr), t2 + 0.008, sr, 0.18);
  // further away: duller and quieter
  return far > 0 ? norm(eq(x, sr, "lowpass", 9000 - 6000 * far, 0.7), 1 - 0.6 * far) : norm(x);
}

// Wind across an empty stadium: gusts (slow swells, with quicker flurries on
// top), the rush of the air itself, and a faint whistle through the stands
// that rises when it blows harder
function wind(sr: number, rng: Rng, seconds: number) {
  const n = len(seconds, sr);
  const slow = [0, 1, 2].map(() => ({ f: rng.range(0.08, 0.25), p: rng.next() * 6.28 }));
  const fast = [0, 1, 2].map(() => ({ f: rng.range(0.6, 1.8), p: rng.next() * 6.28 }));
  const sum = (ls: { f: number; p: number }[], t: number) => ls.reduce((a, l) => a + Math.sin(2 * Math.PI * l.f * t + l.p), 0) / ls.length;
  const gustAt = (t: number) => clamp(0.5 + 0.4 * sum(slow, t) + 0.15 * sum(fast, t), 0.05, 1);
  const gust = curve(n, sr, gustAt, 128);
  const rush = norm(svf(pink(n, rng), sr, "bp", curve(n, sr, (t) => 400 + 900 * gustAt(t), 64), 1.1));
  const whistle = norm(svf(pink(n, rng), sr, "bp", curve(n, sr, (t) => 700 + 700 * gustAt(t) ** 2, 64), 12));
  const body = norm(svf(brown(n, rng), sr, "lp", curve(n, sr, (t) => 200 + 500 * gustAt(t), 64), 0.7));
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = (body[i] * 0.3 + rush[i] * 0.7 + whistle[i] * 0.45) * gust[i];
  return norm(x);
}

// Mono to stereo, spread a touch (for sounds that are one thing in one place)
const mono = (x: Float32Array): Channels => [x];

// ============================ The sounds ============================
// What each recipe gets: the sample rate, the dice, and anything the moment
// needs to know (a dock icon's number, say)
export type Options = { step?: number; seconds?: number };
type Recipe = (sr: number, rng: Rng, o: Options) => Channels;

// --- The intro: in the stadium ---

// Tap play: the main power breaker thrown. Its latch gives, then the whole
// mechanism slams over ("click... CLUNK"), and the empty stadium echoes it.
const tap: Recipe = (sr, rng) => {
  const x = silence(0.9, sr);
  mixInto(x, click(sr, rng, { f: 3600, q: 7, decay: 0.008 }), 0, sr, 0.35);
  mixInto(x, norm(contactor(sr, rng, 1.15)), 0.03, sr, 1);
  return mono(eq(x, sr, "highpass", 32, 0.7));
};

// The light grows from the button to the screen's edge: the floodlights'
// ballasts warming up. A buzz that brightens and swells, a rising whine, and
// crackle getting busier, spreading wider in stereo as the light spreads out.
const grow: Recipe = (sr, rng) => {
  const T = LED.grow, n = len(T + 0.2, sr);
  const p = (t: number) => clamp(t / T, 0, 1);
  const buzz = hum(sr, rng, { seconds: T + 0.2, bright: (t) => 0.08 + 0.92 * p(t) ** 1.6, rasp: 0.5 });
  const whine = sine(n, sr, curve(n, sr, (t) => 3000 + 3200 * p(t) ** 1.4));
  const crackle = (k: number) => norm(svf(dust(n, sr, new Rng(k), (t) => 3 + 70 * p(t) ** 2), sr, "bp", 4300, 1.4));
  const cl = crackle(rng.int(1, 1e9)), cr = crackle(rng.int(1, 1e9));
  const swell = envelope(n, sr, [[0, 0.04], [T, 1], [T + 0.2, 0]], 1.8);
  const L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const mid = buzz[i] + whine[i] * 0.025 * p(t);
    const side = 0.25 * p(t);
    L[i] = (mid + cl[i] * side) * swell[i];
    R[i] = (mid + cr[i] * side) * swell[i];
  }
  return [L, R];
};

// The light races round the edge of the screen: the arc's hum and fizz,
// building. (The engine moves it left / right with the light, and makes it
// brighter at the top of the screen, darker at the bottom.)
const lap: Recipe = (sr, rng) => {
  const T = LED.edgeLap, n = len(T + 0.03, sr);
  const p = (t: number) => clamp(t / T, 0, 1);
  const core = svf(hum(sr, rng, { seconds: T + 0.03, bright: 0.85, rasp: 0.8 }), sr, "bp", curve(n, sr, (t) => 1300 * (1 + 0.5 * p(t))), 0.9);
  const fizz = (() => {
    const r = multiply(white(n, rng), mainsPulse(n, sr, HUM, 4));
    return norm(svf(r, sr, "bp", 5200, 0.8));
  })();
  const rumble = norm(svf(brown(n, rng), sr, "lp", curve(n, sr, (t) => 220 + 800 * p(t) ** 2), 0.7));
  norm(core);
  const level = envelope(n, sr, [[0, 0.5], [T, 1]], 1.3);
  const flutter = curve(n, sr, (t) => 1 - 0.12 * p(t) * (0.5 + 0.5 * Math.sin(2 * Math.PI * (7 + 5 * p(t)) * t)));
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    x[i] = (core[i] * 0.75 + fizz[i] * (0.3 + 0.25 * p(t)) + rumble[i] * (0.15 + 0.5 * p(t) ** 2)) * level[i] * flutter[i];
  }
  return mono(edges(x, sr, 0.03, 0.03));
};

// Under the whole build: the night air of an empty stadium (a little
// different in each ear). Gone just before the title lands, so the hit comes
// out of silence.
const bed: Recipe = (sr, rng) => {
  const T = TAP_TO_TITLE - 0.1, n = len(T, sr);
  const L = wind(sr, new Rng(rng.int(1, 1e9)), T), R = wind(sr, new Rng(rng.int(1, 1e9)), T);
  const shape = envelope(n, sr, [[0, 0], [0.8, 1], [T - 0.9, 0.85], [T - 0.15, 0], [T, 0]], 0);
  return [multiply(L, shape), multiply(R, shape)];
};

// The ring locks in: the floodlights come on. Three banks clunk on (left,
// right, then the middle), each with a crackle as its lamps strike, then
// their hum swells in and settles.
const lock: Recipe = (sr, rng) => {
  const n = len(3.4, sr);
  const parts: { ch: Channels; at: number; gain: number }[] = [];
  const banks = [{ at: 0, pan: -0.7 }, { at: 0.09, pan: 0.7 }, { at: 0.18, pan: 0 }];
  for (const b of banks) {
    const c = contactor(sr, rng, rng.range(0.95, 1.1));
    parts.push({ ch: pan(norm(c), b.pan), at: b.at + rng.range(-0.008, 0.008), gain: b.pan === 0 ? 1 : 0.85 });
    const strike = norm(svf(dust(len(0.09, sr), sr, rng, () => 900), sr, "bp", 6200, 1.2));
    const e = envelope(strike.length, sr, [[0, 1], [0.09, 0]], 0);
    for (let i = 0; i < strike.length; i++) strike[i] *= e[i];
    parts.push({ ch: pan(strike, b.pan), at: b.at + 0.01, gain: 0.18 });
  }
  const glow = (seed: number) => {
    const h = hum(sr, new Rng(seed), { seconds: 3.1, bright: (t) => 0.95 - 0.55 * clamp(t / 2.5, 0, 1), rasp: 0.6 });
    const e = envelope(h.length, sr, [[0, 0], [0.06, 1], [0.5, 0.75], [3.1, 0]], -1.5);
    for (let i = 0; i < h.length; i++) h[i] *= e[i];
    return h;
  };
  parts.push({ ch: [glow(rng.int(1, 1e9)), glow(rng.int(1, 1e9))], at: 0.2, gain: 0.32 });
  return mixStereo(n, parts, sr);
};

// The home screen lights up: a breath of air and a soft glass "tink"
const home: Recipe = (sr, rng) => {
  const x = silence(0.7, sr);
  mixInto(x, air(sr, rng, { seconds: 0.45, from: 700, to: 2600, q: 0.9, shape: [[0, 0], [0.07, 1], [0.45, 0]] }), 0, sr, 0.7);
  mixInto(x, norm(ring(len(0.65, sr), sr, [{ f: HUM * 24, t60: 0.45, g: 1 }, { f: HUM * 24 * 2.32, t60: 0.28, g: 0.3 }, { f: HUM * 24 * 4.25, t60: 0.16, g: 0.12 }], 0.004, rng)), 0.03, sr, 0.35);
  return mono(x);
};

// The dock slides up and seats
const dock: Recipe = (sr, rng) => {
  const x = silence(0.4, sr);
  mixInto(x, air(sr, rng, { seconds: 0.32, from: 350, to: 2300, q: 1.3, shape: [[0, 0], [0.2, 1], [0.32, 0]] }), 0, sr, 0.8);
  mixInto(x, click(sr, rng, { f: 1800, q: 3, decay: 0.012 }), 0.3, sr, 0.22);
  return mono(x);
};

// Each dock app pops in: a small glass bead (step: which one, each a touch higher)
const pop: Recipe = (sr, rng, o) => {
  const f0 = 1450 * 1.07 ** (o.step ?? 0) * rng.nudge(0.02);
  const bar: Mode[] = [{ f: f0, t60: 0.11, g: 1 }, { f: f0 * 2.76, t60: 0.06, g: 0.4 }, { f: f0 * 5.4, t60: 0.035, g: 0.2 }];
  const x = silence(0.25, sr);
  mixInto(x, struck(sr, rng, burst(sr, rng, { decay: 0.0008, highpass: 2000 }), bar, 0.24), 0, sr, 0.8);
  mixInto(x, thump(sr, rng, { from: 230, to: 160, glide: 0.02, t60: 0.05 }), 0, sr, 0.2);
  return mono(x);
};

// Our app finishes installing: a latch clicks shut, and a small glass ring
// (the 12th overtone of the hum)
const ready: Recipe = (sr, rng) => {
  const x = silence(0.9, sr);
  mixInto(x, click(sr, rng, { f: 4200, q: 8, decay: 0.006 }), 0, sr, 0.45);
  const latch = struck(sr, rng, click(sr, rng, { f: 2900, q: 6, decay: 0.008 }), [{ f: 740, t60: 0.05, g: 1 }, { f: 1650, t60: 0.035, g: 0.6 }, { f: 2900, t60: 0.02, g: 0.3 }], 0.12);
  mixInto(x, latch, 0.028, sr, 0.6);
  mixInto(x, norm(ring(len(0.85, sr), sr, [{ f: HUM * 12, t60: 0.6, g: 1 }, { f: HUM * 12 * 2.32, t60: 0.35, g: 0.35 }, { f: HUM * 12 * 4.25, t60: 0.2, g: 0.15 }, { f: HUM * 12 * 6.63, t60: 0.12, g: 0.07 }], 0.001, rng)), 0.03, sr, 0.45);
  return mono(x);
};

// Its red badge: tick-tick, and a tiny glass pip
const badge: Recipe = (sr, rng) => {
  const x = silence(0.32, sr);
  mixInto(x, click(sr, rng, { f: 5000, q: 10, decay: 0.004 }), 0, sr, 0.5);
  mixInto(x, click(sr, rng, { f: 5700, q: 10, decay: 0.004 }), 0.065, sr, 0.6);
  mixInto(x, norm(ring(len(0.2, sr), sr, [{ f: HUM * 20, t60: 0.09, g: 1 }, { f: HUM * 20 * 2.32, t60: 0.05, g: 0.3 }], 0.0008, rng)), 0.066, sr, 0.35);
  return mono(x);
};

// Our app gets tapped: a fingertip on glass
const press: Recipe = (sr, rng) => {
  const x = silence(0.3, sr);
  mixInto(x, norm(svf(burst(sr, rng, { decay: 0.02 }), sr, "lp", 420, 0.7)), 0, sr, 0.6);
  mixInto(x, thump(sr, rng, { from: 150, to: 95, glide: 0.03, t60: 0.08 }), 0.002, sr, 0.6);
  mixInto(x, click(sr, rng, { f: 3300, q: 4, decay: 0.003 }), 0.004, sr, 0.25);
  return mono(x);
};

// The app zooms open to fill the screen: air rushing outwards, getting wider
const launch: Recipe = (sr, rng) => {
  const T = 0.6, n = len(T, sr);
  const sweep = curve(n, sr, (t) => 280 * (5200 / 280) ** clamp(t / 0.45, 0, 1));
  const q = curve(n, sr, (t) => 1.6 - 0.8 * clamp(t / 0.45, 0, 1));
  const a = norm(svf(pink(n, rng), sr, "bp", sweep, q)), b = norm(svf(pink(n, rng), sr, "bp", sweep, q));
  const env = envelope(n, sr, [[0, 0], [0.26, 1], [0.56, 0]], 0);
  const push = norm(phoneBass(sine(n, sr, curve(n, sr, (t) => 70 - 12 * clamp(t / 0.5, 0, 1))), sr, 0.4));
  const pe = envelope(n, sr, [[0, 0], [0.2, 1], [0.5, 0]], 0);
  const L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const w = clamp(i / sr / 0.4, 0, 1); // how wide: centre to full stereo
    const mid = (a[i] + b[i]) / 2, side = ((a[i] - b[i]) / 2) * w;
    const e = env[i] * env[i];
    L[i] = (mid + side) * e + push[i] * pe[i] * 0.45;
    R[i] = (mid - side) * e + push[i] * pe[i] * 0.45;
  }
  return [L, R];
};

// The site loads: a swell sucked backwards into the title hit (like a big
// echo played in reverse), ending EXACTLY as the title lands
const load: Recipe = (sr, rng) => {
  const T = LOAD_TO_TITLE, n = len(T, sr);
  const rise = (t: number) => (Math.exp(4.5 * clamp(t / T, 0, 1)) - 1) / (Math.exp(4.5) - 1);
  const cut = curve(n, sr, (t) => 350 * (9000 / 350) ** clamp(t / T, 0, 1));
  const L = norm(svf(pink(n, rng), sr, "lp", cut, 0.8)), R = norm(svf(pink(n, rng), sr, "lp", cut, 0.8));
  const chord = overtones(sr, rng, { seconds: T, harmonics: [2, 3, 4, 5, 6], attack: 0.001, t60: 1000 });
  for (let i = 0; i < n; i++) {
    const e = rise(i / sr);
    L[i] = (L[i] + chord[i] * 0.3 * e) * e;
    R[i] = (R[i] + chord[i] * 0.3 * e) * e;
  }
  return [edges(L, sr, 0.001, 0.003), edges(R, sr, 0.001, 0.003)];
};

// STREAMERDRAFT lands: the name is called. A deep drop with a crack on top,
// the biggest floodlight clunk, the hum's chord blooming, and the press
// cameras going off round the stadium. The first four shutters land on the
// title's glitch jumps (LaunchIntro.module.css: splitA/B/C at 0, 14%, 28%,
// 45% of 0.65 s), so the glitches look like camera flashes.
const title: Recipe = (sr, rng) => {
  const n = len(3.2, sr);
  const hit = new Float32Array(len(2, sr));
  const sub = saturate(thump(sr, rng, { from: 62, to: 36, glide: 0.45, t60: 1.3, attack: 0.002 }), 1.8);
  mixInto(hit, norm(phoneBass(sub, sr, 0.5)), 0, sr, 1);
  mixInto(hit, norm(eq(burst(sr, rng, { decay: 0.025 }), sr, "highpass", 900, 0.7)), 0, sr, 0.45);
  mixInto(hit, norm(contactor(sr, rng, 1.25)), 0.004, sr, 0.75);
  const bloom = (seed: number) => {
    const b = overtones(sr, new Rng(seed), { seconds: 2.8, harmonics: [2, 3, 4, 5, 6, 8], attack: 0.03, t60: 2.2 });
    return eq(b, sr, "lowpass", 2800, 0.7);
  };
  const parts: { ch: Channels; at: number; gain: number }[] = [
    { ch: [norm(hit)], at: 0, gain: 1 },
    { ch: [norm(bloom(rng.int(1, 1e9))), norm(bloom(rng.int(1, 1e9)))], at: 0.01, gain: 0.16 },
  ];
  const glitch = [0, 0.091, 0.182, 0.293];
  const later = [0.45, 0.6, 0.74, 0.92, 1.1];
  [...glitch.slice(1), ...later].forEach((t, k) => {
    const far = k < 3 ? rng.range(0, 0.3) : rng.range(0.3, 0.8);
    parts.push({ ch: pan(shutter(sr, rng, { far }), rng.range(-0.85, 0.85)), at: t + rng.range(-0.008, 0.012), gain: 0.32 });
  });
  return mixStereo(n, parts, sr);
};

// The title shrinks into the logo: a quick breath in, and it seats with a click
const titleDock: Recipe = (sr, rng) => {
  const x = silence(0.5, sr);
  mixInto(x, air(sr, rng, { seconds: 0.23, from: 2400, to: 700, q: 1.1, shape: [[0, 0], [0.2, 1], [0.23, 0]] }), 0, sr, 0.6);
  const seat = struck(sr, rng, click(sr, rng, { f: 2100, q: 4, decay: 0.008 }), [{ f: 520, t60: 0.06, g: 1 }, { f: 1180, t60: 0.04, g: 0.6 }, { f: 2050, t60: 0.025, g: 0.3 }], 0.15);
  mixInto(x, seat, 0.22, sr, 0.6);
  mixInto(x, thump(sr, rng, { from: 180, to: 120, glide: 0.03, t60: 0.06 }), 0.22, sr, 0.35);
  return mono(x);
};

// "Nobody's watching.": the empty stadium. A gust of wind, and a lone
// floodlight humming somewhere. Quiet on purpose: it's empty.
const heroSwell: Recipe = (sr, rng) => {
  const T = 2.6, n = len(T, sr);
  const L = wind(sr, new Rng(rng.int(1, 1e9)), T), R = wind(sr, new Rng(rng.int(1, 1e9)), T);
  const lone = hum(sr, rng, { seconds: T, bright: 0.18 });
  const shape = envelope(n, sr, [[0, 0], [0.9, 1], [T, 0]], 0);
  const he = envelope(n, sr, [[0, 0], [0.4, 0.6], [T, 0]], 0);
  for (let i = 0; i < n; i++) {
    const s = shape[i] * shape[i];
    L[i] = L[i] * s + lone[i] * he[i] * 0.12;
    R[i] = R[i] * s + lone[i] * he[i] * 0.12;
  }
  return [L, R];
};

// "Yet." slams in: a punchy hit, and the stadium's main floodlights slam on
// at full power (the lights are on you now), their hum surging bright
const heroYet: Recipe = (sr, rng) => {
  const n = len(2.6, sr);
  const hit = new Float32Array(len(0.8, sr));
  mixInto(hit, norm(phoneBass(saturate(thump(sr, rng, { from: 88, to: 50, glide: 0.12, t60: 0.34, attack: 0.001 }), 2.2), sr, 0.5)), 0, sr, 1);
  mixInto(hit, norm(eq(burst(sr, rng, { decay: 0.012 }), sr, "highpass", 1500, 0.7)), 0, sr, 0.4);
  mixInto(hit, norm(contactor(sr, rng, 1.2)), 0.002, sr, 0.65);
  const surge = (seed: number) => {
    const h = hum(sr, new Rng(seed), { seconds: 2.4, bright: (t) => 1 - 0.5 * clamp(t / 2, 0, 1), rasp: 0.9 });
    return multiply(h, envelope(h.length, sr, [[0, 0], [0.03, 1], [0.4, 0.6], [2.4, 0]], -1.2));
  };
  return mixStereo(n, [{ ch: [norm(hit)], at: 0, gain: 1 }, { ch: [surge(rng.int(1, 1e9)), surge(rng.int(1, 1e9))], at: 0.02, gain: 0.3 }], sr);
};

// The page's capsules filling in: a soft seat each (step: which one)
const pagePop: Recipe = (sr, rng, o) => {
  const s = 1.06 ** (o.step ?? 0);
  const x = silence(0.2, sr);
  mixInto(x, struck(sr, rng, click(sr, rng, { f: 2600, q: 2, decay: 0.004 }), [{ f: 380 * s, t60: 0.06, g: 1 }, { f: 890 * s, t60: 0.04, g: 0.55 }, { f: 1610 * s, t60: 0.025, g: 0.3 }], 0.18), 0, sr, 0.8);
  mixInto(x, click(sr, rng, { f: 4800, q: 6, decay: 0.003 }), 0, sr, 0.15);
  return mono(x);
};

// --- The page: up close, in the booth ---

// A pop-up opens: a soft puff of air as it grows, a felt thump, and it settles
const open: Recipe = (sr, rng) => {
  const T = 0.5, n = len(T, sr);
  const cut = envelope(n, sr, [[0, 500], [0.11, 2400], [0.45, 800]], 0);
  const puff = svf(pink(n, rng), sr, "lp", cut, 0.7);
  const e = envelope(n, sr, [[0, 0], [0.1, 1], [0.45, 0]], 0);
  for (let i = 0; i < n; i++) puff[i] *= e[i] * e[i];
  const x = norm(puff);
  mixInto(x, thump(sr, rng, { from: 150, to: 100, glide: 0.03, t60: 0.07 }), 0, sr, 0.3);
  mixInto(x, click(sr, rng, { f: 2000, q: 3, decay: 0.008 }), 0.24 * rng.nudge(0.05), sr, 0.08);
  return mono(x);
};

// ...and closes: the air goes out and it sits back down
const close: Recipe = (sr, rng) => {
  const T = 0.32, n = len(T, sr);
  const cut = envelope(n, sr, [[0, 1800], [0.2, 450]], 0);
  const puff = svf(pink(n, rng), sr, "lp", cut, 0.7);
  const e = envelope(n, sr, [[0, 0], [0.03, 1], [0.2, 0]], 0);
  for (let i = 0; i < n; i++) puff[i] *= e[i] * e[i];
  const x = norm(puff);
  mixInto(x, thump(sr, rng, { from: 130, to: 95, glide: 0.025, t60: 0.05 }), 0.17, sr, 0.35);
  mixInto(x, click(sr, rng, { f: 1500, q: 2, decay: 0.006 }), 0.17, sr, 0.12);
  return mono(x);
};

// A tick box, chip or segment switched on: a little toggle switch, the
// lever's click then the snap a few thousandths later
const tickOn: Recipe = (sr, rng) => {
  const x = silence(0.12, sr);
  mixInto(x, click(sr, rng, { f: 4300, q: 8, decay: 0.004 }), 0, sr, 0.5);
  const snap = struck(sr, rng, click(sr, rng, { f: 2700, q: 5, decay: 0.006 }), [{ f: 900, t60: 0.035, g: 1 }, { f: 2100, t60: 0.02, g: 0.55 }, { f: 3400, t60: 0.012, g: 0.3 }], 0.1);
  mixInto(x, snap, rng.range(0.008, 0.013), sr, 0.8);
  return mono(x);
};

// ...switched off: lower and duller, one click
const tickOff: Recipe = (sr, rng) => {
  const x = silence(0.1, sr);
  mixInto(x, struck(sr, rng, click(sr, rng, { f: 1900, q: 4, decay: 0.006 }), [{ f: 620, t60: 0.03, g: 1 }, { f: 1450, t60: 0.018, g: 0.5 }], 0.09), 0, sr, 1);
  return mono(eq(x, sr, "lowpass", 5000, 0.7));
};

// The scout form's Continue: a solid push-button, and a little rush forward
const step: Recipe = (sr, rng) => {
  const x = silence(0.45, sr);
  mixInto(x, click(sr, rng, { f: 3100, q: 5, decay: 0.006 }), 0, sr, 0.4);
  mixInto(x, struck(sr, rng, burst(sr, rng, { decay: 0.004, lowpass: 3000 }), [{ f: 420, t60: 0.07, g: 1 }, { f: 980, t60: 0.05, g: 0.6 }, { f: 1850, t60: 0.03, g: 0.3 }], 0.2), 0.002, sr, 0.7);
  mixInto(x, air(sr, rng, { seconds: 0.4, from: 600, to: 2400, q: 1, shape: [[0, 0], [0.16, 1], [0.4, 0]] }), 0.03, sr, 0.3);
  return mono(x);
};

// Sign-up sent, the email's on its way: a flick, and it flies off to the
// right, with the hum's 4th and 5th overtones (half of the chord: the rest
// comes when they confirm)
const sent: Recipe = (sr, rng) => {
  const n = len(1.2, sr);
  const parts: { ch: Channels; at: number; gain: number }[] = [];
  parts.push({ ch: [click(sr, rng, { f: 3600, q: 6, decay: 0.005 })], at: 0, gain: 0.35 });
  const whoosh = air(sr, rng, { seconds: 0.6, from: 900, to: 4200, q: 1.2, shape: [[0, 0], [0.12, 1], [0.6, 0]] });
  parts.push({ ch: pan(whoosh, curve(whoosh.length, sr, (t) => -0.4 + 1.2 * clamp(t / 0.55, 0, 1))), at: 0.01, gain: 0.55 });
  parts.push({ ch: pan(overtones(sr, rng, { seconds: 1.1, harmonics: [4, 5], attack: 0.02, t60: 0.9 }), 0.25), at: 0.03, gain: 0.3 });
  return mixStereo(n, parts, sr);
};

// You're in: a floodlight clunks on for you, the hum blooms into its full
// chord, and two press cameras go off
const success: Recipe = (sr, rng) => {
  const n = len(2.6, sr);
  const bloom = (seed: number) => eq(overtones(sr, new Rng(seed), { seconds: 2.4, harmonics: [2, 3, 4, 5, 6, 8], attack: 0.04, t60: 2 }), sr, "lowpass", 3000, 0.7);
  return mixStereo(n, [
    { ch: [norm(contactor(sr, rng, 0.75))], at: 0, gain: 0.7 },
    { ch: [norm(bloom(rng.int(1, 1e9))), norm(bloom(rng.int(1, 1e9)))], at: 0.02, gain: 0.45 },
    { ch: pan(shutter(sr, rng, { far: 0.1 }), -0.5), at: 0.18, gain: 0.3 },
    { ch: pan(shutter(sr, rng, { far: 0.4 }), 0.6), at: 0.42, gain: 0.26 },
  ], sr);
};

// Something to fix: two knocks on wood, the second a touch lower. No buzzer.
const error: Recipe = (sr, rng) => {
  const x = silence(0.4, sr);
  const knock = (s: number) => add(
    struck(sr, rng, burst(sr, rng, { decay: 0.0015, lowpass: 3000 }), [
      { f: 180 * s, t60: 0.025, g: 0.7 }, { f: 320 * s, t60: 0.02, g: 1 }, { f: 560 * s, t60: 0.016, g: 0.8 },
      { f: 950 * s, t60: 0.012, g: 0.5 }, { f: 1600 * s, t60: 0.008, g: 0.3 },
    ], 0.12),
    scale(norm(eq(burst(sr, rng, { decay: 0.006 }), sr, "lowpass", 1200, 0.7)), 0.9),
    scale(norm(eq(burst(sr, rng, { decay: 0.0008 }), sr, "highpass", 2000, 0.7)), 0.25),
  );
  mixInto(x, norm(knock(1)), 0, sr, 1);
  mixInto(x, norm(knock(0.88)), 0.14, sr, 0.85);
  return mono(x);
};

// Your link copied: a camera shutter (captured)
const copy: Recipe = (sr, rng) => mono(shutter(sr, rng));

// Your card shared: a quick burst of two shutters and a flash's pop
const share: Recipe = (sr, rng) => {
  const n = len(0.4, sr);
  const flash = norm(eq(burst(sr, rng, { decay: 0.008 }), sr, "highpass", 4000, 0.7));
  return mixStereo(n, [
    { ch: [flash], at: 0, gain: 0.25 },
    { ch: pan(shutter(sr, rng), -0.15), at: 0.005, gain: 0.8 },
    { ch: pan(shutter(sr, rng, { far: 0.15 }), 0.2), at: 0.11, gain: 0.65 },
  ], sr);
};

// ============================ The list ============================
// lufs: how loud it's set (the loudest `window` seconds of it). The page's
// sounds sit well under the intro's; the big moments are the loudest.
// space / send: which room it echoes in, and how much.
// rate: made at this share of the sample rate. Half (24,000 a second) still
//   holds everything up to 12,000 Hz, which is all the hum, wind and rumble
//   sounds have, and makes them twice as quick to make.
// quick: cheap enough to make on the spot if it isn't ready in time.
export type Space = "stadium" | "booth";
export type Patch = { render: Recipe; lufs: number; window: number; space: Space; send: number; about: string; rate?: number; quick?: boolean };

export const PATCHES = {
  tap: { render: tap, lufs: -20, window: 0.4, space: "stadium", send: 0.5, about: "tap play: the power breaker thrown", quick: true },
  grow: { render: grow, lufs: -24, window: 0.4, space: "stadium", send: 0.3, about: "the light grows out: the floodlights warming up", rate: 0.5 },
  lap: { render: lap, lufs: -22, window: 0.4, space: "stadium", send: 0.35, about: "the light laps the screen (follows the light, left to right)", rate: 0.5 },
  bed: { render: bed, lufs: -33, window: 0.4, space: "stadium", send: 0.2, about: "under the build: night air in an empty stadium", rate: 0.5 },
  lock: { render: lock, lufs: -17, window: 0.4, space: "stadium", send: 0.55, about: "the ring locks in: three banks of floodlights clunk on", rate: 0.5 },
  home: { render: home, lufs: -31, window: 0.4, space: "booth", send: 0.3, about: "the home screen lights up", quick: true },
  dock: { render: dock, lufs: -32, window: 0.4, space: "booth", send: 0.25, about: "the dock slides up", quick: true },
  pop: { render: pop, lufs: -30, window: 0.1, space: "booth", send: 0.25, about: "each dock app pops in (from where it is)", quick: true },
  ready: { render: ready, lufs: -27, window: 0.4, space: "booth", send: 0.3, about: "our app finishes installing", quick: true },
  badge: { render: badge, lufs: -30, window: 0.1, space: "booth", send: 0.25, about: "its red badge", quick: true },
  press: { render: press, lufs: -29, window: 0.1, space: "booth", send: 0.15, about: "our app gets tapped", quick: true },
  launch: { render: launch, lufs: -24, window: 0.4, space: "stadium", send: 0.25, about: "the app zooms open" },
  load: { render: load, lufs: -23, window: 0.4, space: "stadium", send: 0.2, about: "the site loads: a reverse swell into the title" },
  title: { render: title, lufs: -15, window: 0.4, space: "stadium", send: 0.5, about: "STREAMERDRAFT lands: the hit, and the press cameras" },
  "title-dock": { render: titleDock, lufs: -28, window: 0.4, space: "booth", send: 0.25, about: "the title docks into the logo", quick: true },
  "hero-swell": { render: heroSwell, lufs: -27, window: 0.4, space: "stadium", send: 0.45, about: "“Nobody’s watching.”: wind in an empty stadium", rate: 0.5 },
  "hero-yet": { render: heroYet, lufs: -18, window: 0.4, space: "stadium", send: 0.45, about: "“Yet.”: the hit, and the main floodlights slam on full" },
  "page-pop": { render: pagePop, lufs: -33, window: 0.1, space: "booth", send: 0.2, about: "each part of the page settles in (from where it is)", quick: true },
  open: { render: open, lufs: -31, window: 0.1, space: "booth", send: 0.15, about: "a pop-up opens (from the side you tapped)", quick: true },
  close: { render: close, lufs: -33, window: 0.1, space: "booth", send: 0.12, about: "a pop-up closes", quick: true },
  "tick-on": { render: tickOn, lufs: -31, window: 0.1, space: "booth", send: 0.1, about: "a tick box, chip or segment on", quick: true },
  "tick-off": { render: tickOff, lufs: -33, window: 0.1, space: "booth", send: 0.1, about: "...and off", quick: true },
  step: { render: step, lufs: -29, window: 0.1, space: "booth", send: 0.15, about: "the scout form's Continue", quick: true },
  sent: { render: sent, lufs: -28, window: 0.4, space: "booth", send: 0.2, about: "sign-up sent: half the hum's chord, left hanging" },
  success: { render: success, lufs: -22, window: 0.4, space: "stadium", send: 0.3, about: "you're in: a light clunks on, the hum's full chord, press cameras" },
  error: { render: error, lufs: -28, window: 0.1, space: "booth", send: 0.12, about: "something to fix: two knocks on wood", quick: true },
  copy: { render: copy, lufs: -29, window: 0.1, space: "booth", send: 0.15, about: "your link copied: a camera shutter", quick: true },
  share: { render: share, lufs: -27, window: 0.1, space: "booth", send: 0.18, about: "your card shared: shutters and a flash", quick: true },
} satisfies Record<string, Patch>;

export type SoundName = keyof typeof PATCHES;
export const SOUND_NAMES = Object.keys(PATCHES) as SoundName[];

// Makes one: the recipe, then set to its loudness, ready to play
// (sr: the full sample rate; a `rate: 0.5` sound comes back at half of it,
// rateOf() says what it was made at)
export const rateOf = (name: SoundName, sr: number) => Math.round(sr * ((PATCHES[name] as Patch).rate ?? 1));
export function renderSound(name: SoundName, seed: number, sr: number, o: Options = {}): Channels {
  const patch: Patch = PATCHES[name];
  const at = rateOf(name, sr);
  const ch = patch.render(at, new Rng(seed), o);
  return finish(ch.map((c) => c.slice()), at, patch.lufs, patch.window);
}

// ============================ The two rooms ============================
// What a single clap would sound like in each (an "impulse response"); the
// engine plays every sound through one of these, so everything shares the
// same space. Built like a real room's echo: a gap, a few early reflections,
// then a dense tail where the bass lingers longest and the treble dies first.
// The stadium also has its "slap back": the echo off the far stand, a
// fifth of a second later, that only big empty stadiums have.
export function renderSpace(space: Space, seed: number, sr: number): Channels {
  const rng = new Rng(seed);
  const o = space === "stadium"
    ? { seconds: 3.4, predelay: 0.03, t60: [3.3, 2.5, 1.0], early: [0.041, 0.058, 0.077, 0.094, 0.13], slaps: [[0.21, 0.32], [0.39, 0.16]] }
    : { seconds: 0.55, predelay: 0.004, t60: [0.38, 0.3, 0.16], early: [0.003, 0.0055, 0.0081, 0.012], slaps: [] };
  const n = len(o.seconds, sr);
  const side = () => {
    const x = new Float32Array(n);
    const start = len(o.predelay, sr);
    // the tail: three bands of noise, each dying at its own speed
    const bands: [number, number, number][] = [[0, 250, o.t60[0]], [250, 3000, o.t60[1]], [3000, 20000, o.t60[2]]];
    for (const [lo, hi, t60] of bands) {
      let b = white(n - start, rng);
      if (hi < 20000) b = eq(eq(b, sr, "lowpass", hi, 0.7), sr, "lowpass", hi, 0.7);
      if (lo > 0) b = eq(eq(b, sr, "highpass", lo, 0.7), sr, "highpass", lo, 0.7);
      const e = strikeEnv(b.length, sr, 0.008, t60);
      for (let i = 0; i < b.length; i++) b[i] *= e[i];
      mixInto(x, b, o.predelay, sr, 0.5);
    }
    // the first few reflections off nearby surfaces
    for (const t of o.early) mixInto(x, scale(eq(burst(sr, rng, { decay: 0.0008 }), sr, "lowpass", 7000, 0.7), rng.range(0.5, 1.2)), t * rng.nudge(0.06), sr, 1);
    // the slap off the far stand: a smeared, darker copy
    for (const [t, g] of o.slaps) mixInto(x, scale(eq(burst(sr, rng, { decay: 0.012 }), sr, "lowpass", 2500, 0.7), 2.5), t * rng.nudge(0.03), sr, g);
    return x;
  };
  const ch: Channels = [side(), side()];
  // energy 1 in each ear, so a send of 0.3 means "30% as loud as the dry sound"
  for (const c of ch) {
    let e = 0;
    for (let i = 0; i < c.length; i++) e += c[i] * c[i];
    scale(c, 1 / Math.sqrt(e || 1));
  }
  return ch;
}

// (for the sound board and tests)
export const SPACE_NAMES: Space[] = ["stadium", "booth"];
