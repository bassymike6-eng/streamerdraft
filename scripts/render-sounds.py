"""
scripts/render-sounds.py  (the StreamerDraft sound, v2)

WHAT THIS IS
Makes every sound on the site from scratch (no samples, so no licences) and
saves them as small MP3s in public/sounds/:
  the intro      what plays as the light runs, the phone opens and the title lands
                 (src/components/launch/soundCues.ts says which plays when)
  the page       the small sounds after it: pop-ups opening and closing, ticks,
                 "sent", "you're in", a gentle "not quite", copying your link
                 (src/components/page/uiSound.ts plays those)

    python scripts/render-sounds.py public/sounds

Needs Python with numpy, scipy and lameenc:  pip install numpy scipy lameenc
Add --wav to also save WAV copies (handy for listening in an audio editor).
Add --only=title,ui-success to remake just those.

v1 (the first version) is kept, untouched: scripts/render-sounds-v1.py made
public/sounds/v1/. Open the site with ?sounds=v1 to hear it again.

THE INTRO NOW COMES FROM scripts/render-intro.py (v5, "Scenes": every scene
its own sound, cut when the next one starts). This script still makes the page's sounds (every
version uses them) and v2's intro, kept to compare: ?sounds=v2.

WHAT'S NEW IN v2
1. ONE SOUND, NOT A PILE OF SOUNDS
   The StreamerDraft sound has an identity now, the way big brands do (a
   "sonic logo"): three notes we call THE DRAFT CALL,
       A  ->  D  ->  F#       (5, 1, 3 in D major: a pickup, home, then up)
       short short  long      "you got picked"
   and one signature instrument that plays it, a glassy MALLET (see mallet()).
   The call is hidden all through the site, so it all sounds like one thing:
       the light's lap      its sparkles are the call's notes
       "ready"              the app finishing its install plays the call
       the title            the call rings out of the hit as it settles
       "Yet."               lands on the call's last two notes
       the page filling in  the four pops walk the call: A, D, F#, A
       the scout form       Continue plays A, Send plays A-D (unfinished),
                            confirming plays all three: the call completes
                            exactly when they're in
2. EVERY SOUND IN ITS PLACE (loudness, not peaks)
   v1 levelled each sound by its loudest instant, but our ears judge
   loudness over time. A long chime and a click can peak the same and sound
   miles apart (v1's install chime was nearly as loud as the title hit).
   v2 measures loudness like TV and streaming do (LUFS, ITU-R BS.1770: see
   loudness()) and gives every sound its place in a clear order:
       the title > "Yet." > the lock > the build > the little UI sounds
   with a limiter so nothing ever clips.
3. MADE FOR PHONE SPEAKERS
   Phones can't play deep bass, and 2-5 kHz turns harsh on tiny speakers.
   The page's sounds are kept mostly in the middle-high range, with the
   rumble taken out and that harsh band eased (phone_safe()); they're
   mono at heart, so they sound the same from one speaker. The big hits
   keep their bass but carry it in overtones (saturate()) so phones still
   feel the thump.
4. AN ENDLESS RISE
   The light's lap uses a Shepard-Risset glissando: tones an octave apart
   all gliding up, fading in at the bottom and out at the top, so it seems
   to rise forever without getting shrill. It's the classic trick for
   tension that never runs out.
5. SOUNDS THAT DON'T WEAR OUT
   The little sounds you hear again and again (ticks) come in three takes
   each, and the page nudges their pitch and volume a hair every time
   (uiSound.ts), like a real button never clicks exactly the same twice.

TIMINGS
Some sounds have to fit an animation exactly. These come from
src/components/launch/timeline.ts, LaunchIntro.module.css and Sheet.tsx. If you
change those, change them here too and re-run this script.
"""

import os
import sys

import numpy as np
from scipy.ndimage import minimum_filter1d, uniform_filter1d
from scipy.signal import butter, fftconvolve, lfilter, resample_poly, sosfilt

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
# ---- and from the page (Sheet.tsx) ----
SHEET_GROW = 0.56  # GROW_MS: a pop-up growing out of what you tapped
SHEET_SHRINK = 0.42  # SHRINK_MS: shrinking back in

# ---- Notes (D major) ----
NOTE = {
    "D1": 36.71, "A1": 55.00, "D2": 73.42, "A2": 110.00, "D3": 146.83, "E3": 164.81,
    "F#3": 185.00, "A3": 220.00, "B3": 246.94, "C#4": 277.18, "D4": 293.66, "E4": 329.63,
    "F#4": 369.99, "A4": 440.00, "B4": 493.88, "D5": 587.33, "E5": 659.26, "F#5": 739.99,
    "A5": 880.00, "B5": 987.77, "D6": 1174.66, "E6": 1318.51, "F#6": 1479.98, "A6": 1760.00,
    "D7": 2349.32, "E7": 2637.02, "F#7": 2959.96, "A7": 3520.00, "D8": 4698.64,
}

# ---- THE DRAFT CALL ----
# Which note of the call, in a given octave: call(4) = A4, D5, F#5 (the A sits
# below the D, so the call always climbs)
def call(octave):
    return [NOTE[f"A{octave}"], NOTE[f"D{octave + 1}"], NOTE[f"F#{octave + 1}"]]


CALL_AT = [0.0, 0.085, 0.2]  # when each note lands: short, short, long

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


# ---- v2: the signature instrument and the little building blocks ----

