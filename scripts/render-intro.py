"""
scripts/render-intro.py  (the intro's sound, v5: "Scenes")

WHAT THIS IS
The intro scored like a film: every scene gets its own sound, made for what's
on screen, and each one CUTS when the next scene comes in, so the scene
changes are heard as well as seen. Nothing piles up from one scene into the
next. All in one key (D major) with one family of sounds (the glassy mallet,
the same deep hit, the same room), so it's one piece, not a pile of jingles.
Everything comes from the middle: nothing moves left and right.

    scene    on screen                                  what you hear
    light    the play button's light shoots out to      a soft press, then a whoosh that
             the edge of the screen, then races         follows the light's speed; as it
             round it                                   races round, a driving pulse and
                                                        arpeggio that build, then suck in
    lock     the outline seals all the way round        a latch, a deep thunk, a glass
                                                        chord blooming
    home     the planet wallpaper, the dock rises,      calm and spacious (the low point
             apps install, ours finishes, its badge     before the climb): a soft pad,
                                                        the dock's swoosh, the draft call
                                                        as our app is ready, a badge pop
    open     our app is tapped and zooms open           a click, then a fast opening whoosh
    load     the browser loads (the red progress bar)   data ticks speeding up with the
                                                        bar, then the title's echo sucked
                                                        in backwards, and a split second
                                                        of silence...
    title    STREAMERDRAFT slams in, copies glitching   ...THE PEAK: the big hit, glitches
                                                        exactly on the copies' jumps, the
                                                        draft call as they snap together
    dock     the title shrinks into the logo            a sweep falling with it, a soft
                                                        landing, the loading boxes humming
    page     "Nobody's watching." ... "Yet."             near silence, then "Yet." hits;
             then the boxes and the gear pop in         soft pops as the boxes fill, the
                                                        gear landing and its lights coming on

LOUDNESS (the loudest 400 ms of each, LUFS: loudness() in render-sounds.py):
peaks and lows in a clear order, the title above everything:
    title -10 > lock -13 = "Yet." (page) > open -16.5 > light -17 > load -18
    > home -20 > dock -21

    python scripts/render-intro.py              (public/sounds/v5 + the manifest)
    python scripts/render-intro.py --preview    (also the whole intro in one file)

It borrows the building blocks (the mallet, the filters, the room, the
loudness meter) from scripts/render-sounds.py, which still makes the page's
own sounds and v2's intro (kept to compare: ?sounds=v2).

TIMINGS come from src/components/launch/timeline.ts and LaunchIntro.module.css
(seconds). If those change, change them here and re-run this script.
"""

import importlib.util
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("sd_sounds", os.path.join(HERE, "render-sounds.py"))
S = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(S)

SR = S.SR
n, times, stereo, add, db = S.n, S.times, S.stereo, S.add, S.db
decay, attack = S.decay, S.attack
NOTE = S.NOTE

# ---- The running order (timeline.ts), seconds after the tap ----
GROW = 1.3  # LED.grow: the light reaches the screen edge
LOCK = GROW + 2.4  # + LED.edgeLap: the outline seals ("fill")
HOME = LOCK + 0.5
PRESS = HOME + 1.45
LOAD = PRESS + 0.8
TITLE = PRESS + 1.45
DOCK = PRESS + 2.95
DONE = PRESS + 3.85
# inside the scenes
H_DOCK, H_ICONS, H_READY, H_BADGE = 0.05, 0.25, 0.7, 1.0  # HOME (timeline.ts)
LAUNCH_AT = 0.2  # the app opens this long after it's tapped
SPLIT = 0.65  # the title's copies jumping, then snapping together (splitA)
SPLIT_KEYS = [0.14, 0.28, 0.45, 0.65]
YET = 0.85  # REVEAL.yet
BOXES = [1.25 + 0.12 * k for k in (1, 2, 3, 4)]  # Join, scout, voice note, Road to 300 (revealAt)
GEAR = [1.25 + (6 + i * 0.75) * 0.12 + 0.4 for i in range(4)]  # the gear landing (Gear.module.css)

