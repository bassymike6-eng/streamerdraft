// src/components/page/VoiceNote.tsx
//
// WHAT THIS IS
// The founder voice note, as a Dynamic Island: a black capsule with
//   your avatar | "Why I built it" | 4 bars | the time | play
//
// Tap it and it plays, island-style:
//   - the 4 bars move with your voice (still and level when it's not playing)
//   - the time counts down from 0:40
//   - the capsule grows to show ONE line of captions inside it. Each line
//     replaces the last (the old one floats up and out, the new one rises in),
//     for anyone watching on mute (lots of people browse inside TikTok and IG on mute)
//   - its red light becomes a progress line, filling round the capsule as it plays
// Tap again to pause. Left/right arrow keys skip 5 seconds.
//
// "Read it instead" grows the island itself into the whole script (Sheet.tsx): nothing on
// the page moves. The capsule's room on the page is fixed too: when it grows,
// it grows over the "Read it instead" line, not into the things below it.
//
// It never plays by itself, only when the visitor presses it.
// The audio, loudness and captions all come from founderNote.ts.

import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { prefersReducedMotion } from "@/components/launch/detect";
import { setAudioSession } from "@/components/launch/soundSet";
import { captionLines, FOUNDER_NOTE, levelAt, transcript } from "./founderNote";
import { Sheet, sheetOrder, slot } from "./Sheet";
import { duckUiSounds } from "./uiSound";
import s from "./Page.module.css";

// 75.4 -> "1:15"
const clock = (seconds: number) => {
  const whole = Math.max(0, Math.ceil(seconds - 0.05));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
};

// --n: when this part fills in, in order (REVEAL in timeline.ts)
const order = (n: number) => ({ "--n": n }) as CSSProperties;

// ---- The 4 bars ----
// Each bar follows the voice's loudness, a moment apart and at its own
// strength, plus a little wobble of its own: so they move together but never
// in lockstep (like the bars in the Dynamic Island's now playing).
const BAR_REST = 7; // px: all four, level, when it's not playing
const BAR_MAX = 24; // px: the tallest they get
const BAR_LAG = [0.09, 0, 0.05, 0.13]; // seconds behind the voice
const BAR_STRENGTH = [0.72, 1, 0.88, 0.62];
const BAR_WOBBLE = [7.1, 5.3, 6.2, 8.4]; // Hz

