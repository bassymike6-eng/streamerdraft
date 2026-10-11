// src/components/launch/LaunchIntro.tsx
//
// WHAT THIS IS
// The F1 intro, start to finish:
//   black screen + play button -> the light laps the screen edge -> home screen
//   -> our app opens out of its icon -> browser loads -> STREAMERDRAFT
//   -> it docks top left -> the page's loading placeholders.
//
// HOW IT'S BUILT
// This file only keeps track of WHERE we are (the phase) and WHAT the visitor
// is on. All the movement is CSS (LaunchIntro.module.css), driven by:
//   - data attributes on the root (data-dev, data-look, data-on="tap fill ...")
//   - CSS custom properties from geometry.ts (sizes and positions)
// The running order and timings are in timeline.ts.
//
// WHY "use client"
// It needs the browser: the screen size, the user agent, the clock, clicks and sound.

"use client";

import { Anton } from "next/font/google";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { AppWindow } from "./AppWindow";
import { applyUrlOverrides, detectVisitor, prefersReducedMotion, type Visitor } from "./detect";
import { DevPanel } from "./DevPanel";
import { computeGeometry, geometryVars, type Geometry } from "./geometry";
import { HomeScreen } from "./HomeScreen";
import { GlyphDefs } from "./icons";
import { SkeletonPage } from "./SkeletonPage";
import { LaunchSound, type SoundName } from "./sound";
import { IDLE_LAP_MS, PHASE_TIMES, reachedPhases, type Phase } from "./timeline";
import { Wordmark } from "./Wordmark";
import styles from "./LaunchIntro.module.css";

const anton = Anton({ weight: "400", subsets: ["latin"], variable: "--font-anton" });

const SHOW_DEV_PANEL = process.env.NODE_ENV !== "production";

// Which sound plays as each phase starts ("tap" plays on the click itself).
const PHASE_SOUND: Partial<Record<Phase, SoundName>> = {
  fill: "fill", home: "home", press: "press", launch: "launch", title: "title", dock: "dock",
};

type Setup = { visitor: Visitor; geometry: Geometry; now: Date };

function makeSetup(visitor: Visitor): Setup {
  return { visitor, geometry: computeGeometry(visitor.device, visitor.dockStyle, visitor.forced), now: new Date() };
}

