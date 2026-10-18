// src/components/sound/engine.ts
//
// WHAT THIS IS
// The v3 sound engine: makes the sounds (patches.ts, on a background
// thread: synth.worker.ts), keeps a few of each ready, and plays them through
// a little mixing desk:
//
//   each sound ──> its volume ──> left / right ──┬──> its bus ──────────> out
//                                                 └──> send ──> its room ─> out
//
//   buses   STAGE  the intro (a skip fades it out)
//           UI     the page's sounds (ducks right down while the voice note plays)
//   rooms   STADIUM and BOOTH: every sound echoes in a shared space, so they all
//           sound like they're in the same place (patches.ts makes the rooms)
//   out     the shared engine (soundSet.ts): one limiter, so nothing distorts
//
// WHAT'S NEW IN V3 (vs the v1 / v2 files)
//   - Nothing to download: the sounds are made in the visitor's browser.
//   - Never the same twice: as soon as one is played, a fresh one (new random
//     seed) is made to replace it.
//   - Sounds come from where things are: a pop-up opens from the side of the
//     screen you tapped; the intro's light is followed round the screen.
//   - The rooms only run while something's echoing in them (then they're
//     unplugged, so an idle page costs the phone nothing).

import { audioEngine, soundOn } from "../launch/soundSet";
import { followLight } from "./place";
import { PATCHES, rateOf, renderSound, renderSpace, type Options, type Patch, type SoundName, type Space } from "./patches";
import type { Ask, Job } from "./synth.worker";

type Ch = Float32Array[];
type Bus = "stage" | "ui";

const RENDER_RATE = 48000;
const UI_LEVEL = 0.9;
const DUCKED = 0.12; // the page's sounds while the voice note plays
const SPACES: Space[] = ["stadium", "booth"];
const seed = () => Math.floor(Math.random() * 2 ** 31);

// ================= Making sounds: on the background thread =================
type Pending = { job: Job; done: (ch: Ch | null) => void };
let worker: Worker | null | undefined; // undefined: not tried yet; null: not available here
let nextId = 1;
const pending = new Map<number, Pending>();

function startWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL("./synth.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<{ id: number; ch: Ch | null }>) => {
      const p = pending.get(event.data.id);
      pending.delete(event.data.id);
      p?.done(event.data.ch);
    };
    worker.onerror = () => {
      // It couldn't start (a very old browser, or a blocked script): make
      // everything still waiting here instead, a bit at a time
      worker = null;
      const left = [...pending.values()];
      pending.clear();
      for (const p of left) makeHere(p.job, p.done);
    };
  } catch {
    worker = null;
  }
  return worker;
}

function makeHere(job: Job, done: (ch: Ch | null) => void) {
  // (one sound per turn of the page's loop, so the page keeps moving)
  setTimeout(() => {
    try {
      done(job.kind === "sound" ? renderSound(job.name, job.seed, job.sr, job.o) : renderSpace(job.space, job.seed, job.sr));
    } catch {
      done(null);
    }
  }, 0);
}

function make(job: Ask): Promise<Ch | null> {
  return new Promise((done) => {
    const full: Job = { ...job, id: nextId++ };
    const w = startWorker();
    if (!w) return makeHere(full, done);
    pending.set(full.id, { job: full, done });
    w.postMessage(full);
  });
}

// ================= Keeping a few of each ready =================
// keyed by name (plus which step, for the pops that climb)
type Pool = { ready: Ch[]; making: number; keep: number; waiting: (() => void)[] };
const pools = new Map<string, Pool>();
const keyOf = (name: SoundName, o?: Options) => (o?.step !== undefined ? `${name}#${o.step}` : name);

function fill(name: SoundName, o: Options | undefined, pool: Pool) {
  while (pool.ready.length + pool.making < pool.keep) {
    pool.making++;
    void make({ kind: "sound", name, seed: seed(), sr: RENDER_RATE, o }).then((ch) => {
      pool.making--;
      if (!ch) return;
      pool.ready.push(ch);
      pool.waiting.shift()?.(); // something was waiting for this one
    });
  }
}

// Start making these (if they aren't ready or on their way already)
export function want(name: SoundName, o?: Options, keep = 1) {
  const key = keyOf(name, o);
  const pool = pools.get(key) ?? { ready: [], making: 0, keep, waiting: [] };
  pool.keep = Math.max(pool.keep, keep);
  pools.set(key, pool);
  fill(name, o, pool);
}

