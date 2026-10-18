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
// WHICH VERSION, AND SOUND OFF
// The files come from the version soundSet.ts picks (v5, or v2 / v1 with
// ?sounds=v2 / ?sounds=v1). If the visitor has turned sound off (the footer's Sound
// button), the intro plays silently. The audio engine is shared with the
// page's own sounds (uiSound.ts), so the page can use it once the intro's over.
//
// WHY IT PLAYS EVEN WHEN AN IPHONE IS ON SILENT
// By default iPhones treat web sound as "ambient" (like a game's sound effects),
// and the silent switch mutes ambient sound. A video, though, is "playback",
// which plays on silent with the volume buttons in charge. The visitor tapped
// Play, so we ask to be treated like a video:
//   - Safari 16.4 and newer: navigator.audioSession.type = "playback"
//   - older iPhones: play a silent <audio> clip while the intro runs
// Side effect: like starting a video, it may pause music the visitor has on.
// Once the intro's over it goes back to "ambient" (see soundSet.ts), so the
// page's little sounds behave like an app's: the silent switch mutes them.

import type { Device } from "./detect";
import { cuesFor, introNames, MIX, type SoundName } from "./soundCues";
import { followLight } from "../sound/place";
import { holdPlaybackSession, releasePlaybackSession, soundManifest, soundOn, soundUrl, unlockAudio } from "./soundSet";
import { PHASE_TIMES, type Phase } from "./timeline";

// When the intro has finished (plus time for the last sounds to ring out).
const INTRO_END = (PHASE_TIMES[PHASE_TIMES.length - 1]?.at ?? 10) + 4;

const MASTER = 0.9; // overall volume

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
    for (const name of introNames()) this.sounds.set(name, this.load(name, decoder));
  }

  private async load(name: SoundName, decoder: BaseAudioContext | null): Promise<Loaded | null> {
    try {
      const response = await fetch(soundUrl(name));
      if (!response.ok) return null;
      const data = await response.arrayBuffer();
      const ctx = decoder ?? (await this.liveContext());
      if (!ctx) return null;
      const buffer = await ctx.decodeAudioData(data);
      const manifest = soundManifest() as unknown as Manifest;
      const info = manifest[name];
      const expected = typeof info === "object" ? info.onset : 0;
      const gap = Math.min(Math.max(measureOnset(buffer, manifest.onsetDb) - expected, 0), 0.1);
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
    // The engine is made here either way (this IS the tap), so the page's
    // sounds can use it later, even if the visitor has sound off right now
    const engine = unlockAudio();
    this.run++;
    if (!soundOn() || !engine) {
      this.ctx = null; // sound off: the intro runs silently
      return;
    }
    holdPlaybackSession(INTRO_END); // before any sound is made (see the top)
    this.preload(); // in case it hasn't started yet
    try {
      if (!this.ctx) {
        const master = engine.ctx.createGain();
        master.connect(engine.out);
        this.ctx = engine.ctx;
        this.master = master;
      }
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
      const gain = MIX[cue.sound] * (cue.gain ?? 1);
      if (gain > 0) void this.play(cue.sound, now + (cue.at ?? 0), gain, cue.rate ?? 1, cue.pan, cue.follow);
    }
  }

  // pan: where it comes from (-1 left ... +1 right); follow: move with the light
  private async play(name: SoundName, when: number, gain: number, rate: number, pan?: number, follow?: "light") {
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
    source.connect(level);
    let out: AudioNode = level;
    let panner: StereoPannerNode | null = null;
    if ((pan !== undefined || follow) && typeof ctx.createStereoPanner === "function") {
      panner = ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan ?? 0));
      level.connect(panner);
      out = panner;
    }
    out.connect(this.master);
    source.start(startAt, offset);
    if (follow && panner) followLight(ctx, startAt, (loaded.buffer.duration - offset) / rate, null, panner);
    this.playing.add(source);
    source.onended = () => {
      this.playing.delete(source);
      level.disconnect();
      panner?.disconnect();
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
    releasePlaybackSession();
  }

  close() {
    // (the engine itself stays: it's shared with the page's sounds)
    this.run++;
    this.master?.disconnect();
    this.master = null;
    this.ctx = null;
    releasePlaybackSession();
  }
}