# each scene, when it starts and how long it lasts (it's cut when the next one starts)
SCENES = [
    ("light", 0.0, LOCK), ("lock", LOCK, HOME), ("home", HOME, PRESS), ("open", PRESS, LOAD),
    ("load", LOAD, TITLE), ("title", TITLE, DOCK), ("dock", DOCK, DONE), ("page", DONE, None),
]
LEVEL = {"title": -10.0, "lock": -13.0, "page": -13.0, "open": -16.5, "light": -17.0, "load": -18.0, "home": -20.0, "dock": -21.0}


# =========================================================================
# Helpers: centred sound, balanced width, the room
# =========================================================================

def mono_to(x):
    """A sound dead centre (the same on both sides)."""
    return np.vstack([x, x])


def mid(x):
    """Any stereo sound folded to the middle (nothing to one side)."""
    return mono_to((x[0] + x[1]) / 2) if x.ndim == 2 else mono_to(x)


def pair(make, width=0.5):
    """A wide sound that stays centred: made twice (each take a little
    different), one leaning each way. Same energy both sides, so it never
    pulls left or right."""
    a, b = make(), make()
    m, s = (a + b) / 2, (a - b) / 2 * width
    return np.vstack([m + s, m - s])


def room(x, wet=0.25, rt60=1.8, predelay=0.02, bright=0.5, seed=23):
    """The shared room, with its low end the same on both sides (so a deep
    hit's echo never pulls to one side)."""
    if x.ndim == 1:
        x = mono_to(x)
    x = S.ring_out(x)
    ir = S.impulse(rt60, predelay, bright, seed)
    low = S.lowpass((ir[0] + ir[1]) / 2, 300, 4)
    ir = np.vstack([low + S.highpass(ir[0], 300, 4), low + S.highpass(ir[1], 300, 4)])
    wl, wr = S.fftconvolve(x[0], ir[0]), S.fftconvolve(x[1], ir[1])
    out = np.zeros((2, len(wl)))
    out[:, : x.shape[1]] += x * (1 - wet * 0.5)
    out[0] += wl * wet * 0.35
    out[1] += wr * wet * 0.35
    return out


def cut(x, length, fade=0.035):
    """Ends a scene exactly when the next one starts: cut to length, with a
    very short fade so the cut is clean (no click)."""
    x = x[:, : n(length)]
    if x.shape[1] < n(length):
        x = np.pad(x, ((0, 0), (0, n(length) - x.shape[1])))
    k = n(fade)
    x[:, -k:] *= np.cos(np.linspace(0, np.pi / 2, k)) ** 2
    return x


def gate_before(x, at, gap=0.04):
    """Silence for `gap` seconds before `at` (the breath before a hit)."""
    t = np.arange(x.shape[1]) / SR
    g = np.clip((at - gap - t) / 0.012, 0, 1)
    return x * g


def deep_hit(length=1.6, f0=NOTE["D1"], drop=70, tail=0.5, punch=1.0):
    """The family's hit: a click, a kick and a deep boom that drops in pitch,
    with grit so phone speakers still feel it."""
    t = times(length)
    out = np.zeros(len(t))
    kt = times(0.03)
    out[: len(kt)] += np.sin(S.phase_of(120 + 1800 * decay(kt, 0.0018), 0.03)) * decay(kt, 0.012) * db(-4) * punch
    ct = times(0.008)
    out[: len(ct)] += S.highpass(S.white(0.008), 3000) * decay(ct, 0.0015) * db(-10) * punch
    boom = np.sin(S.phase_of(f0 + drop * decay(t, 0.055), length)) * decay(t, tail) * attack(t, 0.003)
    out += S.saturate(boom * 1.4, 2.5) * db(-1)
    return S.ring_out(out)


# =========================================================================
# 1. LIGHT: the tap, the light growing out, then racing round the edge
# =========================================================================