// One that's ready (and a fresh one starts being made to replace it)
function take(name: SoundName, o?: Options): Ch | null {
  const pool = pools.get(keyOf(name, o));
  if (!pool) return null;
  const ch = pool.ready.shift() ?? null;
  fill(name, o, pool);
  return ch;
}

// ================= The rooms =================
// (made at the sound engine's own sample rate: a room has to match it exactly.
// Before the first tap that's not known yet, so 48,000, the usual one; if the
// device turns out to run at another, the rooms are made again to match.)
const spaceIRs = new Map<string, Promise<Ch | null>>();
function spaceIR(space: Space, sr: number) {
  const key = `${space}@${sr}`;
  if (!spaceIRs.has(key)) spaceIRs.set(key, make({ kind: "space", space, seed: 7, sr }));
  return spaceIRs.get(key)!;
}
export function wantSpaces() {
  const sr = audioEngine()?.ctx.sampleRate ?? RENDER_RATE;
  for (const s of SPACES) void spaceIR(s, sr);
}

// ================= The mixing desk =================
type Room = { input: GainNode; out: GainNode; plugged: boolean; until: number; length: number; timer: number };
type Desk = { ctx: AudioContext; out: AudioNode; stage: GainNode; ui: GainNode; uiSend: GainNode; rooms: Record<Space, Room> };
let desk: Desk | null = null;
let ducked = false;
const playing = new Map<AudioBufferSourceNode, Bus>();

function getDesk(): Desk | null {
  const engine = audioEngine();
  if (!engine) return null;
  if (desk && desk.ctx === engine.ctx) return desk;
  const ctx = engine.ctx;
  const stage = ctx.createGain();
  stage.connect(engine.out);
  const ui = ctx.createGain();
  ui.gain.value = ducked ? DUCKED : UI_LEVEL;
  ui.connect(engine.out);
  // the page's echo ducks with the page, so it has its own way into the rooms
  const uiSend = ctx.createGain();
  uiSend.gain.value = ducked ? DUCKED : UI_LEVEL;
  const rooms = {} as Record<Space, Room>;
  for (const s of SPACES) {
    const input = ctx.createGain();
    const conv = ctx.createConvolver();
    conv.normalize = false; // (patches.ts already set each room's level)
    const out = ctx.createGain();
    input.connect(conv);
    conv.connect(out);
    const room: Room = { input, out, plugged: false, until: 0, length: 0, timer: 0 };
    rooms[s] = room;
    void spaceIR(s, ctx.sampleRate).then((ch) => {
      if (!ch) return;
      try {
        const ir = ctx.createBuffer(ch.length, ch[0].length, ctx.sampleRate);
        ch.forEach((c, k) => ir.copyToChannel(c as Float32Array<ArrayBuffer>, k));
        conv.buffer = ir;
        room.length = ir.duration;
      } catch {
        // no echo for this room: everything still plays, dry
      }
    });
  }
  uiSend.connect(rooms.booth.input);
  desk = { ctx, out: engine.out, stage, ui, uiSend, rooms };
  return desk;
}

// A room runs only while something might be echoing in it
function wake(d: Desk, space: Space, until: number) {
  const room = d.rooms[space];
  room.until = Math.max(room.until, until + room.length + 0.3);
  if (!room.plugged) {
    room.out.connect(d.out);
    room.plugged = true;
  }
  window.clearTimeout(room.timer);
  room.timer = window.setTimeout(() => {
    if (d.ctx.currentTime < room.until) return wake(d, space, room.until - room.length - 0.3);
    room.out.disconnect();
    room.plugged = false;
  }, Math.max(100, (room.until - d.ctx.currentTime) * 1000 + 50));
}

export type PlayOptions = {
  bus: Bus;
  when?: number; // on the audio clock (default: now)
  pan?: number; // -1 left ... +1 right
  gain?: number;
  o?: Options;
  follow?: "light"; // move with the intro's light (lightSpot.ts)
  lateOk?: boolean; // if it's a little late, start partway in rather than skip it
  maxLate?: number; // ...up to this many seconds late (default: a share of its length, at most 1 s)
};