def mallet(freq, seconds, length=0.6, hardness=1.0, bright=0.7, detune=0.0):
    """
    THE StreamerDraft instrument: a glassy mallet. Two parts, like a real one:
      the strike  FM (one sine wobbling another 3.5x its pitch). The wobble dies
                  in about 20 ms, so the note starts bright and woody and
                  mellows into
      the body    a bell-like tone whose overtones fade faster than the note
    plus a tiny felt 'tock' at the very start, so it feels touched, not beeped.
    hardness: how hard it's hit (brighter, clickier start). bright: overtones.
    """
    t = times(seconds)
    f = freq * 2 ** (detune / 1200)
    # (high notes get a gentler wobble: its overtones would otherwise go past
    # what a 48 kHz file can hold and fold back down as a metallic hiss)
    tame = min(1.0, 6000 / (f * 3.5))
    index = (hardness * 2.4 * decay(t, 0.018) + 0.12 * bright) * tame
    strike = np.sin(2 * np.pi * f * t + index * np.sin(2 * np.pi * f * 3.5 * t)) * decay(t, length * 0.35)
    body = np.sin(2 * np.pi * f * t) * decay(t, length)
    body += 0.32 * np.sin(2 * np.pi * 2 * f * t + 0.7) * decay(t, length * 0.45)
    body += 0.1 * bright * np.sin(2 * np.pi * 4.07 * f * t + 1.3) * decay(t, length * 0.2)
    felt = lowpass(white(seconds), 2600) * decay(t, 0.0022) * 0.3 * hardness
    return ring_out((0.55 * strike + body + felt) * attack(t, 0.0012))


def call_notes(octave, seconds=1.4, length=0.55, gains=(0.75, 0.85, 1.0), notes=3, spread=0.25, hardness=1.0):
    """The draft call on the mallet (or just its first `notes` notes), panned
    a touch left to right as it climbs."""
    out = stereo(seconds)
    for i, (f, at, g) in enumerate(zip(call(octave), CALL_AT, gains)):
        if i >= notes:
            break
        last = i == notes - 1
        note = mallet(f, seconds - at, length * (1.6 if last else 1.0), hardness, 0.7, (i - 1) * 2.5)
        add(out, pan(note, (i - 1) * spread), at, g)
    return out


def felt_tick(pitch=1.0, bright=1.0, seconds=0.12):
    """A soft, tactile tick (a toggle, a tap): a short click, a tiny pitched
    'tock' that drops in pitch, and a little body. pitch scales all of it."""
    t = times(seconds)
    click = bandpass(white(seconds), 1100 * pitch, min(6000 * pitch, 16000)) * decay(t, 0.0016) * bright
    tock = np.sin(phase_of(1050 * pitch + 900 * pitch * decay(t, 0.004), seconds)) * decay(t, 0.007)
    body = np.sin(phase_of(240 * pitch + 140 * decay(t, 0.01), seconds)) * decay(t, 0.013)
    return ring_out((0.8 * click + 0.45 * tock + 0.3 * body) * attack(t, 0.0004))


def shepard_rise(seconds, octaves=1.0, lowest=NOTE["D2"], layers=6, centre=NOTE["A4"], width=1.0):
    """
    A Shepard-Risset glissando: `layers` tones an octave apart, all gliding up
    together by `octaves`. Each one is loudest in the middle of the range and
    silent at the very bottom and top, so as one fades out up high, another
    fades in down low. It sounds like it's rising forever without ever
    getting shrill.
    """
    t = times(seconds)
    u = t / seconds
    out = np.zeros(len(t))
    for k in range(layers):
        octave = (k + octaves * u) % layers  # 0..layers, wrapping round
        f = lowest * 2**octave
        loud = np.exp(-0.5 * ((np.log2(f) - np.log2(centre)) / width) ** 2)
        out += loud * (np.sin(phase_of(f, seconds)) + 0.25 * np.sin(phase_of(2 * f, seconds)))
    return out / layers


def peaking(x, f0, gain_db, q=1.0):
    """A bell-shaped EQ boost or cut around f0 (the standard 'RBJ' recipe)."""
    a_ = 10 ** (gain_db / 40)
    w0 = 2 * np.pi * f0 / SR
    alpha = np.sin(w0) / (2 * q)
    b = np.array([1 + alpha * a_, -2 * np.cos(w0), 1 - alpha * a_])
    a = np.array([1 + alpha / a_, -2 * np.cos(w0), 1 - alpha / a_])
    return lfilter(b / a[0], a / a[0], x)


def each(x, fn):
    """Applies fn to each side of a stereo clip."""
    return np.vstack([fn(x[0]), fn(x[1])]) if x.ndim == 2 else fn(x)


def phone_safe(x, low=140):
    """For the page's sounds: what a phone speaker can actually play. No rumble
    (it can't play it anyway, it just wastes loudness), and the 2-5 kHz band
    that turns harsh on tiny speakers eased off."""
    return each(x, lambda c: peaking(highpass(c, low, 2), 3300, -2.5, 0.9))


def narrow(x, amount=0.4):
    """Mostly mono, so it sounds the same from one phone speaker."""
    return widen(x, amount) if x.ndim == 2 else x


# ---- Loudness (how loud it SOUNDS, not how high it peaks) ----