const two = (n: number) => String(n).padStart(2, "0");
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function LaunchIntro() {
  // null until we're in the browser (the server can't know the visitor's device or clock)
  const [setup, setSetup] = useState<Setup | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [a0, setA0] = useState(0); // where the light was on the ring at the tap
  const [run, setRun] = useState(0); // bumping this restarts every animation from scratch

  const timers = useRef<number[]>([]);
  const idleStart = useRef(0);
  const sound = useRef<LaunchSound | null>(null);

  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };

  // ---- On load: work out the visitor, then keep the sizes right if the window changes ----
  useEffect(() => {
    const visitor = applyUrlOverrides(detectVisitor(), window.location.search);
    idleStart.current = performance.now();
    // Deferred one frame so React renders the plain black screen first.
    const frame = requestAnimationFrame(() => {
      setSetup(makeSetup(visitor));
      if (prefersReducedMotion()) setPhase("done");
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!setup) return;
    const onResize = () => setSetup((s) => (s ? { ...s, geometry: computeGeometry(s.visitor.device, s.visitor.dockStyle, s.visitor.forced) } : s));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [setup]);

  // Clean up timers and sound if the component goes away.
  useEffect(() => () => {
    clearTimers();
    sound.current?.close();
  }, []);

  // ---- The tap that starts everything ----
  // Runs from the play button AND from the full-screen tap layer, so a tap
  // anywhere on the black screen starts it.
  const play = useCallback(() => {
    if (phase !== "idle") return;
    // The setup is normally ready a frame after load. If someone taps inside that
    // very first frame, work the visitor out right here instead of ignoring the tap.
    const visitor = setup?.visitor ?? applyUrlOverrides(detectVisitor(), window.location.search);

    // Sound has to start inside the click, or the browser blocks it.
    sound.current ??= new LaunchSound();
    sound.current.start();
    sound.current.play("tap");

    // Carry the light on from wherever it is on the ring right now.
    const lapsSoFar = (performance.now() - idleStart.current) / IDLE_LAP_MS;
    setA0(Math.round((lapsSoFar % 1) * 360));
    setSetup(makeSetup(visitor)); // fresh sizes and clock
    setPhase("tap");

    clearTimers();
    for (const { phase: next, at } of PHASE_TIMES) {
      timers.current.push(
        window.setTimeout(() => {
          setPhase(next);
          const name = PHASE_SOUND[next];
          if (name) sound.current?.play(name);
        }, at * 1000)
      );
    }
  }, [phase, setup]);

  const skip = () => {
    clearTimers();
    setPhase("done");
  };

  const replay = useCallback(() => {
    clearTimers();
    idleStart.current = performance.now();
    setRun((r) => r + 1);
    setPhase("idle");
  }, []);

  // Dev panel: switch device / look / source, then start again.
  const changeVisitor = (visitor: Visitor) => {
    setSetup(makeSetup(visitor));
    replay();
  };

  // ---- Render ----
  const visitor = setup?.visitor;
  const geometry = setup?.geometry;
  const now = setup?.now;
  const vars = (geometry ? geometryVars(geometry, a0) : {}) as CSSProperties;

  return (
    <div
      className={`${styles.root} ${anton.variable}`}
      data-dev={visitor?.device ?? "phone"}
      data-dock={visitor?.dockStyle ?? "dock"}
      data-src={visitor?.source ?? "browser"}
      data-look={visitor?.look ?? "dark"}
      data-framed={geometry?.framed ? "true" : "false"}
      data-phase={phase}
      data-on={reachedPhases(phase)}
      style={vars}
    >
      <GlyphDefs />

      <div key={run} className={styles.screen}>
        {visitor && now && (
          <>
            <HomeScreen
              device={visitor.device}
              clock={`${two(now.getHours())}:${two(now.getMinutes())}`}
              dateLong={`${DAYS[now.getDay()]} ${now.getDate()} ${MONTHS[now.getMonth()]}`}
              dateShort={`${DAYS[now.getDay()].slice(0, 3)} ${now.getDate()} ${MONTHS[now.getMonth()].slice(0, 3)}`}
            />
            <div className={styles.touch} aria-hidden="true" />
            <div className={styles.cursor} aria-hidden="true">
              <svg viewBox="0 0 22 28"><path d="M2 2 L2 23 L7.5 17.8 L11.4 26 L15 24.4 L11.2 16.4 L19 16.2 Z" fill="#fff" stroke="#111" strokeWidth="1.6" strokeLinejoin="round" /></svg>
            </div>
            <AppWindow />
            <SkeletonPage />
            <Wordmark />
          </>
        )}

        {/* Invisible layer over the whole idle screen: a tap anywhere starts the
            intro, not just a tap on the button. It sits just under the button and
            disappears once the intro starts. aria-hidden because keyboard and
            screen-reader users already have the real button. */}
        <div className={styles.tapLayer} onClick={play} aria-hidden="true" />

        {/* The light: round the play button first, then round the whole screen */}
        <div className={styles.halo} aria-hidden="true">
          <span className={`${styles.ring} ${styles.ringSoft}`} />
          <span className={`${styles.ring} ${styles.ringCore}`} />
          <span className={`${styles.ring} ${styles.ringFullSoft}`} />
          <span className={`${styles.ring} ${styles.ringFull}`} />
        </div>

        <button className={styles.go} type="button" aria-label="Play intro" onClick={play}>
          <svg viewBox="0 0 30 30" aria-hidden="true"><path d="M10 6.5v17a1.2 1.2 0 0 0 1.8 1l13-8.5a1.2 1.2 0 0 0 0-2l-13-8.5a1.2 1.2 0 0 0-1.8 1z" fill="#fff" /></svg>
        </button>
        <p className={styles.hint}>Tap to start</p>

        <button className={styles.skip} type="button" onClick={skip}>Skip intro</button>
        <button className={styles.replay} type="button" onClick={replay}>Replay</button>
      </div>

      {SHOW_DEV_PANEL && visitor && <DevPanel visitor={visitor} onChange={changeVisitor} />}
    </div>
  );
}