def light():
    length = LOCK
    t = times(length)
    out = stereo(length)

    # the tap: a felt press and a soft thock, a glint of the home note
    add(out, mono_to(S.felt_tick(1.3, 1.0)), 0, db(-6))
    tt = times(0.25)
    add(out, mono_to(S.saturate(np.sin(S.phase_of(110 + 130 * decay(tt, 0.012), 0.25)) * decay(tt, 0.05) * 1.2, 1.6)), 0, db(-6))
    add(out, mono_to(S.mallet(NOTE["D6"], 1.0, 0.35, 0.8, 0.5)), 0.004, db(-19))

    # the light growing to the edge (slow, fast, slow): a whoosh that follows
    # its speed, a tone rising a fifth with it, a little weight underneath
    g = np.clip(t / GROW, 0, 1)
    shape = S.ease_in_out(g)
    speed = np.gradient(shape, t)
    speed = speed / speed.max()
    lvl = (0.1 + 0.9 * speed**1.2) * np.where(t < GROW, 1.0, decay(np.maximum(t - GROW, 0), 0.15)) * attack(t, 0.04)
    cutoff = 240 * 15 ** shape
    whoosh = pair(lambda: S.svf(S.pink(length), cutoff, 1.3, "band"), 0.6) * lvl
    add(out, whoosh, 0, db(-3))
    glide = NOTE["D4"] * (NOTE["A4"] / NOTE["D4"]) ** shape
    tone = (np.sin(S.phase_of(glide, length)) + 0.4 * np.sin(S.phase_of(2 * glide, length))) * lvl
    add(out, mono_to(tone), 0, db(-27))
    add(out, mono_to(S.saturate(np.sin(S.phase_of(46 + 27 * shape, length)) * lvl, 1.8)), 0, db(-17))

    # the light racing round the edge (2.4 s): a driving pulse and a bright
    # arpeggio on the call's chord, building all the way to the lock
    lap = LOCK - GROW
    lt = times(lap)
    u = lt / lap
    build = u**1.6
    step = 0.1  # 16th notes at 150 bpm
    chord = [NOTE["D5"], NOTE["F#5"], NOTE["A5"], NOTE["D6"], NOTE["A5"], NOTE["F#5"]]
    k = 0
    while k * step < lap - 0.22:
        at = k * step
        f = chord[k % len(chord)] * (2 if at > lap * 0.6 and k % 2 else 1)  # the top opens up an octave as it builds
        vel = (0.62 + 0.38 * (at / lap) ** 1.3) * (1.25 if k % 4 == 0 else 0.85)
        note = S.mallet(f, 0.3, 0.07, 0.8, 0.5)
        add(out, mono_to(note), GROW + at, db(-15) * vel)
        k += 1
    # the pulse under it: a bass on D, pumping in 8ths, and a motor that opens up
    bass = np.zeros(len(lt))
    for j in range(int(lap / (2 * step))):
        at = j * 2 * step
        if at > lap - 0.2:
            break
        bt = times(0.18)
        hit = S.saturate(np.sin(S.phase_of(NOTE["D2"] + 30 * decay(bt, 0.01), 0.18)) * decay(bt, 0.07), 1.8)
        s0 = n(at)
        bass[s0: s0 + len(bt)] += hit[: len(bass) - s0] * (0.65 + 0.35 * build[min(s0, len(build) - 1)])
    add(out, mono_to(bass), GROW, db(-9))
    motor = sum(S.supersaw(NOTE[x] * 2 ** (2 * u**2 / 12), lap, 9, 3) for x in ["D3", "A3"])
    motor = S.svf(motor, 300 * (3000 / 300) ** build, 0.9, "low") * (0.5 + 0.5 * build) * (0.7 + 0.3 * np.sin(2 * np.pi * 10 * lt) ** 2)
    add(out, mono_to(motor), GROW, db(-20))
    air = pair(lambda: S.svf(S.pink(lap), 500 * (7000 / 500) ** u, 1.0, "band"), 0.6) * (0.2 + 0.8 * build)
    add(out, air, GROW, db(-16))
    # ...and the lock's own echo, sucked in backwards
    swell = S.reverse_swell(mid(S.lock_layers()), 0.45)
    add(out, swell * np.linspace(0, 1, swell.shape[1]) ** 2, LOCK - 0.45, db(-11))
    out = gate_before(out, LOCK, 0.035)
    out = room(out, 0.16, 1.2, 0.01, 0.6, 23)
    return S.finish(cut(out, length, 0.01), LEVEL["light"], 0.0, keep=length)