def k_weight(x):
    """The 'K' filter from ITU-R BS.1770 (the TV / streaming loudness standard):
    a gentle boost of the highs and a cut of the deep lows, to match how our
    ears weigh them. These are the standard's own numbers for 48 kHz."""
    b1 = [1.53512485958697, -2.69169618940638, 1.19839281085285]
    a1 = [1.0, -1.69065929318241, 0.73248077421585]
    b2 = [1.0, -2.0, 1.0]
    a2 = [1.0, -1.99004745483398, 0.99007225036621]
    return lfilter(b2, a2, lfilter(b1, a1, x))


def loudness(x, window=None):
    """The loudest 'momentary' loudness, in LUFS: the loudest 400 ms (the
    standard's window). For short sounds this is the fair measure: an average
    over the whole clip would count the silent tail.
    A click is over in a few hundredths of a second, though, and averaging it
    over 400 ms makes it seem quieter than it sounds (it'd then be turned up
    too far). So anything that's all over within 150 ms is measured over
    100 ms instead, closer to how long our ears take to judge a click."""
    if x.ndim == 1:
        x = np.vstack([x, x])
    k = np.vstack([k_weight(c) for c in x])
    if window is None:
        energy = np.cumsum(np.sum(k**2, axis=0))
        span = (np.searchsorted(energy, 0.95 * energy[-1]) - np.searchsorted(energy, 0.05 * energy[-1])) / SR
        window = 0.1 if span < 0.15 else 0.4
    win, hop = n(window), n(0.025)
    if k.shape[1] < win:
        k = np.pad(k, ((0, 0), (0, win - k.shape[1])))
    power = np.sum(k**2, axis=0)
    sums = np.convolve(power, np.ones(win), "valid")[::hop] / win
    return -0.691 + 10 * np.log10(np.max(sums) + 1e-20)


def true_peak(x):
    """The peak between the samples too (4x oversampled), which is what an MP3
    or a phone's converter can actually hit."""
    return np.max(np.abs(resample_poly(x, 4, 1, axis=-1)))


def limit(x, ceiling_db=-1.0, look=0.0015):
    """A fast, clean limiter: turns the volume down just around any peak that
    would go over the ceiling, and smoothly back up, so nothing ever clips."""
    if x.ndim == 1:
        x = np.vstack([x, x])
    ceiling = db(ceiling_db) * 0.97  # a little room for the peaks between samples
    level = np.max(np.abs(x), axis=0)
    need = np.minimum(1.0, ceiling / np.maximum(level, 1e-9))
    hold = n(look)
    gain = minimum_filter1d(need, size=2 * hold + 1)
    gain = uniform_filter1d(gain, size=hold + 1)
    gain = np.minimum(gain, need)  # (the smoothing must never let a peak through)
    return x * gain


def finish(x, lufs, fade_out=0.03, keep=None, ceiling=-1.0):
    """Removes rumble below hearing, cuts the silent end off, then sets the
    LOUDNESS to `lufs` (see loudness()), with a limiter on top.
    keep: exact length in seconds (for sounds that must end on a set moment)."""
    if x.ndim == 1:
        x = np.vstack([x, x])
    x = np.vstack([highpass(x[0], 22, 2), highpass(x[1], 22, 2)])
    if keep is not None:
        x = x[:, : n(keep)]
    else:
        level = np.max(np.abs(x), axis=0)
        loud = np.nonzero(level > np.max(level) * db(-66))[0]
        end = min(x.shape[1], (loud[-1] if len(loud) else x.shape[1]) + n(0.05))
        x = x[:, :end]
        fade_out = max(fade_out, 0.05)
    x = fade_edges(x, 0.0005, fade_out)
    for _ in range(3):  # (limiting lowers the loudness a little: settle on it)
        x = x * db(lufs - loudness(x))
        x = limit(x, ceiling)
    if true_peak(x) > db(ceiling):
        x = x * (db(ceiling) / true_peak(x))
    return x


# The order of loudness, loudest first (LUFS, measured by loudness()). One
# place to rebalance the whole mix. v1, measured the same way, for comparison:
#   title -10.8, lock -12.2, tap -13.7 (!), Yet. -14.0, ready -15.9, lap -16.4,
#   press -17.7, launch -18.8, grow -19.8, badge -20.2, home -21.2, pop -25.2
# v1's play-button click was as loud as "Yet." and its install chime nearly
# as loud as the lock. v2 puts every sound in its place:
#   the title > "Yet." > the lock > the build > the transitions > the little sounds
LEVEL = {
    # the intro
    "title": -10.5, "hero-yet": -13.0, "lock": -14.0, "lap": -17.0, "tap": -17.0,
    "ready": -18.5, "launch": -19.0, "press": -19.5, "grow": -20.0, "badge": -21.5,
    "load": -21.5, "home": -22.0, "title-dock": -22.0, "hero-swell": -25.0,
    "pop": -27.0, "bed": -28.0, "dock": -29.0,
    # the page: well under the intro, since they play over a quiet page, again and again
    "ui-success": -21.0, "ui-sent": -24.0, "ui-error": -25.5, "ui-copy": -26.0,
    "ui-step": -26.5, "ui-tick": -30.0, "ui-open": -30.0, "ui-close": -31.5,
}



# =========================================================================
# The intro, in the order it plays
# =========================================================================

