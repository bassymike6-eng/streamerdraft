// src/components/launch/sound.ts
//
// WHAT THIS IS
// The intro's sound effects, made in code with the Web Audio API (no audio files).
//
// WHY IT STARTS ON THE TAP
// Browsers block sound until the visitor clicks or taps something on the page.
// The play button IS that tap, so start() must be called inside the click handler.
//
// (Sound is on your list to rework, so this is the simple first version.)

export type SoundName = "tap" | "fill" | "home" | "press" | "launch" | "title" | "dock";

export class LaunchSound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  // Call from the play button's click handler.
  start() {
    try {
      if (!this.ctx) {
        const ctx = new AudioContext();
        const limiter = ctx.createDynamicsCompressor();
        limiter.connect(ctx.destination);
        const master = ctx.createGain();
        master.gain.value = 0.7;
        master.connect(limiter);

        // Two seconds of white noise, reused for whooshes, clicks and thuds.
        const length = Math.floor(ctx.sampleRate * 2);
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;

        this.ctx = ctx;
        this.master = master;
        this.noiseBuffer = buffer;
      }
      if (this.ctx.state === "suspended") void this.ctx.resume();
    } catch {
      this.ctx = null; // no sound, the intro still runs
    }
  }

  close() {
    void this.ctx?.close();
    this.ctx = null;
  }

  play(name: SoundName) {
    if (!this.ctx) return;
    switch (name) {
      case "tap":
        this.noise(0.03, 0.4, "highpass", 2500);
        this.tone(330, 0.9, "sine", 0.12, 660, 0.02, 0.2);
        this.noise(2.0, 0.08, "bandpass", 500, 0.1, 3200, 0.5);
        break;
      case "fill":
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, 1.6, "sine", 0.06, 0, i * 0.04, 0.08));
        break;
      case "home":
        this.noise(0.5, 0.08, "bandpass", 1500, 0, 400, 0.12);
        break;
      case "press":
        this.noise(0.025, 0.35, "highpass", 3000);
        this.tone(1200, 0.04, "triangle", 0.06, 700);
        break;
      case "launch":
        this.noise(0.55, 0.16, "bandpass", 400, 0, 2600, 0.08);
        break;
      case "title":
        this.tone(140, 1.0, "sine", 0.7, 32);
        this.noise(0.4, 0.4, "lowpass", 1600, 0, 100);
        this.noise(0.6, 0.05, "highpass", 6000, 0.05, 3000);
        break;
      case "dock":
        this.noise(0.6, 0.1, "bandpass", 2400, 0, 500, 0.1);
        break;
    }
  }

  // ---- building blocks ----

  // A volume shape: silent -> peak -> silent.
  private envelope(gain: GainNode, t: number, peak: number, attack: number, duration: number) {
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  }

  // A pitched note that can slide from freq to freqEnd.
  private tone(freq: number, duration: number, type: OscillatorType, peak: number, freqEnd = 0, delay = 0, attack = 0) {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, t + duration);
    this.envelope(gain, t, peak, attack || Math.min(0.015, duration / 3), duration);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  // Filtered noise: whooshes, clicks and thuds.
  private noise(duration: number, peak: number, kind: BiquadFilterType, freq: number, delay = 0, freqEnd = 0, attack = 0) {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noiseBuffer) return;
    const t = ctx.currentTime + delay;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = kind;
    filter.frequency.setValueAtTime(freq, t);
    if (freqEnd) filter.frequency.exponentialRampToValueAtTime(freqEnd, t + duration);
    const gain = ctx.createGain();
    this.envelope(gain, t, peak, attack || 0.008, duration);
    source.connect(filter).connect(gain).connect(this.master);
    source.start(t);
    source.stop(t + duration + 0.05);
  }
}