export function VoiceNote({ n }: { n: number }) {
  const note = FOUNDER_NOTE;
  const lines = useMemo(() => captionLines(note.captions), [note]);
  const paragraphs = useMemo(() => transcript(note.captions), [note]);

  const audio = useRef<HTMLAudioElement>(null);
  const light = useRef<HTMLCanvasElement>(null);
  const island = useRef<HTMLButtonElement>(null); // "Read it instead" grows out of it
  const bars = useRef<(HTMLElement | null)[]>([]);

  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false); // played at least a bit (so: show the time left)
  const [left, setLeft] = useState(note.duration); // whole seconds left, for the time
  const [line, setLine] = useState(-1); // which caption line is showing
  const [duration, setDuration] = useState(note.duration);
  const [reading, setReading] = useState(false);

  // The progress line round the capsule (useBoxLights.ts draws it)
  const showProgress = (seconds: number) => {
    const total = audio.current?.duration || duration;
    if (light.current) light.current.dataset.progress = String(Math.min(1, seconds / total));
  };

  // Where we are: the time left, the caption line, the progress line.
  // Only sets state when the second or the line actually changes (not every frame).
  const follow = (seconds: number) => {
    const total = audio.current?.duration || duration;
    setLeft(Math.max(0, total - seconds));
    // the latest line that's started: it stays up through the little pause before
    // the next one (real speech has gaps; the caption shouldn't blink off in them)
    // (a plain count rather than findLastIndex, which older iPhones don't have)
    setLine(lines.reduce((latest, c, i) => (seconds >= c.start ? i : latest), -1));
    showProgress(seconds);
  };

  // Every frame while it plays: the bars, the time, the caption and the progress line
  useEffect(() => {
    if (!playing) {
      // back to four still, level bars (the CSS eases them down)
      for (const bar of bars.current) bar?.style.removeProperty("height");
      return;
    }
    const reduced = prefersReducedMotion();
    const heights = [BAR_REST, BAR_REST, BAR_REST, BAR_REST];
    let frame = 0;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const a = audio.current;
      if (!a) return;
      const t = a.currentTime;
      follow(t);
      if (reduced) return; // reduced motion: the bars stay still
      bars.current.forEach((bar, i) => {
        if (!bar) return;
        const voice = levelAt(note.levels, t - BAR_LAG[i]) * BAR_STRENGTH[i];
        const wobble = voice > 0.05 ? 0.14 * Math.sin((now / 1000) * BAR_WOBBLE[i] * Math.PI * 2) : 0;
        const target = BAR_REST + (BAR_MAX - BAR_REST) * Math.min(1, Math.max(0, voice + wobble));
        // up fast, down slower: how real level meters move
        heights[i] += (target - heights[i]) * (target > heights[i] ? 0.55 : 0.2);
        bar.style.height = `${heights[i].toFixed(1)}px`;
      });
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // follow only uses refs and setters, so it doesn't need to restart this
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  const play = () => {
    // It's media they chose to play, so on an iPhone it plays even on silent
    // (like a video), and the page's little sounds step aside while it does
    setAudioSession("playback");
    void audio.current?.play().catch(() => setPlaying(false)); // e.g. the file failed to load
  };
  const toggle = () => {
    const a = audio.current;
    if (!a) return;
    if (a.paused) play();
    else a.pause();
  };
  const skip = (by: number) => {
    const a = audio.current;
    if (!a) return;
    a.currentTime = Math.min(Math.max(0, a.currentTime + by), (a.duration || duration) - 0.05);
    setStarted(true);
    follow(a.currentTime);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight") skip(5);
    else if (e.key === "ArrowLeft") skip(-5);
    else return;
    e.preventDefault();
  };
  const reset = () => {
    setStarted(false);
    setLine(-1);
    setLeft(duration);
    if (audio.current) audio.current.currentTime = 0;
    if (light.current) delete light.current.dataset.progress; // back to the running light
  };

  const now = lines[line];
  const before = line > 0 ? lines[line - 1] : undefined;
  const label = playing
    ? "Pause the voice note"
    : started
      ? "Resume the voice note"
      : `Play the voice note: why I built StreamerDraft, ${clock(duration)}`;

  return (
    <div className={s.voice} data-open={playing || undefined}>
      <audio
        ref={audio}
        src={note.src}
        preload="metadata"
        onLoadedMetadata={(e) => {
          const seconds = e.currentTarget.duration || note.duration;
          setDuration(seconds);
          if (!started) setLeft(seconds);
        }}
        onPlay={() => {
          setPlaying(true);
          setStarted(true);
          duckUiSounds(true);
        }}
        onPause={() => {
          setPlaying(false);
          duckUiSounds(false);
        }}
        onEnded={() => {
          setPlaying(false);
          duckUiSounds(false);
          reset();
        }}
      />

      <button
        ref={island}
        type="button"
        className={`${s.slot} ${s.slotBox} ${s.island}`}
        style={order(n)}
        data-pop={n}
        onClick={toggle}
        onKeyDown={onKey}
        aria-label={label}
      >
        <canvas ref={light} className={s.boxLight} data-box-light="" aria-hidden="true" />
        <span className={`${s.inside} ${s.islandBody}`}>
        <span className={s.islandRow} aria-hidden="true">
          <span className={s.avatar}>BM</span>
          <span className={s.islandText}>
            <span className={s.islandTitle}>Why I built it</span>
            <span className={s.islandWho}>Bassy Mike</span>
          </span>
          <span className={s.bars}>
            {[0, 1, 2, 3].map((i) => (
              <i key={i} ref={(el) => { bars.current[i] = el; }} />
            ))}
          </span>
          <span className={s.islandTime}>{clock(started ? left : duration)}</span>
          <span className={s.playGlyph}>
            {playing ? (
              <svg viewBox="0 0 18 18"><rect x="4" y="3" width="3.6" height="12" rx="1.3" /><rect x="10.4" y="3" width="3.6" height="12" rx="1.3" /></svg>
            ) : (
              <svg viewBox="0 0 20 20"><path d="M6.5 4.2v11.6a1 1 0 0 0 1.5.86l9.2-5.8a1 1 0 0 0 0-1.72L8 3.34a1 1 0 0 0-1.5.86z" /></svg>
            )}
          </span>
        </span>
        {/* One caption line. The keys make the old line and the new one separate
            elements, so the old one can float out while the new one rises in.
            Hidden from screen readers: they get the whole script from "Read it instead". */}
        <span className={s.islandCaption} aria-hidden="true">
          {before && <span key={line - 1} className={s.captionOut}>{before.text}</span>}
          {now && <span key={line} className={s.captionIn}>{now.text}</span>}
        </span>
        </span>
      </button>

      <button type="button" className={`${s.slot} ${s.slotText} ${s.readIt}`} style={order(n)} onClick={() => setReading(true)}>
        Read it instead
      </button>

      <Sheet
        open={reading}
        onClose={() => setReading(false)}
        origin={island}
        title="Why I built StreamerDraft"
        subtitle="Bassy Mike's voice note, written out"
        footer={
          <button
            type="button"
            className={`${slot.box} ${s.listen}`}
            style={sheetOrder(2 + paragraphs.length)}
            onClick={() => {
              setReading(false);
              play(); // straight from the tap, so the browser lets it play
            }}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6.5 4.2v11.6a1 1 0 0 0 1.5.86l9.2-5.8a1 1 0 0 0 0-1.72L8 3.34a1 1 0 0 0-1.5.86z" /></svg>
            Listen instead
          </button>
        }
      >
        {paragraphs.map((p, i) => (
          <p key={p} className={slot.text} style={sheetOrder(2 + i)}>{p}</p>
        ))}
      </Sheet>
    </div>
  );
}
