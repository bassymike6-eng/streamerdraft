// src/components/launch/sound.ts
//
// WHAT THIS IS
// Plays the intro's sounds (the files in public/sounds/) in time with the
// animation. WHICH sound plays WHEN is in soundCues.ts.
//
// HOW IT STAYS IN SYNC
//   - preload() downloads and decodes every file while the visitor is still on
//     the play button, so nothing has to load once the intro starts.
//   - Each scene's sounds are timed on the audio clock (exact to the sample),
//     counted from the moment that scene starts.
//   - MP3s begin with a few milliseconds of silence, and browsers don't all
//     handle it the same way. sounds.json records where each sound really
//     starts; we measure the same point in the decoded file and skip the
//     difference, so a click lands on the exact frame in every browser.
//   - If a file is still decoding when its moment comes (a very fast tap on a
//     slow connection), it starts partway in, still in sync; a short sound
//     that's too late is skipped rather than played late.
//
// WHY IT STARTS ON THE TAP
// Browsers block sound until the visitor taps or clicks something. The play
// button IS that tap, so start() must be called inside its click handler.
//
// WHY IT PLAYS EVEN WHEN AN IPHONE IS ON SILENT
// By default iPhones treat web sound as "ambient" (like a game's sound effects),
// and the silent switch mutes ambient sound. A video, though, is "playback",
// which plays on silent with the volume buttons in charge. The visitor tapped
// Play, so we ask to be treated like a video:
//   - Safari 16.4 and newer: navigator.audioSession.type = "playback"
//   - older iPhones: play a silent <audio> clip while the intro runs
// Side effect: like starting a video, it may pause music the visitor has on.

import type { Device } from "./detect";
import { cuesFor, MIX, SOUND_NAMES, type SoundName } from "./soundCues";
import manifest from "./sounds.json";
import { PHASE_TIMES, type Phase } from "./timeline";

// When the intro has finished (plus time for the last sounds to ring out).
const INTRO_END = (PHASE_TIMES[PHASE_TIMES.length - 1]?.at ?? 10) + 4;

// A tenth of a second of silence (a tiny WAV file written out as text), for older iPhones.
const SILENT_WAV = "data:audio/wav;base64,UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YSADAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==";

const MASTER = 0.9; // overall volume

type AudioSessionNavigator = Navigator & { audioSession?: { type: string } };
type Manifest = { onsetDb: number } & Record<string, { onset: number; length: number } | number | string>;

// A decoded sound, and how much silence its start seemed to have (see the top)
type Loaded = { buffer: AudioBuffer; gap: number };

// The silence a browser adds to the start of an MP3 is the same for every
// file, but measuring it on one file can be thrown off a little (very sharp
// sounds like a click smear slightly before themselves when made into an MP3).
// So we measure every file and use the middle value.
function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

const isIOS = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

// Seconds until the decoded sound first gets within onsetDb of its loudest
// point: the same measurement scripts/render-sounds.py made on the original.
function measureOnset(buffer: AudioBuffer, onsetDb: number): number {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
  let peak = 0;
  for (const data of channels) for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
  const threshold = peak * 10 ** (onsetDb / 20);
  for (let i = 0; i < buffer.length; i++) {
    for (const data of channels) if (Math.abs(data[i]) >= threshold) return i / buffer.sampleRate;
  }
  return 0;
}

