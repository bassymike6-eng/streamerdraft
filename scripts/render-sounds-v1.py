"""
scripts/render-sounds.py

WHAT THIS IS
Makes every sound in the intro from scratch (no samples, so no licences) and
saves them as small MP3s in public/sounds/. The intro plays them in time with
the animation (src/components/launch/soundCues.ts says which plays when).

    python scripts/render-sounds.py public/sounds

Needs Python with numpy, scipy and lameenc:  pip install numpy scipy lameenc
Add --wav to also save WAV copies (handy for listening in an audio editor).

THE SOUND
Everything is in D major, so the chimes, risers and hits all sound like one
piece. The intro is one long build and release:
  tap -> whoosh out to the edge -> a riser while the light laps the screen
  -> the ring LOCKS IN (first payoff) -> calm home screen with little UI
  sounds -> click -> the app zooms open -> a reverse swell -> STREAMERDRAFT
  lands with a big hit (second, bigger payoff) -> it swooshes into place.

HOW A SOUND IS BUILT
Each one is a few layers added together, the way sound designers stack them:
  transient  the first few milliseconds (a click, a crack): what makes it feel tight
  body       the tone or thump that gives it weight
  air        filtered noise: whooshes, breath, sparkle
  space      reverb, so it sits in a room instead of in your ear
Then it's levelled so the loudest moment of the intro is the title hit.

TIMINGS
Some sounds have to fit an animation exactly. These come from
src/components/launch/timeline.ts and LaunchIntro.module.css. If you change
those, change them here too and re-run this script.
"""

import os
import sys

import numpy as np
from scipy.signal import butter, fftconvolve, sosfilt

SR = 48000  # samples per second
rng = np.random.default_rng(7)  # fixed seed: re-running gives the same sounds

# ---- Timings from the intro (seconds) ----
GROW = 1.3  # LED.grow: the light growing from the button to the screen edge
EDGE_LAP = 2.4  # LED.edgeLap: the light's lap of the screen edge
LOAD = 0.65  # load phase -> title phase (PHASE_TIMES)
SPLIT = 0.65  # the title copies splitting and snapping together (splitA in the CSS)
SPLIT_KEYS = [0.14, 0.28, 0.45, 0.65]  # its keyframes, as a share of SPLIT
SPLIT_X = [10, -12, 4, -2]  # where the white copy is at each keyframe (px): + right, - left
TITLE_DOCK = 0.8  # titleDock: the title shrinking into the top-left corner
HERO_YET = 0.85  # REVEAL.yet: "Yet." slams in this long after "Nobody's watching." starts

# ---- Notes (D major) ----
NOTE = {
    "D1": 36.71, "A1": 55.00, "D2": 73.42, "A2": 110.00, "D3": 146.83, "E3": 164.81,
    "F#3": 185.00, "A3": 220.00, "B3": 246.94, "C#4": 277.18, "D4": 293.66, "E4": 329.63,
    "F#4": 369.99, "A4": 440.00, "B4": 493.88, "D5": 587.33, "E5": 659.26, "F#5": 739.99,
    "A5": 880.00, "D6": 1174.66, "E6": 1318.51, "F#6": 1479.98, "A6": 1760.00,
    "D7": 2349.32, "E7": 2637.02, "F#7": 2959.96, "A7": 3520.00, "D8": 4698.64,
}


# =========================================================================
# Building blocks
# =========================================================================

def n(seconds):
    """How many samples are in this many seconds."""
    return int(round(seconds * SR))


def times(seconds):
    """The time (in seconds) of every sample in a clip this long."""
    return np.arange(n(seconds)) / SR


def stereo(seconds):
    """A silent stereo clip: shape (2, samples), row 0 = left, row 1 = right."""
    return np.zeros((2, n(seconds)))


def add(dst, src, at=0.0, gain=1.0):
    """Mixes src into dst starting at `at` seconds (mono src goes to both sides)."""
    if src.ndim == 1:
        src = np.vstack([src, src])
    start = n(at)
    end = min(dst.shape[1], start + src.shape[1])
    if end > start:
        dst[:, start:end] += src[:, : end - start] * gain
    return dst


def db(x):
    """Decibels to a volume multiplier: -6 dB is about half."""
    return 10 ** (x / 20)


def pan(mono, position):
    """Places a mono sound left (-1) to right (+1). position can change over time."""
    angle = (np.asarray(position) + 1) * np.pi / 4  # equal-power, so it doesn't dip in the middle
    return np.vstack([mono * np.cos(angle), mono * np.sin(angle)])


def decay(t, tau):
    """Fades from 1 towards 0. tau = how many seconds it takes to drop to about a third."""
    return np.exp(-t / tau)


def attack(t, seconds):
    """Rises smoothly from 0 to 1 over `seconds` (a quarter sine, no click)."""
    return np.sin(0.5 * np.pi * np.clip(t / max(seconds, 1e-6), 0, 1))


def ease_in_out(u):
    """The same curve as easeInOut in EdgeLight.tsx (slow, fast, slow)."""
    u = np.clip(u, 0, 1)
    return np.where(u < 0.5, 4 * u**3, 1 - (-2 * u + 2) ** 3 / 2)


def fade_edges(x, fade_in=0.002, fade_out=0.02):
    """Tiny fades at the very start and end so nothing clicks."""
    x = x.copy()
    a, b = n(fade_in), n(fade_out)
    if a:
        x[..., :a] *= np.linspace(0, 1, a)
    if b:
        x[..., -b:] *= np.linspace(1, 0, b)
    return x


