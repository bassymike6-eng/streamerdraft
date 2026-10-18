// src/components/launch/LaunchIntro.tsx
//
// WHAT THIS IS
// The F1 intro, start to finish:
//   black screen + play button -> the red light grows out to the screen edge
//   -> home screen -> our app opens out of its icon -> browser loads
//   -> STREAMERDRAFT -> it docks top left as the logo -> the page loads in
//   (the page itself: src/components/page/SitePage.tsx).
//
// HOW IT'S BUILT
// This file only keeps track of WHERE we are (the phase) and WHAT the visitor
// is on. The movement is CSS (LaunchIntro.module.css), driven by:
//   - data attributes on the root (data-dev, data-look, data-on="tap fill ...")
//   - CSS custom properties from geometry.ts (sizes and positions)
// except the red light, which EdgeLight.tsx draws frame by frame.
// The running order and timings are in timeline.ts.
//
// WHY "use client"
// It needs the browser: the screen size, the user agent, the clock, clicks and sound.

"use client";

import { Anton } from "next/font/google";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { BRAND_FONT, DEFAULT_WORD_BOX, fontStack, FONTS, isFontId, measureWord, titleText, type FontId, type WordBox } from "@/lib/brand-font";
import { AppWindow } from "./AppWindow";
import { applyUrlOverrides, detectVisitor, prefersReducedMotion, type Visitor } from "./detect";
import { DevPanel } from "./DevPanel";
import { EdgeLight } from "./EdgeLight";
import { computeGeometry, geometryVars, type Geometry } from "./geometry";
import { HomeScreen } from "./HomeScreen";
import { SitePage, type PageStage } from "@/components/page/SitePage";
import { LaunchSoundV3 } from "../sound/launch";
import { LaunchSound } from "./sound";
import { isLiveSet } from "./soundSet";
import { homeVars, PHASE_TIMES, reachedPhases, type Phase } from "./timeline";
import { LogoMark, Wordmark } from "./Wordmark";
import styles from "./LaunchIntro.module.css";

// The intro's sound player: v3 (made live) or the v1 / v2 files (soundSet.ts).
// Both have the same five controls.
type IntroSound = Pick<LaunchSound, "preload" | "start" | "cue" | "stop" | "close">;
const makeSound = (): IntroSound => (isLiveSet() ? new LaunchSoundV3() : new LaunchSound());

// Anton: the fallback under the brand font (and the brand font itself while BRAND_FONT is "anton")
const anton = Anton({ weight: "400", subsets: ["latin"], variable: "--font-anton" });

const SHOW_DEV_PANEL = process.env.NODE_ENV !== "production";

type Setup = { visitor: Visitor; geometry: Geometry; now: Date };

// The brand font being shown, and how the title is written in it
export type FontPick = { id: FontId; text: string };

// The title's measured shape in that font (and whether its file loaded)
type Word = { box: WordBox; loaded: boolean };

// wordRatio: the title's width / height in the brand font (see the measuring below)
function geometryFor(v: Visitor, wordRatio: number) {
  return computeGeometry(v.device, v.dockStyle, v.forced, wordRatio);
}

// Where the page is at, from the intro's phase: hidden until the title docks,
// loading boxes while it docks, then the real content once the intro's done.
function pageStage(phase: Phase): PageStage {
  if (phase === "done") return "content";
  if (phase === "dock") return "skeleton";
  return "hidden";
}

function makeSetup(visitor: Visitor, wordRatio: number): Setup {
  return { visitor, geometry: geometryFor(visitor, wordRatio), now: new Date() };
}

export default function LaunchIntro() {
  // null until we're in the browser (the server can't know the visitor's device or clock)
  const [setup, setSetup] = useState<Setup | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [run, setRun] = useState(0); // bumping this restarts every animation from scratch
  const [font, setFont] = useState<FontPick>({ id: BRAND_FONT, text: FONTS[BRAND_FONT].text });
  const [word, setWord] = useState<Word>({ box: DEFAULT_WORD_BOX, loaded: true });

  const root = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);
  const sound = useRef<IntroSound | null>(null);
  // The title's width / height in the brand font. A ref, so the size maths
  // (done in effects and click handlers, not while rendering) always gets the latest one.
  const wordRatio = useRef(DEFAULT_WORD_BOX.width / DEFAULT_WORD_BOX.height);