# =========================================================================
# 2. LOCK: the outline seals
# =========================================================================

def lock():
    length = HOME - LOCK
    out = stereo(1.6)
    add(out, mono_to(S.felt_tick(1.6, 1.0)), 0, db(-8))  # the latch: click...
    add(out, mono_to(S.felt_tick(1.1, 0.8)), 0.055, db(-12))  # ...clack
    add(out, mid(S.lock_layers()), 0, db(0))  # the thunk and the glass chord blooming
    add(out, mono_to(deep_hit(1.2, NOTE["D1"], 60, 0.25, 0.6)), 0, db(-8))
    x = room(out, 0.3, 2.2, 0.015, 0.7, 23)
    return S.finish(cut(x, length, 0.06), LEVEL["lock"], 0.0, keep=length)


# =========================================================================
# 3. HOME: the planet, the dock, the apps installing, ours ready, its badge
# =========================================================================

def home():
    length = PRESS - HOME
    t = times(length)
    out = stereo(length + 0.5)
    # calm: a soft, airy pad in D (the same chord the lock bloomed), and air
    pad = sum(np.sin(2 * np.pi * NOTE[x] * t) * a for x, a in [("D3", 1.0), ("A3", 0.8), ("E4", 0.5), ("F#4", 0.55), ("A4", 0.35)])
    pad = S.lowpass(pad, 1800) * attack(t, 0.35)
    add(out, mono_to(pad), 0, db(-14))
    air = pair(lambda: S.lowpass(S.pink(length), 2500), 0.7) * attack(t, 0.5)
    add(out, air, 0, db(-26))
    # the dock rising
    dt = times(0.45)
    sweep = S.svf(S.pink(0.45), 350 * (2200 / 350) ** np.clip(dt / 0.3, 0, 1), 1.1, "band") * attack(dt, 0.05) * decay(np.maximum(dt - 0.15, 0), 0.08)
    add(out, mono_to(sweep), H_DOCK, db(-12))
    # the apps appearing on the dock: three soft glass taps
    for i, f in enumerate([NOTE["A5"], NOTE["D6"], NOTE["F#6"]]):
        add(out, mono_to(S.mallet(f, 0.4, 0.12, 0.5, 0.3)), H_ICONS + i * 0.06, db(-24))
    # ours is ready: THE CALL, clear
    add(out, mid(S.call_notes(5, 1.0, 0.5, (0.75, 0.85, 1.0), 3, 0.0, 1.0)), H_READY, db(-9))
    # its red badge: a quick notification pop
    bt = times(0.25)
    blip = np.sin(S.phase_of(NOTE["F#6"] * (NOTE["A6"] / NOTE["F#6"]) ** np.clip(bt / 0.03, 0, 1), 0.25)) * decay(bt, 0.06) * attack(bt, 0.002)
    add(out, mono_to(blip), H_BADGE, db(-17))
    add(out, mono_to(S.felt_tick(2.0, 0.6, 0.05)), H_BADGE, db(-20))
    x = room(out, 0.28, 1.8, 0.02, 0.6, 23)
    return S.finish(cut(x, length, 0.05), LEVEL["home"], 0.0, keep=length)


# =========================================================================
# 4. OPEN: our app tapped, then zooming open
# =========================================================================