# ---- Oscillators ----

def phase_of(freq, seconds):
    """Running phase (radians) for a frequency that can glide over time."""
    f = np.broadcast_to(np.asarray(freq, dtype=float), (n(seconds),))
    return 2 * np.pi * np.cumsum(f) / SR


def sine(freq, seconds, phase0=0.0):
    return np.sin(phase_of(freq, seconds) + phase0)


def saw(freq, seconds):
    """A bright sawtooth with its harsh aliasing smoothed off (PolyBLEP)."""
    f = np.broadcast_to(np.asarray(freq, dtype=float), (n(seconds),))
    dt = f / SR
    p = np.cumsum(dt) % 1.0
    p = (p + rng.random()) % 1.0
    y = 2 * p - 1
    # soften the jump at each wrap-around
    m = p < dt
    t = p[m] / dt[m]
    y[m] -= t + t - t * t - 1
    m = p > 1 - dt
    t = (p[m] - 1) / dt[m]
    y[m] -= t * t + t + t + 1
    return y


def supersaw(freq, seconds, cents=8, voices=3):
    """Several slightly detuned saws: the wide, lush synth sound."""
    out = np.zeros(n(seconds))
    for i in range(voices):
        offset = (i - (voices - 1) / 2) / max((voices - 1) / 2, 1) * cents
        out += saw(np.asarray(freq) * 2 ** (offset / 1200), seconds)
    return out / voices


def bell(freq, seconds, length=1.2, bright=1.0, detune_cents=0.0):
    """A glass / bell note: a few overtones that each fade at their own speed."""
    t = times(seconds)
    f = freq * 2 ** (detune_cents / 1200)
    partials = [(1.0, 1.0), (2.0, 0.42), (3.01, 0.2 * bright), (4.12, 0.12 * bright), (5.43, 0.07 * bright), (6.79, 0.04 * bright)]
    out = np.zeros_like(t)
    for ratio, amp in partials:
        if f * ratio > 18000:
            continue
        out += amp * np.sin(2 * np.pi * f * ratio * t + rng.random() * 6.28) * decay(t, length / ratio**0.75)
    return ring_out(out * attack(t, 0.002))


def pluck(freq, seconds, length=0.14):
    """A short, round plucked note (like a soft marimba)."""
    t = times(seconds)
    out = np.sin(2 * np.pi * freq * t) + 0.3 * np.sin(4 * np.pi * freq * t) * decay(t, length * 0.5)
    out += 0.12 * np.sin(6 * np.pi * freq * t) * decay(t, length * 0.3)
    return ring_out(out * decay(t, length) * attack(t, 0.0012))


def ring_out(x):
    """Fades the last fifth of a clip to silence, so a note that's still ringing
    when its clip ends dies away instead of stopping dead (which clicks)."""
    k = max(1, min(x.shape[-1] // 5, n(0.4)))
    x = x.copy()
    x[..., -k:] *= np.cos(np.linspace(0, np.pi / 2, k)) ** 2
    return x


# ---- Noise and filters ----

def white(seconds):
    return rng.standard_normal(n(seconds))


def pink(seconds):
    """Noise with less hiss than white noise: sounds like air rather than static."""
    x = white(seconds)
    spectrum = np.fft.rfft(x)
    freqs = np.fft.rfftfreq(len(x), 1 / SR)
    spectrum[1:] /= np.sqrt(freqs[1:])
    spectrum[0] = 0
    y = np.fft.irfft(spectrum, len(x))
    return y / (np.std(y) + 1e-12)


def svf(x, cutoff, q=0.7, mode="band"):
    """
    A filter whose cutoff can sweep over time (that's what makes a whoosh move).
    mode: "low" keeps the lows, "high" the highs, "band" a band around the cutoff.
    """
    count = len(x)
    fc = np.clip(np.broadcast_to(np.asarray(cutoff, dtype=float), (count,)), 20, SR * 0.45)
    g = np.tan(np.pi * fc / SR)
    k = 1.0 / q
    a1 = 1.0 / (1.0 + g * (g + k))
    a2 = g * a1
    a3 = g * a2
    low = np.empty(count)
    band = np.empty(count)
    ic1 = ic2 = 0.0
    xs = x.tolist()
    a1s, a2s, a3s = a1.tolist(), a2.tolist(), a3.tolist()
    for i in range(count):
        v3 = xs[i] - ic2
        v1 = a1s[i] * ic1 + a2s[i] * v3
        v2 = ic2 + a2s[i] * ic1 + a3s[i] * v3
        ic1 = 2 * v1 - ic1
        ic2 = 2 * v2 - ic2
        low[i] = v2
        band[i] = v1
    if mode == "low":
        return low
    if mode == "band":
        return band * k  # normalised so the peak of the band is about 1
    return x - k * band - low


def lowpass(x, hz, order=2):
    return sosfilt(butter(order, hz, "low", fs=SR, output="sos"), x)


def highpass(x, hz, order=2):
    return sosfilt(butter(order, hz, "high", fs=SR, output="sos"), x)


def bandpass(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], "band", fs=SR, output="sos"), x)


# ---- Character ----

def saturate(x, drive=2.0):
    """Gentle tape-style warmth. On a low sound it adds overtones, which is what
    lets phone speakers (which can't play deep bass) still 'hear' the thump."""
    return np.tanh(drive * x) / np.tanh(drive)