def tap():
    """The play button: a felt tick, a soft 'tock' with weight, and a glint of
    the mallet on the call's home note (D): the first hint of the sound."""
    out = stereo(1.4)
    add(out, felt_tick(1.4, 1.0), 0, db(-4))
    t2 = times(0.25)
    tock = np.sin(phase_of(110 + 130 * decay(t2, 0.012), 0.25)) * decay(t2, 0.05)
    add(out, saturate(tock * 1.2, 1.6), 0, db(-4))
    add(out, pan(mallet(NOTE["D6"], 1.3, 0.35, 0.8, 0.5), 0.15), 0.004, db(-16))
    return finish(reverb(out, 0.18, 0.7, 0.008, 0.7), LEVEL["tap"])


def grow():
    """The light growing from the button out to the screen edge (1.3 s, slow-fast-slow).
    A whoosh whose loudness follows the light's speed, getting wider as it spreads,
    over a soft tone rising a fifth (D to A: it wants to go somewhere)."""
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
    glide = NOTE["D4"] * (NOTE["A4"] / NOTE["D4"]) ** shape
    tone = (np.sin(phase_of(glide, length)) + 0.4 * np.sin(phase_of(glide * 2, length))) * level
    sub = saturate(np.sin(phase_of(46 + 27 * shape, length)) * level, 1.8)
    out = stereo(length)
    add(out, whoosh, 0, db(0))
    add(out, air, 0, db(-7))
    add(out, tone, 0, db(-27))
    add(out, sub, 0, db(-17))
    return finish(reverb(out, 0.2, 1.2, 0.01, 0.6, 4), LEVEL["grow"], 0.15)


def lock_layers():
    """The ring completing (used by lock() and by the swell that leads into it):
    the call's notes struck together as one chord on the mallet, an octave of
    glass above, a sub thump and a warm low D."""
    seconds = 3.4
    t = times(seconds)
    out = stereo(seconds)
    for f, where, cents in zip(call(5) + [NOTE["D7"]], [-0.35, 0.0, 0.35, 0.15], [-3, 0, 3, 1]):
        note = mallet(f, seconds, 1.6, 1.1, 0.8, cents) + mallet(f, seconds, 1.6, 0.6, 0.6, -cents)
        add(out, pan(note, where), 0, db(-7))
    strike = highpass(white(0.03), 5000) * decay(times(0.03), 0.003)
    add(out, strike, 0, db(-15))
    thump = saturate(np.sin(phase_of(52 + 45 * decay(t, 0.04), seconds)) * decay(t, 0.17), 2.2)
    add(out, thump, 0, db(-1))
    warm = np.sin(2 * np.pi * NOTE["D3"] * t) * decay(t, 0.25) * attack(t, 0.004)
    add(out, warm, 0, db(-12))
    return out


def lap():
    """The light's lap of the screen edge (2.4 s): an endless Shepard rise that
    builds the tension, sparkles on the call's notes getting denser like the
    light leaving a trail, the lock's own echo swelling in backwards, then
    70 ms of silence so the lock lands hard."""
    length = EDGE_LAP
    t = times(length)
    u = t / length
    build = u**1.8
    rise = shepard_rise(length, 1.0, NOTE["D2"], 6, NOTE["A4"], 0.95) * (0.3 + 0.7 * build)
    rise = svf(rise, 700 * 8 ** (u**1.3), 0.8, "low")
    pad = np.zeros(len(t))
    for name in ["E4", "A4", "E5"]:  # the 'five' chord, wanting to resolve home
        pad += supersaw(NOTE[name] * 2 ** (u**1.6 * 2 / 12), length, 9, 3)
    pad = svf(pad, 500 * 10 ** (u**1.4), 0.9, "low") * (0.2 + 0.8 * build)
    rate = 4 + 15 * u**1.5  # filtered noise pulsing faster and faster: charging up
    pulse = 0.55 + 0.45 * np.sin(2 * np.pi * np.cumsum(rate) / SR) ** 2
    hiss = svf(white(length), 700 * 11 ** u, 0.8, "high") * build * pulse
    sparkles = stereo(length)
    notes = call(6) + [NOTE["A7"], NOTE["D8"]]  # A6 D7 F#7, then A7 D8 above
    when, k = 0.0, 0
    while when < length - 0.12:
        density = 4 + 26 * (when / length) ** 1.5
        when += rng.exponential(1 / density)
        ping = mallet(notes[k % len(notes)] if rng.random() < 0.7 else notes[rng.integers(len(notes))], 0.25, 0.05, 0.5, 0.3)
        k += 1
        add(sparkles, pan(ping, rng.uniform(-0.8, 0.8)), when, db(-15) * (0.4 + 0.6 * when / length))
    swell = reverse_swell(lock_layers(), 0.9)
    out = stereo(length)
    add(out, widen(np.vstack([rise, np.roll(rise, 61)]), 1.2), 0, db(-9))
    add(out, widen(np.vstack([pad, np.roll(pad, 37)]), 1.3), 0, db(-17))
    add(out, np.vstack([hiss, np.roll(hiss, 91)]), 0, db(-16))
    add(out, sparkles, 0, db(-4))
    add(out, swell, length - 0.9, db(-11))
    sub = saturate(np.sin(2 * np.pi * NOTE["D2"] * t) * build**2, 1.6)
    add(out, sub, 0, db(-18))
    gate = np.clip((length - 0.07 - t) / 0.025, 0, 1)
    out *= gate
    return finish(out, LEVEL["lap"], 0.0, keep=length)  # must end exactly when the ring locks