def open_():
    length = LOAD - PRESS
    out = stereo(length + 0.6)
    # the tap: press, then release
    add(out, mono_to(S.saturate(S.felt_tick(1.0, 1.0, 0.1) * 1.1, 1.4)), 0, db(0))
    pt = times(0.05)
    add(out, mono_to(np.sin(S.phase_of(140 + 90 * decay(pt, 0.008), 0.05)) * decay(pt, 0.02)), 0, db(-4))
    add(out, mono_to(S.felt_tick(1.6, 0.8, 0.08)), 0.075, db(-8))
    # the window opening out (0.7 s, fast start): a whoosh opening up, a bloom
    # of low end, a glint gliding up from A to D
    ln = 0.75
    t = times(ln)
    op = np.clip(t / 0.4, 0, 1)
    lvl = attack(t, 0.025) * decay(np.maximum(t - 0.09, 0), 0.22)
    cutoff = 500 * (5200 / 500) ** (1 - (1 - op) ** 2)
    whoosh = pair(lambda: S.svf(S.pink(ln), cutoff, 1.0, "band"), 0.8) * lvl
    add(out, whoosh, LAUNCH_AT, db(4))
    add(out, mono_to(S.saturate(np.sin(S.phase_of(55 + 25 * op, ln)) * attack(t, 0.03) * decay(np.maximum(t - 0.08, 0), 0.3), 2.0)), LAUNCH_AT, db(-6))
    zt = times(0.4)
    zoom = np.sin(S.phase_of(NOTE["A5"] * (NOTE["D6"] / NOTE["A5"]) ** np.clip(zt / 0.25, 0, 1), 0.4)) * decay(zt, 0.1) * attack(zt, 0.01)
    add(out, mono_to(zoom), LAUNCH_AT, db(-22))
    x = room(out, 0.2, 1.2, 0.01, 0.6, 23)
    return S.finish(cut(x, length, 0.03), LEVEL["open"], 0.0, keep=length)


# =========================================================================
# 5. LOAD: the browser loading (the progress bar: fast, then easing in)
# =========================================================================

def load():
    length = TITLE - LOAD
    t = times(length)
    out = stereo(length)
    # data ticks, faster and faster, following the bar
    k, when = 0, 0.0
    while when < length - 0.12:
        tick = S.felt_tick(2.2 + 0.9 * when / length, 0.6, 0.03)
        add(out, mono_to(tick), when, db(-17 + 6 * when / length))
        when += 0.075 * (1 - 0.7 * when / length)
        k += 1
    rise = np.sin(S.phase_of(NOTE["D4"] * (NOTE["A4"] / NOTE["D4"]) ** (t / length), length)) * (t / length) ** 2
    add(out, mono_to(rise), 0, db(-24))
    # the title's own hit and crash, backwards: sucked into it
    sw = S.reverse_swell(mid(S.title_hit_layers()), 0.55, 2.8, 13)
    sw = np.vstack([S.highpass(sw[0], 250, 4), S.highpass(sw[1], 250, 4)])
    ct = times(1.2)
    crash = S.highpass(S.white(1.2), 3500) * decay(ct, 0.35) * attack(ct, 0.002)
    wash = S.reverse_swell(mono_to(crash), 0.55, 1.4, 16)
    rush = (sw + 0.8 * wash) * np.linspace(0, 1, n(0.55)) ** 2.2
    add(out, rush, length - 0.55, db(-6))
    out = gate_before(out, length, 0.04)
    return S.finish(cut(out, length, 0.005), LEVEL["load"], 0.0, keep=length)


# =========================================================================
# 6. TITLE: STREAMERDRAFT (the peak)
# =========================================================================

def glitch(strength, seed):
    """A digital stutter, as the title's copies jump (from the middle)."""
    r = np.random.default_rng(seed)
    ln = 0.06
    t = times(ln)
    tone = np.sign(np.sin(2 * np.pi * [NOTE["D5"], NOTE["A5"], NOTE["D6"]][r.integers(3)] * t))
    grit = S.crush(S.bandpass(S.white(ln), 1200, 7000), 5, int(r.integers(6, 16)))
    gate = ((t * 1000) % 15 < 8).astype(float)
    return mono_to((0.5 * tone + grit) * gate * decay(t, 0.025) * strength)