def crush(x, bits=6, hold=10):
    """Lo-fi digital grit: fewer sample steps and fewer volume steps (the glitch sound)."""
    held = np.repeat(x[::hold], hold)[: len(x)]
    steps = 2 ** (bits - 1)
    return np.round(held * steps) / steps


def widen(x, amount=1.0):
    """Makes a stereo sound wider (amount > 1) or narrower (< 1)."""
    mid = (x[0] + x[1]) / 2
    side = (x[0] - x[1]) / 2 * amount
    return np.vstack([mid + side, mid - side])


# ---- Space ----

def impulse(rt60=1.8, predelay=0.02, bright=0.5, seed=1):
    """
    The 'fingerprint' of a room (an impulse response): a burst of noise that dies
    away. rt60 = seconds for the echo to fade out. Highs fade faster than lows,
    like a real room. Left and right are different, which makes it sound wide.
    """
    r = np.random.default_rng(seed)
    length = predelay + rt60 * 1.15
    t = times(length)
    ir = np.zeros((2, len(t)))
    for ch in range(2):
        noise = r.standard_normal(len(t))
        tail = lowpass(noise, 2800) * np.exp(-6.9 * t / rt60)  # -60 dB over rt60
        sparkle = highpass(noise, 2800) * np.exp(-6.9 * t / (rt60 * (0.25 + 0.45 * bright)))
        body = tail + bright * sparkle
        body *= attack(t, 0.03)
        # a few early reflections, like nearby walls
        for delay, gain in [(0.011, 0.5), (0.019, 0.35), (0.027, 0.3), (0.041, 0.2)]:
            j = n(delay + 0.003 * ch)
            if j < len(body):
                body[j] += gain * (1 if r.random() > 0.5 else -1)
        ir[ch] = np.concatenate([np.zeros(n(predelay)), body])[: len(t)]
    return ir / np.sqrt(np.sum(ir**2) / 2)


def reverb(x, wet=0.25, rt60=1.8, predelay=0.02, bright=0.5, seed=1):
    """Puts a sound in a room. Returns a clip long enough for the echo to ring out."""
    if x.ndim == 1:
        x = np.vstack([x, x])
    x = ring_out(x)  # nothing going into the room stops dead
    ir = impulse(rt60, predelay, bright, seed)
    wet_l = fftconvolve(x[0], ir[0])
    wet_r = fftconvolve(x[1], ir[1])
    out = np.zeros((2, len(wet_l)))
    out[:, : x.shape[1]] += x * (1 - wet * 0.5)
    out[0] += wet_l * wet * 0.35
    out[1] += wet_r * wet * 0.35
    return out


def reverse_swell(x, seconds, rt60=2.5, seed=3):
    """
    The classic 'sucking in' swell before a hit: the echo of a sound, played
    backwards, so it rises INTO the moment the sound starts.
    """
    if x.ndim == 1:
        x = np.vstack([x, x])
    ir = impulse(rt60, 0.0, 0.8, seed)
    wet = np.vstack([fftconvolve(x[0], ir[0]), fftconvolve(x[1], ir[1])])[:, ::-1]
    wet = wet[:, -n(seconds):]
    return wet / (np.max(np.abs(wet)) + 1e-12)


# ---- Finishing ----

def finish(x, peak_db, fade_out=0.03, keep=None):
    """Removes rumble below hearing, cuts the silent end off, levels the peak.
    keep: exact length in seconds (for sounds that must end on a set moment)."""
    if x.ndim == 1:
        x = np.vstack([x, x])
    x = np.vstack([highpass(x[0], 22, 2), highpass(x[1], 22, 2)])
    if keep is not None:
        x = x[:, : n(keep)]
    else:
        # cut once the echo has died to 66 dB below the peak (inaudible), so
        # nobody downloads seconds of silence
        level = np.max(np.abs(x), axis=0)
        loud = np.nonzero(level > np.max(level) * db(-66))[0]
        end = min(x.shape[1], (loud[-1] if len(loud) else x.shape[1]) + n(0.05))
        x = x[:, :end]
        fade_out = max(fade_out, 0.05)
    x = fade_edges(x, 0.0005, fade_out)
    peak = np.max(np.abs(x)) + 1e-12
    return x * (db(peak_db) / peak)


# =========================================================================
# The sounds, in the order they play
# =========================================================================

def tap():
    """The play button: a crisp click, a tactile 'tock' and a little glass spark."""
    out = stereo(1.4)
    t = times(0.06)
    click = bandpass(white(0.06), 2500, 9000) * decay(t, 0.0011)
    tick = np.sin(2 * np.pi * (2400 - 400 * t / 0.06) * t) * decay(t, 0.006)
    t2 = times(0.25)
    tock = np.sin(phase_of(110 + 130 * decay(t2, 0.012), 0.25)) * decay(t2, 0.05)
    tock = saturate(tock * 1.2, 1.6)
    spark = (bell(NOTE["D6"], 1.3, 0.35, 0.6, -3) + 0.7 * bell(NOTE["A6"], 1.3, 0.3, 0.5, 3)) * 0.5
    add(out, click, 0, db(-6))
    add(out, tick, 0, db(-16))
    add(out, tock, 0, db(-3))
    add(out, pan(spark, 0.15), 0.004, db(-20))
    return finish(reverb(out, 0.18, 0.7, 0.008, 0.7), -7)