// Plays one. Returns false if it wasn't ready (it's then made for next time).
export function play(name: SoundName, p: PlayOptions): boolean {
  if (typeof window === "undefined" || !soundOn()) return false;
  const d = getDesk();
  if (!d) return false;
  const patch: Patch = PATCHES[name];
  let ch = take(name, p.o);
  if (!ch) {
    // Not made yet. A quick one is made right now (a few thousandths of a
    // second); a big one that isn't ready is skipped (a late sound is worse
    // than none), and made for next time.
    if (p.bus !== "ui" && !patch.quick) {
      want(name, p.o);
      // allowed to be late: play it the moment it's made, partway in so it's
      // still in time with the picture (if it's not TOO late by then)
      if (p.lateOk) {
        const when = p.when ?? d.ctx.currentTime;
        pools.get(keyOf(name, p.o))?.waiting.push(() => play(name, { ...p, when }));
      }
      return false;
    }
    try {
      ch = renderSound(name, seed(), RENDER_RATE, p.o);
    } catch {
      return false;
    }
    want(name, p.o, 2);
  }
  const { ctx } = d;
  const buffer = ctx.createBuffer(ch.length, ch[0].length, rateOf(name, RENDER_RATE));
  ch.forEach((c, k) => buffer.copyToChannel(c as Float32Array<ArrayBuffer>, k));

  const now = ctx.currentTime;
  let when = p.when ?? now;
  let offset = 0;
  if (when < now) {
    const late = now - when;
    if (!p.lateOk || late > (p.maxLate ?? Math.min(buffer.duration * 0.4, 1))) return false;
    offset = late;
    when = now;
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const level = ctx.createGain();
  level.gain.value = p.gain ?? 1;
  source.connect(level);
  let tail: AudioNode = level;
  const nodes: AudioNode[] = [source, level];

  let tone: BiquadFilterNode | null = null;
  if (p.follow) {
    tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 9000;
    tail.connect(tone);
    tail = tone;
    nodes.push(tone);
  }
  let panner: StereoPannerNode | null = null;
  if (typeof ctx.createStereoPanner === "function" && (p.pan !== undefined || p.follow)) {
    panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, p.pan ?? 0));
    tail.connect(panner);
    tail = panner;
    nodes.push(panner);
  }
  tail.connect(p.bus === "ui" ? d.ui : d.stage);
  if (patch.send > 0) {
    const send = ctx.createGain();
    send.gain.value = patch.send;
    tail.connect(send);
    send.connect(p.bus === "ui" && patch.space === "booth" ? d.uiSend : d.rooms[patch.space].input);
    nodes.push(send);
    wake(d, patch.space, when + buffer.duration - offset);
  }

  source.start(when, offset);
  playing.set(source, p.bus);
  source.onended = () => {
    playing.delete(source);
    for (const n of nodes) n.disconnect();
  };
  if (p.follow && (tone || panner)) followLight(ctx, when, buffer.duration - offset, tone, panner);
  return true;
}

// Skip / replay: the intro's sounds fade out fast (and their echo with them)
export function stopStage(fade = 0.25) {
  const d = desk;
  if (!d) return;
  const now = d.ctx.currentTime;
  const dip = (g: AudioParam) => {
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, now + fade);
    g.setValueAtTime(1, now + fade + 0.05);
  };
  dip(d.stage.gain);
  for (const [source, bus] of playing) {
    if (bus !== "stage") continue;
    try {
      source.stop(now + fade);
    } catch {
      // already stopped
    }
  }
  // the stadium's echo too (the page's sounds don't use it much, and only
  // after the intro). Back up once what's left has died away.
  const room = d.rooms.stadium;
  room.out.gain.cancelScheduledValues(now);
  room.out.gain.setValueAtTime(room.out.gain.value, now);
  room.out.gain.linearRampToValueAtTime(0, now + fade);
  room.out.gain.setValueAtTime(1, now + fade + room.length + 0.1);
}

// The voice note is playing (true) or stopped (false): the page's sounds step aside
export function duck(on: boolean) {
  ducked = on;
  const d = desk;
  if (!d) return;
  const now = d.ctx.currentTime;
  for (const g of [d.ui.gain, d.uiSend.gain]) {
    g.cancelScheduledValues(now);
    g.setTargetAtTime(on ? DUCKED : UI_LEVEL, now, 0.08);
  }
}

export { panFor } from "./place";