def lock():
    """The ring completing: the call as a chord, a sub thump and a bloom of reverb."""
    return finish(reverb(lock_layers(), 0.34, 2.6, 0.018, 0.7, 5), LEVEL["lock"], 0.4)


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
    return finish(reverb(out, 0.4, 1.8, 0.02, 0.5, 6), LEVEL["home"], 0.3)


def dock():
    """The dock rising in: a short upward swish that settles with a soft thup."""
    length = 0.8
    t = times(length)
    rise = np.clip(t / 0.32, 0, 1)
    swish = svf(pink(length), 350 * (1500 / 350) ** (1 - (1 - rise) ** 2), 1.2, "band")
    swish *= attack(t, 0.05) * decay(np.maximum(t - 0.14, 0), 0.1)
    thup = np.sin(phase_of(120 + 40 * decay(times(0.12), 0.02), 0.12)) * decay(times(0.12), 0.03)
    out = stereo(length)
    add(out, widen(np.vstack([swish, np.roll(swish, 29)]), 1.2), 0)
    add(out, thup, 0.31, db(-12))
    return finish(reverb(out, 0.2, 0.8, 0.01, 0.5, 7), LEVEL["dock"], 0.1)


def pop():
    """One thing popping into place: a tiny bubble on the mallet's A. The intro
    plays it once per dock app, each a step higher (a little arpeggio), and
    again for each part of the page, walking the call."""
    length = 0.32
    t = times(length)
    f = NOTE["A5"] * (1 + 0.6 * decay(t, 0.01))
    bubble = np.sin(phase_of(f, length)) * decay(t, 0.035) * attack(t, 0.001)
    note = mallet(NOTE["A5"], length, 0.09, 0.5, 0.4)
    return finish(reverb(narrow(0.6 * bubble + 0.7 * note), 0.15, 0.6, 0.005, 0.6, 8), LEVEL["pop"], 0.05)


def ready():
    """Our app finishing its install: a pop as the icon jumps out of the glass,
    then THE CALL, bright and quick, with a sprinkle of sparkles."""
    length = 1.9
    bloop_t = times(0.15)
    bloop = np.sin(phase_of(320 + 260 * (1 - decay(bloop_t, 0.02)), 0.15)) * decay(bloop_t, 0.045) * attack(bloop_t, 0.002)
    out = stereo(length)
    add(out, saturate(bloop, 1.3), 0, db(-7))
    add(out, call_notes(6, length - 0.03, 0.55, (0.7, 0.8, 1.0), 3, 0.3, 1.0), 0.03, db(-2))
    for i in range(9):
        f = [NOTE["A7"], NOTE["D8"], NOTE["F#7"]][i % 3] * (1 + rng.uniform(-0.004, 0.004))
        add(out, pan(mallet(f, 0.3, 0.06, 0.4, 0.3), rng.uniform(-0.9, 0.9)), 0.25 + i * 0.03 + rng.uniform(0, 0.012), db(-20 - i * 0.7))
    return finish(reverb(out, 0.35, 1.6, 0.012, 0.8, 9), LEVEL["ready"], 0.4)


def badge():
    """The red '1' badge: two quick notes, like a notification (D then F#: the
    end of the call, said quickly)."""
    length = 0.55
    out = stereo(length)
    add(out, pan(mallet(NOTE["D7"], length, 0.12, 0.9, 0.5), -0.1), 0, db(-3))
    add(out, pan(mallet(NOTE["F#7"], length, 0.18, 0.9, 0.5), 0.15), 0.07, db(0))
    return finish(reverb(phone_safe(out, 200), 0.25, 1.0, 0.01, 0.7, 10), LEVEL["badge"], 0.2)


def press():
    """Our app being tapped or clicked: a premium two-stage click (press, then release)."""
    length = 0.4
    out = stereo(length)
    add(out, saturate(felt_tick(1.0, 1.0, 0.1) * 1.1, 1.4), 0, db(0))
    t = times(0.05)
    add(out, np.sin(phase_of(140 + 90 * decay(t, 0.008), 0.05)) * decay(t, 0.02), 0, db(-4))
    add(out, felt_tick(1.6, 0.8, 0.08), 0.075, db(-8))  # the release: lighter and higher
    return finish(reverb(out, 0.1, 0.5, 0.004, 0.6, 11), LEVEL["press"], 0.1)


def launch():
    """The app zooming open from its icon (0.7 s, fast start): a whoosh that opens
    up wide, with a bloom of low end and a glint gliding up from A to D."""
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
    zoom = np.sin(phase_of(NOTE["A5"] * (NOTE["D6"] / NOTE["A5"]) ** np.clip(zoom_t / 0.25, 0, 1), 0.4)) * decay(zoom_t, 0.1) * attack(zoom_t, 0.01)
    out = stereo(length)
    add(out, whoosh, 0, db(0))
    add(out, air, 0, db(-8))
    add(out, sub, 0, db(-10))
    add(out, zoom, 0, db(-26))
    return finish(reverb(out, 0.22, 1.2, 0.01, 0.6, 12), LEVEL["launch"], 0.25)