def grow():
    """The light growing from the button out to the screen edge (1.3 s, slow-fast-slow).
    A whoosh whose loudness follows the light's speed, getting wider as it spreads."""
    length = GROW + 0.6
    t = times(length)
    u = np.clip(t / GROW, 0, 1)
    shape = ease_in_out(u)
    speed = np.gradient(shape, t)
    speed = speed / speed.max()
    level = (0.12 + 0.88 * speed**1.2) * np.where(t < GROW, 1.0, decay(t - GROW, 0.18))
    level *= attack(t, 0.04)
    cutoff = 240 * 15 ** shape  # 240 Hz -> 3.6 kHz as it grows
    width = 0.1 + 0.9 * shape  # mono at the button, wide at the edges
    a, b = pink(length), pink(length)
    left = svf(a, cutoff, 1.3, "band")
    right = svf(a * (1 - width) + b * width, cutoff * 1.03, 1.3, "band")
    whoosh = np.vstack([left, right]) * level
    air = np.vstack([highpass(white(length), 6500), highpass(white(length), 6500)]) * (speed**2 * level) * 0.35
    # a soft rising tone underneath: energy building
    glide = NOTE["D3"] * 2**shape
    tone = (np.sin(phase_of(glide, length)) + 0.5 * np.sin(phase_of(glide * 1.5, length))) * level
    sub = saturate(np.sin(phase_of(46 + 27 * shape, length)) * level, 1.8)
    out = stereo(length)
    add(out, whoosh, 0, db(0))
    add(out, air, 0, db(-6))
    add(out, tone, 0, db(-26))
    add(out, sub, 0, db(-17))
    return finish(reverb(out, 0.2, 1.2, 0.01, 0.6, 4), -9, 0.15)


def lock_layers():
    """The ring completing (used by lock() and by the swell that leads into it)."""
    seconds = 3.4
    t = times(seconds)
    chord = [("D5", -0.35, 0), ("A5", 0.3, 1.0), ("D6", -0.1, 0.4), ("E6", 0.45, 0.7)]
    out = stereo(seconds)
    for name, where, cents in chord:
        note = bell(NOTE[name], seconds, 1.5, 0.8, cents) + bell(NOTE[name], seconds, 1.5, 0.8, -cents)
        add(out, pan(note, where), 0, db(-6))
    strike = highpass(white(0.03), 5000) * decay(times(0.03), 0.003)
    add(out, strike, 0, db(-14))
    thump = saturate(np.sin(phase_of(52 + 45 * decay(t, 0.04), seconds)) * decay(t, 0.17), 2.2)
    add(out, thump, 0, db(-1))
    warm = np.sin(2 * np.pi * NOTE["D3"] * t) * decay(t, 0.25) * attack(t, 0.004)
    add(out, warm, 0, db(-12))
    return out


def lap():
    """The light's lap of the screen edge (2.4 s): a riser that builds the tension,
    then drops to silence a hair before the ring locks in."""
    length = EDGE_LAP
    t = times(length)
    u = t / length
    build = u**1.8
    # a lush pad rising from the 'five' chord (A) towards home (D): it wants to resolve
    pad = np.zeros(len(t))
    for name in ["E4", "A4", "E5"]:
        pad += supersaw(NOTE[name] * 2 ** (u**1.6 * 2 / 12), length, 9, 3)
    pad = svf(pad, 500 * 10 ** (u**1.4), 0.9, "low") * (0.25 + 0.75 * build)
    # filtered noise that pulses faster and faster: the 'charging up' feel
    rate = 4 + 15 * u**1.5
    pulse = 0.55 + 0.45 * np.sin(2 * np.pi * np.cumsum(rate) / SR) ** 2
    hiss = svf(white(length), 700 * 11 ** u, 0.8, "high") * build * pulse
    # sparkles that get denser, like the light leaving a trail
    sparkles = stereo(length)
    sparkle_notes = [NOTE["D7"], NOTE["E7"], NOTE["F#7"], NOTE["A7"], NOTE["D8"]]
    when = 0.0
    while when < length - 0.12:
        density = 4 + 26 * (when / length) ** 1.5
        when += rng.exponential(1 / density)
        ping = bell(sparkle_notes[rng.integers(len(sparkle_notes))], 0.25, 0.05, 0.3)
        add(sparkles, pan(ping, rng.uniform(-0.8, 0.8)), when, db(-14) * (0.4 + 0.6 * when / length))
    # the lock's own echo, backwards, swelling in over the last moments
    swell = reverse_swell(lock_layers(), 0.9)
    out = stereo(length)
    add(out, widen(np.vstack([pad, np.roll(pad, 37)]), 1.3), 0, db(-14))
    add(out, np.vstack([hiss, np.roll(hiss, 91)]), 0, db(-15))
    add(out, sparkles, 0, db(-4))
    add(out, swell, length - 0.9, db(-11))
    sub = saturate(np.sin(2 * np.pi * NOTE["D2"] * t) * build**2, 1.6)
    add(out, sub, 0, db(-18))
    # the drop: 70 ms of silence right before the lock, so it lands hard
    gate = np.clip((length - 0.07 - t) / 0.025, 0, 1)
    out *= gate
    return finish(out, -8, 0.0, keep=length)  # must end exactly when the ring locks


def lock():
    """The ring completing: a glass chord, a sub thump and a bloom of reverb."""
    return finish(reverb(lock_layers(), 0.34, 2.6, 0.018, 0.7, 5), -4, 0.4)