const two = (n: number) => String(n).padStart(2, "0");
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };

  // ---- On load: work out the visitor, then keep the sizes right if the window changes ----
  useEffect(() => {
    const visitor = applyUrlOverrides(detectVisitor(), window.location.search);
    // Testing fonts: ?font=paperbreak and ?case=caps|mixed (the Dev panel writes these)
    const params = new URLSearchParams(window.location.search);
    const fontParam = params.get("font");
    const caseParam = params.get("case");
    // Deferred one frame so React renders the plain black screen first.
    const frame = requestAnimationFrame(() => {
      setSetup(makeSetup(visitor, wordRatio.current));
      if (prefersReducedMotion()) setPhase("done");
      if (isFontId(fontParam) || caseParam) {
        const id = isFontId(fontParam) ? fontParam : BRAND_FONT;
        setFont({ id, text: titleText(id, caseParam) });
      }
    });
    // Download and decode the sounds while the visitor's on the play button
    // (a moment after the page shows, so they don't slow the first paint).
    const preload = window.setTimeout(() => {
      if (prefersReducedMotion()) return; // no intro, so no sounds
      sound.current ??= makeSound();
      sound.current.preload();
    }, 300);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(preload);
    };
  }, []);

  useEffect(() => {
    if (!setup) return;
    const onResize = () => setSetup((s) => (s ? { ...s, geometry: geometryFor(s.visitor, wordRatio.current) } : s));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [setup]);

  // ---- Measure the title in the brand font, whenever the font or its text changes ----
  // Waits for the font file to load first. Then the title's box and the size
  // maths both use the real shape of the word (see brand-font.ts).
  useEffect(() => {
    if (!root.current) return;
    let cancelled = false;
    // The font-family list as the browser resolved it (a canvas can't read CSS variables)
    const stack = getComputedStyle(root.current).getPropertyValue("--font-display").trim();
    measureWord(stack, FONTS[font.id].family, font.text).then((result) => {
      if (cancelled) return;
      wordRatio.current = result.box.width / result.box.height;
      setWord(result);
      setSetup((s) => (s ? { ...s, geometry: geometryFor(s.visitor, wordRatio.current) } : s));
    });
    return () => {
      cancelled = true;
    };
  }, [font]);

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
    // Each scene's sounds are in soundCues.ts.
    sound.current ??= makeSound();
    sound.current.start();
    sound.current.cue("tap", visitor.device);

    setSetup(makeSetup(visitor, wordRatio.current)); // fresh sizes and clock
    setPhase("tap");

    clearTimers();
    for (const { phase: next, at } of PHASE_TIMES) {
      timers.current.push(
        window.setTimeout(() => {
          setPhase(next);
          sound.current?.cue(next, visitor.device);
        }, at * 1000)
      );
    }
  }, [phase, setup]);

  const skip = () => {
    clearTimers();
    sound.current?.stop(); // a quick fade, not a hard cut
    setPhase("done");
  };

  const replay = useCallback(() => {
    clearTimers();
    sound.current?.stop();
    setRun((r) => r + 1);
    setPhase("idle");
  }, []);

  // Dev panel: switch device / look / source, then start again.
  const changeVisitor = (visitor: Visitor) => {
    setSetup(makeSetup(visitor, wordRatio.current));
    replay();
  };

  // Dev panel: try another font (it's measured, then the intro starts again)
  const changeFont = (pick: FontPick) => {
    setFont(pick);
    replay();
  };

  // ---- Render ----
  const visitor = setup?.visitor;
  const geometry = setup?.geometry;
  const now = setup?.now;
  // The brand font and the home screen's beat timings (always), plus every
  // size and position (once we're in the browser)
  const vars = {
    "--font-display": fontStack(font.id),
    ...homeVars(),
    ...(geometry ? geometryVars(geometry) : {}),
  } as CSSProperties;

  return (
    <div
      ref={root}
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
      <div key={run} className={styles.screen}>
        {visitor && now && (
          <>
            <HomeScreen
              device={visitor.device}
              wide={geometry ? geometry.W > geometry.H : false}
              clock={`${two(now.getHours())}:${two(now.getMinutes())}`}
              dateShort={`${DAYS[now.getDay()]} ${now.getDate()} ${MONTHS[now.getMonth()]}`}
            />
            <div className={styles.touch} aria-hidden="true" />
            <div className={styles.cursor} aria-hidden="true">
              <svg viewBox="0 0 22 28"><path d="M2 2 L2 23 L7.5 17.8 L11.4 26 L15 24.4 L11.2 16.4 L19 16.2 Z" fill="#fff" stroke="#111" strokeWidth="1.6" strokeLinejoin="round" /></svg>
            </div>
            <AppWindow />
            <div className={`${styles.layer} ${styles.site}`}>
              {/* the docked title's twin, which the page keeps as its logo */}
              <SitePage stage={pageStage(phase)} logo={<LogoMark text={font.text} box={word.box} />} />
            </div>
            <Wordmark text={font.text} box={word.box} />
          </>
        )}

        {/* Invisible layer over the whole idle screen: a tap anywhere starts the
            intro, not just a tap on the button. It sits just under the button and
            disappears once the intro starts. aria-hidden because keyboard and
            screen-reader users already have the real button. */}
        <div className={styles.tapLayer} onClick={play} aria-hidden="true" />

        {/* The red light: round the play button first, then round the whole screen */}
        <EdgeLight phase={phase} edgeRadius={geometry?.edgeRadius ?? 0} />

        <button className={styles.go} type="button" aria-label="Play intro" onClick={play}>
          <svg viewBox="0 0 30 30" aria-hidden="true"><path d="M10 6.5v17a1.2 1.2 0 0 0 1.8 1l13-8.5a1.2 1.2 0 0 0 0-2l-13-8.5a1.2 1.2 0 0 0-1.8 1z" fill="currentColor" /></svg>
        </button>
        <p className={styles.hint}>Tap to start</p>

        <button className={styles.skip} type="button" onClick={skip}>Skip intro</button>
        {/* Replay: only while we work on it (npm run dev). On the live site it would sit
            on top of the page; a "watch the intro again" link can go in the footer (F4). */}
        {SHOW_DEV_PANEL && <button className={styles.replay} type="button" onClick={replay}>Replay</button>}
      </div>

      {SHOW_DEV_PANEL && visitor && (
        <DevPanel visitor={visitor} onChange={changeVisitor} font={font} fontLoaded={word.loaded} onFont={changeFont} />
      )}
    </div>
  );
}