def title_hit_layers():
    """STREAMERDRAFT landing: the hit itself (used by title() and by load()'s swell)."""
    length = 2.4
    t = times(length)
    out = stereo(length)
    kick_t = times(0.03)
    kick = np.sin(phase_of(120 + 1900 * decay(kick_t, 0.0018), 0.03)) * decay(kick_t, 0.012)
    add(out, kick, 0, db(-4))
    add(out, highpass(white(0.008), 3000) * decay(times(0.008), 0.0015), 0, db(-10))
    boom = np.sin(phase_of(NOTE["D1"] + 74 * decay(t, 0.06), length)) * decay(t, 0.55) * attack(t, 0.003)
    add(out, saturate(boom * 1.4, 2.6), 0, db(-1))
    add(out, bandpass(white(0.4), 120, 320) * decay(times(0.4), 0.07), 0, db(-6))
    add(out, bandpass(white(0.15), 1500, 4500) * decay(times(0.15), 0.025), 0, db(-12))
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
        tick = felt_tick(2.2 + 0.8 * k / ticks, 0.6, 0.03)
        add(out, pan(tick, 0.3 if k % 2 else -0.3), when, db(-20 + k * 0.5))
    swell = reverse_swell(title_hit_layers(), 0.6, 2.8, 13)
    swell = np.vstack([highpass(swell[0], 250, 4), highpass(swell[1], 250, 4)])
    crash_t = times(1.2)
    crash = highpass(white(1.2), 3500) * decay(crash_t, 0.35) * attack(crash_t, 0.002)
    wash = reverse_swell(np.vstack([crash, np.roll(crash, 77)]), 0.6, 1.4, 16)
    rush = (swell + 0.8 * wash) * np.linspace(0, 1, n(0.6)) ** 2.2
    add(out, rush, length - 0.6, db(-9))
    t = times(length)
    rise = np.sin(phase_of(NOTE["D4"] * (NOTE["A4"] / NOTE["D4"]) ** (t / length), length)) * (t / length) ** 2
    add(out, rise, 0, db(-26))
    gate = np.clip((length - 0.04 - t) / 0.015, 0, 1)
    out *= gate
    return finish(out, LEVEL["load"], 0.0, keep=length)  # must end exactly when the title lands


def glitch(intensity, side):
    """One digital stutter as the title copies jump apart (side: -1 left, +1 right)."""
    length = 0.06
    t = times(length)
    tone = np.sign(np.sin(2 * np.pi * [NOTE["D5"], NOTE["A5"], NOTE["D6"]][rng.integers(3)] * t))
    grit = crush(bandpass(white(length), 1200, 7000), 5, rng.integers(6, 16))
    gate = ((t * 1000) % 15 < 8).astype(float)
    burst = (0.5 * tone + grit) * gate * decay(t, 0.025) * intensity
    return pan(burst, side * 0.7)


def title():
    """STREAMERDRAFT: the hit, digital glitches in time with the copies splitting
    and snapping together (panned with them), and as it settles, THE CALL rings
    out on the mallet: the brand's three notes, said once, loud and clear."""
    hit = title_hit_layers()
    out = stereo(3.8)
    add(out, hit, 0)
    for share, x, strength in zip(SPLIT_KEYS, SPLIT_X, [1.0, 0.8, 0.55, 0.35]):
        add(out, glitch(strength, np.sign(x)), share * SPLIT, db(-13))
    snap_t = times(0.03)
    add(out, highpass(white(0.03), 2500) * decay(snap_t, 0.004), SPLIT, db(-20))
    # the call, starting as the copies snap together, an octave doubled for size
    the_call = call_notes(5, 2.6, 0.9, (0.75, 0.85, 1.0), 3, 0.35, 1.2)
    the_call += 0.5 * call_notes(6, 2.6, 0.7, (0.7, 0.8, 1.0), 3, 0.45, 0.8)
    add(out, the_call, SPLIT - 0.02, db(-15))
    return finish(reverb(out, 0.3, 3.2, 0.025, 0.35, 14), LEVEL["title"], 0.8)


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
    add(out, pan(felt_tick(1.2, 0.7, 0.05), -0.5), 0.42, db(-16))
    pad_t = times(1.4)
    pad = sum(np.sin(2 * np.pi * NOTE[k] * pad_t) for k in ["D4", "A4", "E5"])
    pad *= attack(pad_t, 0.5) * decay(np.maximum(pad_t - 0.5, 0), 0.35)
    add(out, widen(np.vstack([pad, np.roll(pad, 157)]), 1.4), 0.35, db(-24))
    return finish(reverb(out, 0.3, 1.6, 0.015, 0.5, 15), LEVEL["title-dock"], 0.4)


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
    return finish(out, LEVEL["hero-swell"], 0.0, keep=length)  # must end exactly when "Yet." lands