def home():
    """The home screen appearing: a soft swell, like a phone unlocking."""
    length = 2.2
    t = times(length)
    whoosh_t = times(0.6)
    sweep = svf(pink(0.6), 2400 * (500 / 2400) ** np.clip(whoosh_t / 0.45, 0, 1), 1.1, "band")
    sweep *= attack(whoosh_t, 0.06) * decay(np.maximum(whoosh_t - 0.1, 0), 0.14)
    pad = np.zeros(len(t))
    for name in ["D3", "A3", "E4", "F#4", "C#4"]:
        f = NOTE[name]
        pad += np.sin(2 * np.pi * f * t) + 0.25 * np.sin(4 * np.pi * f * t)
    pad = lowpass(pad, 1800) * attack(t, 0.22) * decay(np.maximum(t - 0.25, 0), 0.5)
    fwump = np.sin(phase_of(68 + 55 * decay(times(0.3), 0.05), 0.3)) * decay(times(0.3), 0.08)
    out = stereo(length)
    add(out, widen(np.vstack([sweep, np.roll(sweep, 53)]), 1.4), 0, db(-4))
    add(out, widen(np.vstack([pad, np.roll(pad, 211)]), 1.2), 0, db(-18))
    add(out, saturate(fwump, 1.5), 0, db(-9))
    return finish(reverb(out, 0.4, 1.8, 0.02, 0.5, 6), -13, 0.3)


def dock():
    """The dock rising in: a short upward swish that settles."""
    length = 0.8
    t = times(length)
    rise = np.clip(t / 0.32, 0, 1)
    swish = svf(pink(length), 350 * (1500 / 350) ** (1 - (1 - rise) ** 2), 1.2, "band")
    swish *= attack(t, 0.05) * decay(np.maximum(t - 0.14, 0), 0.1)
    thup = np.sin(phase_of(120 + 40 * decay(times(0.12), 0.02), 0.12)) * decay(times(0.12), 0.03)
    out = stereo(length)
    add(out, widen(np.vstack([swish, np.roll(swish, 29)]), 1.2), 0)
    add(out, thup, 0.31, db(-12))
    return finish(reverb(out, 0.2, 0.8, 0.01, 0.5, 7), -17, 0.1)


def pop():
    """One app popping into the dock: a tiny bubble. The intro plays it once per
    app, each a step higher, so the dock fills up like a little arpeggio."""
    length = 0.3
    t = times(length)
    f = NOTE["A5"] * (1 + 0.9 * decay(t, 0.012))
    body = np.sin(phase_of(f, length)) * decay(t, 0.035) * attack(t, 0.001)
    body += 0.2 * np.sin(2 * phase_of(f, length)) * decay(t, 0.015)
    return finish(reverb(body, 0.15, 0.6, 0.005, 0.6, 8), -18, 0.05)


def ready():
    """Our app finishing its install: a pop as the icon jumps out of the glass,
    then a bright chime with a sprinkle of sparkles."""
    length = 1.8
    t = times(length)
    bloop_t = times(0.15)
    bloop = np.sin(phase_of(320 + 260 * (1 - decay(bloop_t, 0.02)), 0.15)) * decay(bloop_t, 0.045) * attack(bloop_t, 0.002)
    chime = bell(NOTE["A6"], length, 0.7, 0.7, 2) + 0.85 * bell(NOTE["D7"], length, 0.6, 0.6, -2)
    out = stereo(length)
    add(out, saturate(bloop, 1.3), 0, db(-6))
    add(out, pan(chime, 0.1), 0.02, db(-8))
    for i in range(10):
        f = [NOTE["E7"], NOTE["F#7"], NOTE["A7"], NOTE["D8"]][i % 4] * (1 + rng.uniform(-0.004, 0.004))
        add(out, pan(bell(f, 0.3, 0.07, 0.3), rng.uniform(-0.9, 0.9)), 0.03 + i * 0.025 + rng.uniform(0, 0.012), db(-17 - i * 0.6))
    return finish(reverb(out, 0.35, 1.6, 0.012, 0.8, 9), -9, 0.4)


def badge():
    """The red '1' badge appearing: a quick two-note pluck, like a notification."""
    length = 0.5
    out = stereo(length)
    add(out, pan(pluck(NOTE["E6"], length, 0.12), -0.1), 0, db(-3))
    add(out, pan(pluck(NOTE["A6"], length, 0.16), 0.15), 0.07, db(0))
    tick = highpass(white(0.01), 4000) * decay(times(0.01), 0.0015)
    add(out, tick, 0, db(-18))
    return finish(reverb(out, 0.25, 1.0, 0.01, 0.7, 10), -12, 0.2)


def press():
    """Our app being tapped or clicked: a premium two-stage click (press, then release)."""
    length = 0.4
    out = stereo(length)

    def click(center, tick_hz, depth):
        t = times(0.05)
        crack = bandpass(white(0.05), center * 0.6, min(center * 1.8, 20000)) * decay(t, 0.0012)
        ping = np.sin(2 * np.pi * tick_hz * t) * decay(t, 0.005)
        thock = np.sin(phase_of(140 + 90 * decay(t, 0.008), 0.05)) * decay(t, 0.02)
        return crack * 0.9 + ping * 0.25 + thock * depth

    add(out, saturate(click(3200, 1400, 0.9), 1.4), 0, db(0))
    add(out, click(5200, 2300, 0.25), 0.075, db(-8))  # the release: lighter and higher
    return finish(reverb(out, 0.1, 0.5, 0.004, 0.6, 11), -8, 0.1)