def title():
    length = DOCK - TITLE
    out = stereo(length + 1.0)
    add(out, mid(S.title_hit_layers()), 0)
    add(out, mono_to(deep_hit(2.0, NOTE["D1"], 74, 0.6, 1.0)), 0, db(-6))
    ct = times(1.6)
    crash = pair(lambda: S.highpass(S.white(1.6), 3500), 0.8) * decay(ct, 0.4) * attack(ct, 0.002)
    add(out, crash, 0, db(-15))
    for i, (share, strength) in enumerate(zip(SPLIT_KEYS, [1.0, 0.8, 0.55, 0.35])):
        add(out, glitch(strength, 40 + i), share * SPLIT, db(-12))
    st = times(0.03)
    add(out, mono_to(S.highpass(S.white(0.03), 2500) * decay(st, 0.004)), SPLIT, db(-18))
    the_call = S.call_notes(5, 2.4, 0.9, (0.75, 0.85, 1.0), 3, 0.0, 1.2) + 0.45 * S.call_notes(6, 2.4, 0.7, (0.7, 0.8, 1.0), 3, 0.0, 0.8)
    add(out, mid(the_call), SPLIT - 0.02, db(-14))
    x = room(out, 0.3, 2.6, 0.025, 0.4, 23)
    return S.finish(cut(x, length, 0.08), LEVEL["title"], 0.0, keep=length)


# =========================================================================
# 7. DOCK: the title shrinks into the logo, the loading boxes come in
# =========================================================================

def dock():
    length = DONE - DOCK
    t = times(length)
    out = stereo(length + 0.6)
    # the move is mostly over in the first 0.4 s (fast start, long ease)
    move = 1 - (1 - np.clip(t / 0.45, 0, 1)) ** 2.4
    lvl = attack(t, 0.015) * decay(np.maximum(t - 0.06, 0), 0.16)
    swoosh = pair(lambda: S.svf(S.pink(length), 3400 * (480 / 3400) ** move, 1.1, "band"), 0.6) * lvl
    add(out, swoosh, 0, db(0))
    fall = np.sin(S.phase_of(NOTE["A3"] * (NOTE["D3"] / NOTE["A3"]) ** move, length)) * lvl
    add(out, mono_to(fall), 0, db(-20))
    # landing in the corner
    lt = times(0.12)
    add(out, mono_to(S.saturate(np.sin(S.phase_of(90 + 50 * decay(lt, 0.015), 0.12)) * decay(lt, 0.03), 1.5)), 0.4, db(-10))
    add(out, mono_to(S.felt_tick(1.2, 0.7, 0.05)), 0.4, db(-15))
    # the loading boxes: a low, quiet hum while the page gets ready
    hum = sum(np.sin(2 * np.pi * NOTE[x] * t) for x in ["D3", "A3"]) * attack(np.maximum(t - 0.35, 0), 0.3) * (t > 0.35)
    add(out, mono_to(S.lowpass(hum, 900)), 0, db(-24))
    x = room(out, 0.25, 1.4, 0.015, 0.5, 23)
    return S.finish(cut(x, length, 0.05), LEVEL["dock"], 0.0, keep=length)


# =========================================================================
# 8. PAGE: "Nobody's watching." ... "Yet." Then the boxes and the gear.
# =========================================================================