def hero_yet():
    """'Yet.' slamming in: a tight hit (smaller than the title's), and on top the
    end of the call (D, then F#, on the mallet): the line answers the title."""
    length = 1.8
    t = times(length)
    out = stereo(length)
    kick_t = times(0.03)
    kick = np.sin(phase_of(110 + 1700 * decay(kick_t, 0.0018), 0.03)) * decay(kick_t, 0.012)
    add(out, kick, 0, db(-4))
    add(out, highpass(white(0.008), 3000) * decay(times(0.008), 0.0015), 0, db(-10))
    boom = np.sin(phase_of(NOTE["D1"] + 60 * decay(t, 0.05), length)) * decay(t, 0.32) * attack(t, 0.003)
    add(out, saturate(boom * 1.3, 2.4), 0, db(-2))
    add(out, bandpass(white(0.12), 1500, 4500) * decay(times(0.12), 0.02), 0, db(-12))
    add(out, pan(mallet(NOTE["D6"], 1.6, 0.6, 1.2, 0.8, 3), -0.1), 0.004, db(-11))
    add(out, pan(mallet(NOTE["F#6"], 1.5, 0.9, 1.0, 0.8, -3), 0.15), 0.12, db(-11))
    stab = sum(supersaw(NOTE[k], length, 7, 3) for k in ["D2", "A2", "D3"])
    stab = svf(stab, 500 + 2200 * decay(t, 0.1), 0.8, "low") * decay(t, 0.3) * attack(t, 0.004)
    add(out, widen(np.vstack([saturate(stab * 0.6, 1.4), saturate(np.roll(stab, 97) * 0.6, 1.4)]), 1.4), 0, db(-12))
    return finish(reverb(ring_out(out), 0.26, 1.6, 0.015, 0.5, 17), LEVEL["hero-yet"], 0.3)


def bed():
    """A quiet drone under the whole build, from the tap until just before the
    title hit, where it drops out so the hit lands in silence. It ducks for
    the lock (like a mixer pulling it down to make room), then comes back."""
    until = GROW + EDGE_LAP + 0.5 + 1.45 + 0.2 + 0.6 + LOAD  # tap -> title (PHASE_TIMES)
    length = until
    t = times(length)
    drone = np.zeros(len(t))
    for name, amp in [("D2", 1.0), ("A2", 0.7), ("D3", 0.35)]:
        f = NOTE[name]
        drone += amp * (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(4 * np.pi * f * t + 1))
    drone = lowpass(drone, 900)
    lock_at = GROW + EDGE_LAP
    swell = np.interp(t, [0, 3.7, lock_at - 0.05, lock_at + 0.02, lock_at + 0.5, 5.6, until - 0.55, until - 0.12, until],
                      [0, 1, 1, 0.25, 0.55, 0.6, 1, 0, 0])
    drone *= swell * (1 + 0.08 * np.sin(2 * np.pi * 0.35 * t))
    air = lowpass(pink(length), 1200) * swell * 0.25
    out = widen(np.vstack([drone + air, np.roll(drone, 300) + np.roll(air, 700)]), 1.3)
    return finish(out, LEVEL["bed"], 0.05, keep=length)


# =========================================================================
# The page (src/components/page/uiSound.ts plays these)
# Quiet, short, made for phone speakers (phone_safe), mostly mono (narrow),
# all on the same mallet and felt tick, so they're one family.
# =========================================================================

def ui_open():
    """A pop-up growing out of what you tapped (0.56 s, Sheet.tsx's GROW_MS):
    air rising with the frame's own curve (fast, then a long soft landing),
    and a soft D on the mallet as it settles."""
    length = SHEET_GROW + 0.4
    t = times(length)
    u = np.clip(t / SHEET_GROW, 0, 1)
    shape = 1 - (1 - u) ** 3  # close to iOS's sheet curve: quick, then settling
    speed = np.gradient(shape, t)
    speed = speed / speed.max()
    level = (0.1 + 0.9 * speed) * attack(t, 0.015) * np.where(t < SHEET_GROW, 1.0, decay(t - SHEET_GROW, 0.08))
    air = svf(pink(length), 700 * (2600 / 700) ** shape, 1.4, "band") * level
    out = stereo(length)
    add(out, air, 0, db(0))
    add(out, mallet(NOTE["D6"], 0.6, 0.18, 0.4, 0.4), SHEET_GROW * 0.55, db(-14))
    return finish(reverb(narrow(phone_safe(out), 0.5), 0.18, 0.7, 0.01, 0.6, 21), LEVEL["ui-open"], 0.1)


def ui_close():
    """A pop-up shrinking back in (0.42 s, SHRINK_MS): the open, in reverse:
    air falling, and a tiny felt tick as it lands back in its button."""
    length = SHEET_SHRINK + 0.25
    t = times(length)
    u = np.clip(t / SHEET_SHRINK, 0, 1)
    shape = u * u * (3 - 2 * u)  # ease in and out, like the shrink
    level = (0.2 + 0.8 * np.sin(np.pi * u)) * attack(t, 0.01) * np.where(t < SHEET_SHRINK, 1.0, decay(t - SHEET_SHRINK, 0.05))
    air = svf(pink(length), 2400 * (600 / 2400) ** shape, 1.4, "band") * level
    out = stereo(length)
    add(out, air, 0, db(0))
    add(out, felt_tick(1.1, 0.6, 0.08), SHEET_SHRINK - 0.01, db(-6))
    return finish(reverb(narrow(phone_safe(out), 0.4), 0.12, 0.5, 0.008, 0.6, 22), LEVEL["ui-close"], 0.08)


def ui_tick(on, take):
    """A tick for a tick box, a chip or a segment: a little higher when it
    turns ON, lower when it turns OFF (like a switch). Three takes of each."""
    r = np.random.default_rng(100 + take + (50 if on else 0))
    pitch = (1.25 if on else 0.92) * (1 + r.uniform(-0.03, 0.03))
    out = stereo(0.14)
    add(out, felt_tick(pitch, 0.9 + r.uniform(-0.1, 0.1), 0.14), 0)
    if on:  # a whisper of the mallet's A, so 'on' feels like a yes
        add(out, mallet(NOTE["A6"], 0.14, 0.03, 0.3, 0.3), 0.002, db(-22))
    return finish(phone_safe(out, 200), LEVEL["ui-tick"], 0.04)