def launch():
    """The app zooming open from its icon (0.7 s, fast start): a whoosh that opens
    up wide, with a bloom of low end."""
    length = 1.2
    t = times(length)
    open_ = np.clip(t / 0.4, 0, 1)
    level = attack(t, 0.025) * decay(np.maximum(t - 0.09, 0), 0.22)
    cutoff = 500 * (5200 / 500) ** (1 - (1 - open_) ** 2)
    width = 0.2 + 0.8 * open_
    a, b = pink(length), pink(length)
    whoosh = np.vstack([svf(a, cutoff, 1.0, "band"), svf(a * (1 - width) + b * width, cutoff * 1.04, 1.0, "band")]) * level
    air = np.vstack([highpass(white(length), 7000), highpass(white(length), 7000)]) * level * decay(t, 0.12) * 0.5
    sub = saturate(np.sin(phase_of(55 + 25 * open_, length)) * attack(t, 0.03) * decay(np.maximum(t - 0.08, 0), 0.3), 2.0)
    zoom_t = times(0.4)
    zoom = np.sin(phase_of(NOTE["A4"] * (NOTE["D6"] / NOTE["A4"]) ** np.clip(zoom_t / 0.25, 0, 1), 0.4)) * decay(zoom_t, 0.1) * attack(zoom_t, 0.01)
    out = stereo(length)
    add(out, whoosh, 0, db(0))
    add(out, air, 0, db(-8))
    add(out, sub, 0, db(-10))
    add(out, zoom, 0, db(-24))
    return finish(reverb(out, 0.22, 1.2, 0.01, 0.6, 12), -8, 0.25)


def title_hit_layers():
    """STREAMERDRAFT landing: the hit itself (used by title() and by load()'s swell)."""
    length = 2.4
    t = times(length)
    out = stereo(length)
    # the kick: a very fast pitch drop plus a click, for the punch at the front
    kick_t = times(0.03)
    kick = np.sin(phase_of(120 + 1900 * decay(kick_t, 0.0018), 0.03)) * decay(kick_t, 0.012)
    add(out, kick, 0, db(-4))
    add(out, highpass(white(0.008), 3000) * decay(times(0.008), 0.0015), 0, db(-10))
    # the boom: deep, with a pitch dive, saturated so phones still hear it
    boom = np.sin(phase_of(NOTE["D1"] + 74 * decay(t, 0.06), length)) * decay(t, 0.55) * attack(t, 0.003)
    add(out, saturate(boom * 1.4, 2.6), 0, db(-1))
    # the body and the crack: the 'slam'
    add(out, bandpass(white(0.4), 120, 320) * decay(times(0.4), 0.07), 0, db(-6))
    add(out, bandpass(white(0.15), 1500, 4500) * decay(times(0.15), 0.025), 0, db(-12))
    # the stab: a big, dark D power chord whose brightness closes down
    stab = np.zeros(len(t))
    for name in ["D2", "A2", "D3", "A3"]:
        stab += supersaw(NOTE[name], length, 7, 3)
    stab = svf(stab, 600 + 2600 * decay(t, 0.18), 0.8, "low") * decay(t, 0.7) * attack(t, 0.004)
    add(out, widen(np.vstack([saturate(stab * 0.6, 1.5), saturate(np.roll(stab, 113) * 0.6, 1.5)]), 1.5), 0, db(-9))
    return ring_out(out)


def load():
    """The site loading (0.65 s): ticks that speed up, and a reverse swell that
    rises into the title hit, then a split second of silence so it lands hard."""
    length = LOAD
    out = stereo(length)
    ticks = 11
    for k in range(ticks):
        when = length * 0.92 * (1 - (1 - k / ticks) ** 1.7)
        f = 2600 + 1000 * k / ticks
        tt = times(0.02)
        tick = np.sin(2 * np.pi * f * tt) * decay(tt, 0.004) * attack(tt, 0.0005)
        add(out, pan(tick, 0.3 if k % 2 else -0.3), when, db(-24 + k * 0.5))
    # the reverse swell: the hit's echo backwards, with the deep boom filtered
    # out (reversed bass is just rumble), plus a reversed cymbal-like wash
    swell = reverse_swell(title_hit_layers(), 0.6, 2.8, 13)
    swell = np.vstack([highpass(swell[0], 250, 4), highpass(swell[1], 250, 4)])
    crash_t = times(1.2)
    crash = highpass(white(1.2), 3500) * decay(crash_t, 0.35) * attack(crash_t, 0.002)
    wash = reverse_swell(np.vstack([crash, np.roll(crash, 77)]), 0.6, 1.4, 16)
    rush = (swell + 0.8 * wash) * np.linspace(0, 1, n(0.6)) ** 2.2  # eases in from nothing
    add(out, rush, length - 0.6, db(-9))
    t = times(length)
    rise = np.sin(phase_of(NOTE["D4"] * (NOTE["A4"] / NOTE["D4"]) ** (t / length), length)) * (t / length) ** 2
    add(out, rise, 0, db(-26))
    gate = np.clip((length - 0.04 - t) / 0.015, 0, 1)
    out *= gate
    return finish(out, -11, 0.0, keep=length)  # must end exactly when the title lands