def page():
    length = 3.9
    out = stereo(length)
    # "Nobody's watching.": low and soft, gone just before "Yet." (that silence is the beat)
    t = times(YET)
    lvl = np.interp(t, [0, 0.45, 0.62, 0.72, YET], [0, 1, 0.9, 0, 0])
    pad = sum(np.sin(2 * np.pi * NOTE[k] * t) + 0.25 * np.sin(4 * np.pi * NOTE[k] * t) for k in ["D3", "A3", "E4"])
    add(out, mono_to(S.lowpass(pad, 1400) * lvl), 0, db(-20))
    add(out, pair(lambda: S.svf(S.pink(YET), 400 * (1600 / 400) ** np.clip(t / 0.6, 0, 1), 1.0, "band") * lvl, 0.6), 0, db(-18))
    add(out, mono_to(S.saturate(np.sin(2 * np.pi * NOTE["D2"] * t) * lvl, 1.5)), 0, db(-25))
    # "Yet.": a tight hit, a deep boom, and the call's last two notes (the line answers the title)
    yt = times(1.8)
    add(out, mono_to(deep_hit(1.8, NOTE["D1"], 60, 0.32, 1.0)), YET, db(0))
    add(out, mono_to(S.bandpass(S.white(0.12), 1500, 4500) * decay(times(0.12), 0.02)), YET, db(-12))
    add(out, mono_to(S.mallet(NOTE["D6"], 1.6, 0.6, 1.2, 0.8, 3)), YET + 0.004, db(-11))
    add(out, mono_to(S.mallet(NOTE["F#6"], 1.5, 0.9, 1.0, 0.8, -3)), YET + 0.12, db(-11))
    stab = sum(S.supersaw(NOTE[k], 1.8, 7, 3) for k in ["D2", "A2", "D3"])
    stab = S.svf(stab, 500 + 2200 * decay(yt, 0.1), 0.8, "low") * decay(yt, 0.3) * attack(yt, 0.004)
    add(out, mono_to(S.ring_out(S.saturate(stab * 0.6, 1.4))), YET, db(-12))
    # the boxes filling in: soft pops on the call's notes (A, D, F#, then A)
    for at, f in zip(BOXES, [NOTE["A5"], NOTE["D6"], NOTE["F#6"], NOTE["A6"]]):
        add(out, mono_to(S.mallet(f, 0.5, 0.14, 0.7, 0.4)), at, db(-24))
        add(out, mono_to(S.felt_tick(1.4, 0.5, 0.05)), at, db(-30))
    # the gear landing (soft, low thuds) and its red lights coming on (a faint hum)
    for at in GEAR:
        gt = times(0.15)
        add(out, mono_to(S.saturate(np.sin(S.phase_of(80 + 60 * decay(gt, 0.012), 0.15)) * decay(gt, 0.04), 1.4)), at, db(-24))
    on = GEAR[-1] + 0.2
    ht = times(0.9)
    hum = (np.sin(2 * np.pi * 100 * ht) + 0.5 * np.sin(2 * np.pi * 200 * ht) + 0.25 * np.sin(2 * np.pi * 300 * ht))
    hum *= attack(ht, 0.02) * decay(ht, 0.35) * (0.6 + 0.4 * (np.sin(2 * np.pi * 14 * ht) > 0))
    add(out, mono_to(S.ring_out(hum)), on, db(-34))
    x = room(out, 0.22, 1.6, 0.015, 0.5, 23)
    return S.finish(x, LEVEL["page"], 0.4)


SOUNDS = {"light": light, "lock": lock, "home": home, "open": open_, "load": load, "title": title, "dock": dock, "page": page}
# which take of each (the random parts: noise, the synth's phases), so re-running gives the same sounds
TAKE = {name: 500 + i for i, name in enumerate(SOUNDS)}


def main():
    out_dir = os.path.join(HERE, "..", "public", "sounds", "v5")
    manifest_path = os.path.join(HERE, "..", "src", "components", "launch", "sounds.v5.json")
    os.makedirs(out_dir, exist_ok=True)
    made, manifest = {}, {}
    for name, make in SOUNDS.items():
        S.rng = np.random.default_rng(TAKE[name])
        x = make()
        made[name] = x
        S.save_mp3(os.path.join(out_dir, f"{name}.mp3"), x, 128)
        manifest[name] = {"onset": round(S.onset(x), 5), "length": round(x.shape[1] / SR, 4)}
        size = os.path.getsize(os.path.join(out_dir, f"{name}.mp3")) / 1024
        print(f"{name:6s} {x.shape[1] / SR:5.2f}s  loudest {S.loudness(x):6.1f} LUFS  peak {20 * np.log10(np.max(np.abs(x)) + 1e-12):6.1f} dB  {size:5.1f} KB")
    with open(manifest_path, "w") as f:
        json.dump({"_about": "Made by scripts/render-intro.py: where each sound really starts (see onset() in render-sounds.py)", "onsetDb": S.ONSET_DB, **manifest}, f, indent=2)
    print("manifest ->", os.path.relpath(manifest_path))
    if "--preview" in sys.argv:
        total = stereo(DONE + 4.2)
        for name, start, _end in SCENES:
            add(total, made[name], start)
        total = S.limit(total, -1.0)
        S.save_mp3(os.path.join(out_dir, "preview.mp3"), total, 160)
        if "--wav" in sys.argv:
            S.save_wav(os.path.join(out_dir, "preview.wav"), total)
        print("preview ->", os.path.relpath(os.path.join(out_dir, "preview.mp3")))


if __name__ == "__main__":
    main()