export class LaunchSound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sounds = new Map<SoundName, Promise<Loaded | null>>();
  private gaps: number[] = []; // the start gap measured on each decoded file
  private playing = new Set<AudioBufferSourceNode>();
  private run = 0; // goes up on every start and stop, so sounds from an old run never play
  private silentClip: HTMLAudioElement | null = null;
  private silentTimer = 0;

  // ---- Before the tap: download and decode everything (no sound plays) ----
  preload() {
    if (this.sounds.size) return;
    // An offline context can decode without a tap, and without the browser
    // warning that a live one was created before the visitor did anything.
    let decoder: BaseAudioContext | null = null;
    try {
      decoder = new OfflineAudioContext(2, 1, 48000);
    } catch {
      decoder = null; // very old browser: we'll decode once the live one exists
    }
    for (const name of SOUND_NAMES) this.sounds.set(name, this.load(name, decoder));
  }

  private async load(name: SoundName, decoder: BaseAudioContext | null): Promise<Loaded | null> {
    try {
      const response = await fetch(`/sounds/${name}.mp3`);
      if (!response.ok) return null;
      const data = await response.arrayBuffer();
      const ctx = decoder ?? (await this.liveContext());
      if (!ctx) return null;
      const buffer = await ctx.decodeAudioData(data);
      const info = (manifest as Manifest)[name];
      const expected = typeof info === "object" ? info.onset : 0;
      const gap = Math.min(Math.max(measureOnset(buffer, (manifest as Manifest).onsetDb) - expected, 0), 0.1);
      this.gaps.push(gap);
      return { buffer, gap };
    } catch {
      return null; // that one sound is missing; the intro still runs
    }
  }

  // Waits for the tap to have made the live audio context (for old browsers only)
  private async liveContext(): Promise<AudioContext | null> {
    for (let i = 0; i < 600 && !this.ctx; i++) await new Promise((r) => setTimeout(r, 50));
    return this.ctx;
  }

  // ---- The tap: call from the play button's click handler ----
  start() {
    this.playEvenOnSilent(); // before any sound is made
    this.preload(); // in case it hasn't started yet
    this.run++;
    try {
      if (!this.ctx) {
        const ctx = new AudioContext();
        // A safety limiter at the end, so overlapping sounds can never distort
        const limiter = ctx.createDynamicsCompressor();
        limiter.threshold.value = -3;
        limiter.knee.value = 3;
        limiter.ratio.value = 12;
        limiter.attack.value = 0.002;
        limiter.release.value = 0.2;
        limiter.connect(ctx.destination);
        const master = ctx.createGain();
        master.connect(limiter);
        this.ctx = ctx;
        this.master = master;
      }
      if (this.ctx.state === "suspended") void this.ctx.resume();
      this.master!.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master!.gain.setValueAtTime(MASTER, this.ctx.currentTime);
    } catch {
      this.ctx = null; // no sound, the intro still runs
    }
  }

  // ---- Each scene: play its sounds (soundCues.ts), timed from now ----
  cue(phase: Phase, device: Device) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const cue of cuesFor(phase, device)) {
      const gain = MIX[cue.sound];
      if (gain > 0) void this.play(cue.sound, now + (cue.at ?? 0), gain, cue.rate ?? 1);
    }
  }

  private async play(name: SoundName, when: number, gain: number, rate: number) {
    const run = this.run;
    const loaded = await this.sounds.get(name);
    const ctx = this.ctx;
    if (!loaded || !ctx || !this.master || run !== this.run) return;
    // skip the browser's start gap (the middle value across all files, or this
    // file's own if it's the only one measured so far)
    let offset = this.gaps.length >= 3 ? median(this.gaps) : loaded.gap;
    let startAt = when;
    const late = ctx.currentTime - when;
    if (late > 0) {
      // Still decoding when its moment came: start partway in to stay in sync,
      // unless it's so late (or so short) that it would just sound wrong.
      const length = loaded.buffer.duration / rate;
      if (late > Math.min(length * 0.4, 1)) return;
      offset += late * rate;
      startAt = ctx.currentTime;
    }
    const source = ctx.createBufferSource();
    source.buffer = loaded.buffer;
    source.playbackRate.value = rate;
    const level = ctx.createGain();
    level.gain.value = gain;
    source.connect(level).connect(this.master);
    source.start(startAt, offset);
    this.playing.add(source);
    source.onended = () => {
      this.playing.delete(source);
      level.disconnect();
    };
  }

  // ---- Skip / replay: fade everything out quickly and cancel what's coming ----
  stop(fade = 0.25) {
    this.run++;
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const now = ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(0, now + fade);
    for (const source of this.playing) {
      try {
        source.stop(now + fade + 0.02);
      } catch {
        // already stopped
      }
    }
    window.clearTimeout(this.silentTimer);
    this.silentClip?.pause();
  }

  close() {
    this.run++;
    void this.ctx?.close();
    this.ctx = null;
    window.clearTimeout(this.silentTimer);
    this.silentClip?.pause();
  }

  // Asks to be "playback" (like a video) so the iPhone silent switch doesn't mute us.
  private playEvenOnSilent() {
    const session = (navigator as AudioSessionNavigator).audioSession;
    if (session) {
      try {
        session.type = "playback"; // Safari 16.4+
        return;
      } catch {
        // not allowed here: try the older way below
      }
    }
    if (!isIOS()) return; // only iPhones and iPads need the older way
    this.silentClip ??= Object.assign(new Audio(SILENT_WAV), { loop: true });
    void this.silentClip.play().catch(() => {}); // no luck: the intro still runs, just maybe muted
    // Stop it once the intro is over, so it doesn't sit there "playing".
    window.clearTimeout(this.silentTimer);
    this.silentTimer = window.setTimeout(() => this.silentClip?.pause(), INTRO_END * 1000);
  }
}