def glitch(intensity, side):
    """One digital stutter as the title copies jump apart (side: -1 left, +1 right)."""
    length = 0.06
    t = times(length)
    tone = np.sign(np.sin(2 * np.pi * [NOTE["D5"], NOTE["A5"], NOTE["D6"]][rng.integers(3)] * t))
    grit = crush(bandpass(white(length), 1200, 7000), 5, rng.integers(6, 16))
    gate = ((t * 1000) % 15 < 8).astype(float)  # chopped into slices: the stutter
    burst = (0.5 * tone + grit) * gate * decay(t, 0.025) * intensity
    return pan(burst, side * 0.7)


def title():
    """STREAMERDRAFT: the hit, digital glitches in time with the copies splitting
    and snapping together (panned with them), and a shimmer as it settles."""
    hit = title_hit_layers()
    out = stereo(3.8)
    add(out, hit, 0)
    # glitches at each keyframe of the split, getting smaller as the copies settle
    for share, x, strength in zip(SPLIT_KEYS, SPLIT_X, [1.0, 0.8, 0.55, 0.35]):
        add(out, glitch(strength, np.sign(x)), share * SPLIT, db(-13))
    # the snap: the copies lock together into one red word
    snap_t = times(0.03)
    add(out, highpass(white(0.03), 2500) * decay(snap_t, 0.004), SPLIT, db(-20))
    # a soft shimmer as the ghost copies fade away
    shimmer_t = times(0.9)
    shimmer = sum(np.sin(2 * np.pi * NOTE[k] * shimmer_t + rng.random() * 6) for k in ["D6", "A6", "E7"])
    shimmer *= attack(shimmer_t, 0.15) * decay(shimmer_t, 0.25)
    add(out, widen(np.vstack([shimmer, np.roll(shimmer, 101)]), 1.5), 0.5, db(-30))
    return finish(reverb(out, 0.3, 3.2, 0.025, 0.35, 14), -1.5, 0.8)


def title_dock():
    """The title shrinking into the top-left corner (0.8 s, fast start): a swoosh
    that falls in pitch and moves to the left, a soft landing, then a calm pad as
    the page's placeholders appear."""
    length = 1.8
    t = times(length)
    move = np.clip(t / 0.45, 0, 1)
    level = attack(t, 0.02) * decay(np.maximum(t - 0.07, 0), 0.18)
    swoosh = svf(pink(length), 3200 * (550 / 3200) ** (1 - (1 - move) ** 2), 1.1, "band") * level
    out = stereo(length)
    add(out, pan(swoosh, -0.65 * (1 - (1 - move) ** 2)), 0, db(0))
    landing_t = times(0.1)
    thud = np.sin(phase_of(90 + 50 * decay(landing_t, 0.015), 0.1)) * decay(landing_t, 0.03)
    add(out, pan(saturate(thud, 1.5), -0.5), 0.42, db(-10))
    add(out, pan(highpass(white(0.01), 3000) * decay(times(0.01), 0.002), -0.5), 0.42, db(-20))
    pad_t = times(1.4)
    pad = sum(np.sin(2 * np.pi * NOTE[k] * pad_t) for k in ["D4", "A4", "E5"])
    pad *= attack(pad_t, 0.5) * decay(np.maximum(pad_t - 0.5, 0), 0.35)
    add(out, widen(np.vstack([pad, np.roll(pad, 157)]), 1.4), 0.35, db(-24))
    return finish(reverb(out, 0.3, 1.6, 0.015, 0.5, 15), -11, 0.4)


def hero_swell():
    """The page's headline, 'Nobody's watching.', fading up: a low, soft swell
    that drops to silence just before 'Yet.' (that silence is the beat)."""
    length = HERO_YET
    t = times(length)
    level = np.interp(t, [0, 0.45, 0.62, 0.72, length], [0, 1, 0.9, 0, 0])
    pad = sum(np.sin(2 * np.pi * NOTE[k] * t) + 0.25 * np.sin(4 * np.pi * NOTE[k] * t) for k in ["D3", "A3", "E4"])
    pad = lowpass(pad, 1400) * level
    air = svf(pink(length), 400 * (1600 / 400) ** np.clip(t / 0.6, 0, 1), 1.0, "band") * level * 0.7
    sub = np.sin(2 * np.pi * NOTE["D2"] * t) * level
    out = stereo(length)
    add(out, widen(np.vstack([pad, np.roll(pad, 181)]), 1.3), 0, db(-10))
    add(out, widen(np.vstack([air, np.roll(air, 67)]), 1.4), 0, db(-6))
    add(out, saturate(sub, 1.5), 0, db(-16))
    return finish(out, -16, 0.0, keep=length)  # must end exactly when "Yet." lands