def ui_step():
    """Continue (the scout form's step 1 to step 2): the call's first note, A,
    with a little lift of air. The call starts here..."""
    length = 0.9
    out = stereo(length)
    add(out, mallet(NOTE["A5"], length, 0.4, 1.0, 0.6), 0, db(0))
    lift_t = times(0.3)
    add(out, svf(pink(0.3), 800 * 3 ** np.clip(lift_t / 0.25, 0, 1), 1.3, "band") * attack(lift_t, 0.04) * decay(lift_t, 0.08), 0, db(-12))
    return finish(reverb(narrow(phone_safe(out), 0.5), 0.22, 1.0, 0.012, 0.7, 23), LEVEL["ui-step"], 0.2)


def ui_sent():
    """Sent (the sign-up's gone, the email's on its way): the call's first two
    notes, A then D, and then nothing: on purpose, it's unfinished. It finishes
    when they confirm (ui_success). A soft whoosh carries it off."""
    length = 1.3
    out = stereo(length)
    add(out, call_notes(5, length, 0.5, (0.8, 1.0), 2, 0.2, 1.0), 0.05, db(0))
    whoosh_t = times(0.45)
    swoosh = svf(pink(0.45), 600 * 5 ** np.clip(whoosh_t / 0.35, 0, 1), 1.2, "band") * attack(whoosh_t, 0.05) * decay(whoosh_t, 0.12)
    add(out, widen(np.vstack([swoosh, np.roll(swoosh, 41)]), 1.2), 0, db(-10))
    return finish(reverb(phone_safe(out), 0.28, 1.4, 0.012, 0.7, 24), LEVEL["ui-sent"], 0.3)


def ui_success():
    """You're in (confirmed): THE CALL, all three notes, landing on F#, with a
    warm bloom underneath and a few sparkles: the sound of the brand saying yes."""
    length = 2.0
    t = times(length)
    out = stereo(length)
    add(out, call_notes(5, length, 0.7, (0.75, 0.85, 1.0), 3, 0.3, 1.1), 0, db(0))
    add(out, 0.45 * call_notes(6, length, 0.5, (0.6, 0.7, 0.9), 3, 0.5, 0.7), 0.01, db(-4))
    bloom = sum(np.sin(2 * np.pi * NOTE[k] * t) for k in ["D4", "A4", "F#5"])
    bloom = bloom * attack(t, 0.15) * decay(np.maximum(t - 0.2, 0), 0.45)
    add(out, widen(np.vstack([bloom, np.roll(bloom, 131)]), 1.3), 0.15, db(-20))
    for i in range(6):
        f = [NOTE["A7"], NOTE["D8"], NOTE["F#7"]][i % 3] * (1 + rng.uniform(-0.003, 0.003))
        add(out, pan(mallet(f, 0.3, 0.05, 0.35, 0.3), rng.uniform(-0.7, 0.7)), 0.26 + i * 0.035, db(-22 - i))
    return finish(reverb(phone_safe(out, 120), 0.32, 1.8, 0.015, 0.75, 25), LEVEL["ui-success"], 0.4)


def ui_error():
    """Not quite (something needs fixing): two soft, muted notes stepping DOWN
    (F# to E), short and dull. Says 'look again' without a buzzer."""
    length = 0.6
    out = stereo(length)
    add(out, lowpass(mallet(NOTE["F#5"], length, 0.14, 0.5, 0.2), 2200), 0, db(0))
    add(out, lowpass(mallet(NOTE["E5"], length - 0.11, 0.18, 0.45, 0.2), 1900), 0.11, db(-1))
    return finish(reverb(narrow(phone_safe(out), 0.3), 0.12, 0.6, 0.008, 0.4, 26), LEVEL["ui-error"], 0.1)


def ui_copy():
    """Copied your link: a felt tick and a bright little ping (the call's D, up high)."""
    length = 0.5
    out = stereo(length)
    add(out, felt_tick(1.3, 1.0, 0.1), 0, db(0))
    add(out, mallet(NOTE["D7"], 0.48, 0.12, 0.7, 0.5), 0.03, db(-9))
    return finish(reverb(narrow(phone_safe(out), 0.4), 0.2, 0.8, 0.01, 0.7, 27), LEVEL["ui-copy"], 0.1)


SOUNDS = {
    # the intro
    "tap": tap, "grow": grow, "lap": lap, "lock": lock, "home": home, "dock": dock,
    "pop": pop, "ready": ready, "badge": badge, "press": press, "launch": launch,
    "load": load, "title": title, "title-dock": title_dock, "bed": bed,
    "hero-swell": hero_swell, "hero-yet": hero_yet,
    # the page
    "ui-open": ui_open, "ui-close": ui_close, "ui-step": ui_step, "ui-sent": ui_sent,
    "ui-success": ui_success, "ui-error": ui_error, "ui-copy": ui_copy,
    **{f"ui-tick-{'on' if on else 'off'}-{take}": (lambda on=on, take=take: ui_tick(on, take)) for on in (True, False) for take in (1, 2, 3)},
}

# MP3 quality per sound (kbps). The drone is soft and low, and the page's sounds
# are short and quiet, so they need less.
BITRATE = {"bed": 64, **{name: 96 for name in SOUNDS if name.startswith("ui-")}}


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