def hero_yet():
    """'Yet.' slamming in: a tight hit (smaller than the title's) with a bright glassy edge."""
    length = 1.6
    t = times(length)
    out = stereo(length)
    kick_t = times(0.03)
    kick = np.sin(phase_of(110 + 1700 * decay(kick_t, 0.0018), 0.03)) * decay(kick_t, 0.012)
    add(out, kick, 0, db(-4))
    add(out, highpass(white(0.008), 3000) * decay(times(0.008), 0.0015), 0, db(-10))
    boom = np.sin(phase_of(NOTE["D1"] + 60 * decay(t, 0.05), length)) * decay(t, 0.32) * attack(t, 0.003)
    add(out, saturate(boom * 1.3, 2.4), 0, db(-2))
    add(out, bandpass(white(0.12), 1500, 4500) * decay(times(0.12), 0.02), 0, db(-12))
    glass = bell(NOTE["D6"], 1.4, 0.5, 0.8, 3) + 0.8 * bell(NOTE["A6"], 1.4, 0.45, 0.7, -3)
    add(out, pan(glass, 0.1), 0.005, db(-12))
    stab = sum(supersaw(NOTE[k], length, 7, 3) for k in ["D2", "A2", "D3"])
    stab = svf(stab, 500 + 2200 * decay(t, 0.1), 0.8, "low") * decay(t, 0.3) * attack(t, 0.004)
    add(out, widen(np.vstack([saturate(stab * 0.6, 1.4), saturate(np.roll(stab, 97) * 0.6, 1.4)]), 1.4), 0, db(-12))
    return finish(reverb(ring_out(out), 0.26, 1.6, 0.015, 0.5, 17), -4, 0.3)


def bed():
    """A quiet drone under the whole build, from the tap until just before the
    title hit, where it drops out so the hit lands in silence."""
    until = GROW + EDGE_LAP + 0.5 + 1.45 + 0.2 + 0.6 + LOAD  # tap -> title (PHASE_TIMES)
    length = until
    t = times(length)
    drone = np.zeros(len(t))
    for name, amp in [("D2", 1.0), ("A2", 0.7), ("D3", 0.35)]:
        f = NOTE[name]
        drone += amp * (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(4 * np.pi * f * t + 1))
    drone = lowpass(drone, 900)
    # swells with the build: up to the lock, eases off on the home screen, up again into the title
    swell = np.interp(t, [0, 3.7, 4.4, 5.6, until - 0.55, until - 0.12, until], [0, 1, 0.55, 0.6, 1, 0, 0])
    drone *= swell * (1 + 0.08 * np.sin(2 * np.pi * 0.35 * t))
    air = lowpass(pink(length), 1200) * swell * 0.25
    out = widen(np.vstack([drone + air, np.roll(drone, 300) + np.roll(air, 700)]), 1.3)
    return finish(out, -21, 0.05, keep=length)


SOUNDS = {
    "tap": tap, "grow": grow, "lap": lap, "lock": lock, "home": home, "dock": dock,
    "pop": pop, "ready": ready, "badge": badge, "press": press, "launch": launch,
    "load": load, "title": title, "title-dock": title_dock, "bed": bed,
    "hero-swell": hero_swell, "hero-yet": hero_yet,
}

# MP3 quality per sound (kbps). The drone is soft and low, so it needs less.
BITRATE = {"bed": 64}


# =========================================================================
# Saving
# =========================================================================

def to_pcm(x):
    clipped = np.clip(x, -1, 1)
    return (clipped.T * 32767).astype("<i2")


def save_mp3(path, x, kbps):
    import lameenc

    encoder = lameenc.Encoder()
    encoder.set_bit_rate(kbps)
    encoder.set_in_sample_rate(SR)
    encoder.set_channels(2)
    encoder.set_quality(2)  # 2 = high quality
    data = encoder.encode(to_pcm(x).tobytes()) + encoder.flush()
    with open(path, "wb") as f:
        f.write(data)


def save_wav(path, x):
    import wave

    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(to_pcm(x).tobytes())


ONSET_DB = -30  # src/components/launch/sound.ts uses the same threshold


def onset(x):
    """Seconds until the sound first gets within 30 dB of its loudest point.
    MP3s start with a few milliseconds of silence that browsers handle
    differently; sound.ts measures the same point in the decoded file and lines
    it up with this, so every sound lands exactly on its frame."""
    level = np.max(np.abs(x), axis=0)
    hits = np.nonzero(level >= np.max(level) * db(ONSET_DB))[0]
    return float(hits[0] / SR) if len(hits) else 0.0


def main():
    import json

    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    out_dir = args[0] if len(args) > 0 else "public/sounds"
    manifest_path = args[1] if len(args) > 1 else "src/components/launch/sounds.json"
    os.makedirs(out_dir, exist_ok=True)
    only = [a[7:] for a in sys.argv[1:] if a.startswith("--only=")]
    manifest = {}
    if os.path.exists(manifest_path):
        with open(manifest_path) as f:
            manifest = json.load(f)
    for name, make in SOUNDS.items():
        if only and name not in only[0].split(","):
            continue
        x = make()
        save_mp3(os.path.join(out_dir, f"{name}.mp3"), x, BITRATE.get(name, 128))
        if "--wav" in sys.argv:
            save_wav(os.path.join(out_dir, f"{name}.wav"), x)
        manifest[name] = {"onset": round(onset(x), 5), "length": round(x.shape[1] / SR, 4)}
        size = os.path.getsize(os.path.join(out_dir, f"{name}.mp3")) / 1024
        print(f"{name:11s} {x.shape[1] / SR:5.2f}s  peak {20 * np.log10(np.max(np.abs(x)) + 1e-12):6.1f} dB  {size:5.1f} KB")
    with open(manifest_path, "w") as f:
        json.dump({"_about": "Made by scripts/render-sounds.py: where each sound really starts (see onset())", "onsetDb": ONSET_DB, **{k: v for k, v in manifest.items() if not k.startswith("_") and k != "onsetDb"}}, f, indent=2)
    print("manifest ->", manifest_path)


if __name__ == "__main__":
    main()
