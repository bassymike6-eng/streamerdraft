"""
scripts/render-bassify.py  (the intro's sound, "Bassify": v1+ with a bassline)

WHAT THIS IS
The bassline under the intro (what everyone hears: v1+, plus this). In D, the
first thing you hear is bass, and it follows the intro to the end. Made the
way big tech launch ads (like Robinhood's relaunch film, scored by Zelig)
make bass that hits on a TV and still comes through on a phone:

  ONE BASS THAT NEVER STOPS   not separate notes: one synth that keeps playing,
                              gliding from note to note (no gaps, no clicks)
  TWO LAYERS                  the SUB (a pure, deep sine you feel on a TV or
                              headphones) and the GROWL (two saws slightly out
                              of tune, which slowly swirl against each other).
                              The growl is what a phone hears: it's made of
                              overtones, which a phone speaker CAN play
  THE FILTER IS THE MOVEMENT  the growl's brightness opens and closes with the
                              intro: dark at home, opening as the light races
                              round, wide open on the drops
  PULSES                      "dum dum dum": on each beat the bass hits, then
                              sinks back, without stopping
  BOOMS                       on the big moments (the tap, the lock, the title,
                              "Yet."): a deep drop in pitch, the trailer "boom"
  THE VACUUM                  just before the title, everything is sucked out
                              (a reversed swell rising into the hit), so the
                              drop lands harder
  PHONE-READY                 nothing below 30 Hz (no speaker can play it, it
                              just eats loudness and makes phones' speaker
                              protection turn everything down), the notes sit
                              where TVs can play them, and overtones on top
                              that a phone can play (phone_bass)

    when     on screen                       the bass
    0        tap: the light shoots out       BOOM + a deep D glides in
    1.3      the light races round           pulses on D, then F#, G, A, the
                                             growl opening, getting louder
    3.7      lock                            BOOM: back home to D
    4.2      the home screen                 a dark, soft D (the low point)
    5.65     our app tapped, zooms open      a pulse, then a glide up to A
    6.45     loading                         climbing fast up to C#, then...
    6.95                                     ...THE VACUUM (silence, a swell sucking in)
    7.1      STREAMERDRAFT                   THE DROP: the biggest BOOM, wide-open D,
                                             then pulsing "dum dum dum dum"
    7.75     the copies snap                 dum-dum, up an octave
    8.6      the title shrinks away          the bass slows to a stop (tape stop)
    9.5      "Nobody's watching."            silence
    10.35    "Yet."                          BOOM + D
    10.97    the boxes fill in               D, F#, A, D, one per box
    11.87    the gear lands                  a last D, closing and fading

HOW THE SITE PLAYS IT
One file (two versions: bass.mp3, and bass-phone.mp3 for phones), cut into
scenes as it plays: each scene plays its own stretch of the file, starting
when that scene starts (soundCues.ts), so the bass stays locked to the
picture even if a phone runs a scene a little late. Each scene's stretch
starts on a new note, so the cuts can't be heard.

    python scripts/render-bassify.py
        public/sounds/bassify/bass.mp3, bass-phone.mp3
        src/components/launch/sounds.bassify.json (where each really starts)
"""

import importlib.util
import json
import os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("sd_sounds", os.path.join(HERE, "render-sounds.py"))
S = importlib.util.module_from_spec(spec)
spec.loader.exec_module(S)
SR = S.SR
n, times, db, decay, attack = S.n, S.times, S.db, S.decay, S.attack

# notes (Hz)
D1, A1, D2, Fs2, G2, A2, B2, Cs3, D3 = 36.71, 55.0, 73.42, 92.50, 98.0, 110.0, 123.47, 138.59, 146.83

# the intro's moments (seconds after the tap): timeline.ts
GROW, LOCK, HOME, PRESS, LAUNCH, LOAD, TITLE, DOCK, DONE = 1.3, 3.7, 4.2, 5.65, 5.85, 6.45, 7.1, 8.6, 9.5
YET = DONE + 0.85
SNAP = TITLE + 0.65
BOXES = [DONE + 1.25 + 0.12 * k for k in (1, 2, 3, 4)]
GEAR = DONE + 1.25 + 6 * 0.12 + 0.4
LENGTH = 13.6
VACUUM = 0.15  # the silence before the title drop

# how loud the bassline is, as loudness (LUFS), under v1+ (its loudest moment,
# the title, peaks at -1.3 dB with v1+ on top: nothing clips)
TARGET = -16.1
# TWO VERSIONS. The site knows if it's on a phone, so it plays the one made
# for that:
#   "big"    computers, TVs, headphones: the full sub
#   "phone"  phone speakers: the sub turned down (a phone can't play it; it
#            only makes the phone's speaker protection turn EVERYTHING down)
#            and the growl and the overtones turned up, so you still hear
#            every note. (Phone + earphones also works: it's just a bit brighter)
#   GROWL   the growl, next to the sub
#   BRIGHT  how bright the growl is (x the cut-offs in track())
#   RING    how much its filter rings (the "wub": a peak a phone hears well)
#   PHONE   how much of the phone overtones (phone_bass)
#   SUB     the deep part (below ~90 Hz), in dB
VERSIONS = {
    "big": dict(GROWL=0.8, BRIGHT=1.3, RING=1.2, PHONE=1.6, SUB=0.0),
    "phone": dict(GROWL=1.2, BRIGHT=1.8, RING=1.5, PHONE=3.0, SUB=-8.0),
}
GROWL, BRIGHT, RING, PHONE, SUB = 0.8, 1.3, 1.2, 1.6, 0.0
# the sub, once a note has started (share of its hit), and the growl's
# darkest (Hz): a held, dark, pure tone reads as a hum, not music
SUB_HOLD = 0.5
FLOOR = 380
# The phone version's level (dB, next to the big one, on headphones). On a
# phone speaker it then comes through about 5 dB louder than the big one
# would; on earphones it's only a touch louder and brighter
PHONE_LIFT = 1.5


class Line:
    """The one bass synth: arrays over the whole intro for its pitch, its
    volume, how bright its growl is, and how much sub and growl it has."""

    def __init__(self):
        size = n(LENGTH)
        self.f = np.full(size, D2)
        self.a = np.zeros(size)
        self.cut = np.full(size, 200.0)
        self.sub = np.ones(size)
        self.growl = np.ones(size)
        self.since = np.full(size, 9.0)  # seconds since the note started

    def note(self, start, end, f, frm=None, glide=0.06, level=-6.0, rise=0.006, tail=None,
             cut=(900, 300, 0.3), sub=1.0, growl=1.0):
        """Play f from start to end (seconds). frm: glide in from this pitch.
        tail: fade (seconds to a third) instead of holding. cut: the growl's
        brightness (start Hz, end Hz, how fast it closes)."""
        a, b = n(start), min(n(end), len(self.a))
        t = np.arange(b - a) / SR
        self.f[a:b] = f * (frm / f) ** decay(t, glide / 3) if frm else f
        env = db(level) * attack(t, rise)
        if tail:
            env = env * decay(t, tail)
        self.a[a:b] = env
        c0, c1, tau = cut
        self.cut[a:b] = c1 + (c0 - c1) * decay(t, tau)
        self.sub[a:b] = sub
        self.growl[a:b] = growl
        self.since[a:b] = t

    def pulses(self, start, step, count, floor=0.35, tau=0.07, open_by=1.6):
        """'dum dum dum': on each beat the bass hits and its growl opens, then
        both sink back (to `floor`) before the next, without stopping."""
        for i in range(count):
            a = n(start + i * step)
            b = min(n(start + (i + 1) * step), len(self.a))
            t = np.arange(b - a) / SR
            hit = floor + (1 - floor) * decay(t, tau) * attack(t, 0.003)
            self.a[a:b] *= hit
            self.cut[a:b] *= 1 + (open_by - 1) * decay(t, tau * 1.4)


def render_line(line):
    """The sub and the growl, from the Line."""
    size = len(line.a)
    seconds = size / SR
    # (smooth everything a touch, so no change of note or volume clicks)
    amp = S.lowpass(line.a, 120, 1)
    f = np.exp(S.lowpass(np.log(line.f), 60, 1))
    cut = np.exp(S.lowpass(np.log(np.maximum(line.cut, FLOOR) * BRIGHT), 40, 1))
    ph = S.phase_of(f, seconds)
    # THE SUB: a pure sine, with a little of its octave so a TV hears it. It
    # hits hard as each note starts, then sits back (to SUB_HOLD) and lets the
    # growl carry the note: a held pure sine just sounds like a hum
    hold = SUB_HOLD + (1 - SUB_HOLD) * decay(line.since, 0.3)
    sub = (np.sin(ph) + 0.12 * np.sin(2 * ph)) * line.sub * S.lowpass(hold, 60, 1)
    # THE GROWL: two saws ~11 cents apart (they swirl against each other: the
    # 'reese' sound) and one an octave up, quiet, through the moving filter
    saws = 0.5 * S.saw(f * 2 ** (11 / 1200), seconds) + 0.5 * S.saw(f * 2 ** (-11 / 1200), seconds)
    saws += 0.22 * S.saw(f * 2, seconds)
    growl = S.svf(saws, cut, RING, "low")
    growl = S.highpass(growl, 70, 2)  # (the sub does the deep part)
    growl = S.saturate(growl * 1.6, 1.6) * line.growl
    return (sub + GROWL * growl) * amp


def boom(length=1.0, top=170.0, bottom=52.0, sweep=0.11, tail=0.25, punch=1.0):
    """The trailer 'boom': a sine dropping fast from `top` to `bottom`, with a
    soft click on the front. Driven a little, so phones hear its overtones."""
    t = times(length)
    f = bottom + (top - bottom) * decay(t, sweep / 3)
    body = np.sin(S.phase_of(f, length)) * decay(t, tail) * attack(t, 0.0015)
    body = S.saturate(body * 1.8, 1.8)
    click = S.bandpass(S.white(length), 900, 4500) * decay(t, 0.0025) * 0.25 * punch
    out = body + click
    out *= np.clip((length - t) / 0.02, 0, 1)
    return out


def suck(length, f=D2):
    """The vacuum's swell: the echo of a bright bass note played backwards, so
    it rises INTO the drop."""
    t = times(0.5)
    note = S.saw(f, 0.5) * decay(t, 0.15)
    note = S.svf(note, 1400 * decay(t, 0.12) + 200, 0.8, "low")
    rev = S.reverse_swell(note, length, rt60=1.6, seed=5)
    rev = (rev[0] + rev[1]) / 2
    rev = S.bandpass(rev, 60, 2500, 2)
    return rev / (np.max(np.abs(rev)) + 1e-12)


def track():
    L = Line()
    # 0  the tap: a deep D glides in under the BOOM; the growl opens as the light grows
    L.note(0.0, GROW, D2, frm=D3, glide=0.12, level=-4, cut=(1500, 380, 0.35), sub=1.0)
    # 1.3  the lap: pulses, D then F#, G, A (the tension), opening, getting louder
    step = 0.15
    plan = [D2] * 8 + [Fs2, Fs2, G2, G2, A2, A2, A2, A2]
    for i, f in enumerate(plan):
        u = i / (len(plan) - 1)
        prev = plan[i - 1] if i else D2
        L.note(GROW + i * step, GROW + (i + 1) * step, f, frm=prev if prev != f else None, glide=0.03,
               level=-11 + 7 * u, rise=0.002, cut=(420 + 900 * u, 420 + 900 * u, 1.0), sub=0.9)
    L.pulses(GROW, step, len(plan), floor=0.4, tau=0.06, open_by=1.7)
    # 3.7  the lock: home to D, the growl closing slowly
    L.note(LOCK, HOME, D2, frm=A2, glide=0.05, level=-4, cut=(1400, 260, 0.25), sub=1.0)
    # 4.2  the home screen: dark and soft, swelling in
    L.note(HOME, PRESS, D2, level=-15, rise=0.35, cut=(170, 230, 1.0), sub=1.0, growl=0.6)
    # 5.65  the tap on our app (a pulse), then the glide up as it zooms open
    L.note(PRESS, LAUNCH, A1, level=-9, rise=0.003, cut=(900, 300, 0.06), sub=1.0)
    L.note(LAUNCH, LOAD, A2, frm=A1, glide=0.45, level=-11, rise=0.01, cut=(350, 900, 0.2), sub=0.9)
    # 6.45  loading: climbing fast in 16ths, opening up, then the vacuum
    climb = [A2, A2, B2, B2, Cs3]
    for i, f in enumerate(climb):
        u = i / (len(climb) - 1)
        L.note(LOAD + i * 0.095, LOAD + (i + 1) * 0.095, f, level=-13 + 5 * u, rise=0.002,
               cut=(700 + 900 * u, 700 + 900 * u, 1.0), sub=0.7)
    L.pulses(LOAD, 0.095, len(climb), floor=0.3, tau=0.045, open_by=1.5)
    # (TITLE - VACUUM to TITLE: nothing, the vacuum)
    # 7.1  THE DROP: wide open, then "dum dum dum dum" on the beat
    L.note(TITLE, DOCK, D2, frm=D3, glide=0.06, level=-5, cut=(2000, 520, 0.4), sub=1.0)
    L.pulses(TITLE + 0.3, 0.3, 2, floor=0.5, tau=0.1, open_by=1.6)
    # 7.75  the copies snap: dum-dum, the second an octave up
    L.note(SNAP, SNAP + 0.15, D2, level=-6, rise=0.002, cut=(1500, 500, 0.08))
    L.note(SNAP + 0.15, SNAP + 0.45, D3, level=-8, rise=0.002, cut=(1600, 500, 0.12), sub=0.6)
    L.note(SNAP + 0.45, DOCK, D2, level=-8, rise=0.004, cut=(900, 400, 0.2))
    L.pulses(SNAP + 0.45, 0.2, 2, floor=0.5, tau=0.08, open_by=1.4)
    # 8.6  the title shrinks away: the bass slows to a stop (pitch falling, closing)
    L.note(DOCK, DONE - 0.1, D2, level=-8, cut=(600, 120, 0.25), sub=1.0)
    a, b = n(DOCK), n(DONE - 0.1)
    t = np.arange(b - a) / SR
    L.f[a:b] = D2 * 2 ** (-1.4 * (t / (DONE - 0.1 - DOCK)) ** 1.6)  # down ~1.4 octaves
    L.a[a:b] *= np.clip(1 - (t / (DONE - 0.1 - DOCK)) ** 1.3, 0, 1)
    # 9.5  "Nobody's watching.": silence
    # 10.35  "Yet.": back on D
    L.note(YET, BOXES[0], D2, frm=A2, glide=0.05, level=-5, cut=(1600, 400, 0.3), sub=1.0)
    # 10.97  the boxes: D, F#, A, D, one per box
    for at, f in zip(BOXES, [D2, Fs2, A2, D3]):
        L.note(at, at + 0.12, f, level=-11, rise=0.002, cut=(1300, 500, 0.06), sub=0.8)
    L.note(BOXES[-1] + 0.12, GEAR, D2, level=-16, rise=0.05, cut=(300, 250, 1.0), sub=1.0, growl=0.5)
    # 11.87  the gear lands: a last D, closing and fading
    L.note(GEAR, LENGTH, D2, level=-10, rise=0.004, tail=0.6, cut=(900, 140, 0.35), sub=1.0)

    out = render_line(L)

    def put(x, at, gain):
        a = n(at)
        m = min(len(x), len(out) - a)
        out[a: a + m] += x[:m] * gain

    # the BOOMS
    # (short ones: a long boom left ringing at the bottom just sounds like a hum)
    put(boom(1.0, 160, 52, 0.12, 0.25), 0.0, db(-2))
    put(boom(0.8, 150, 54, 0.10, 0.19), LOCK, db(-4))
    put(boom(1.1, 190, 50, 0.11, 0.33, 1.2), TITLE, db(-1))
    put(boom(0.9, 160, 52, 0.10, 0.22), YET, db(-3))
    # the vacuum's swell, rising into the title
    put(suck(0.55), TITLE - 0.55, db(-12))
    # and a smaller one into "Yet." (out of the silence)
    put(suck(0.3), YET - 0.3, db(-20))
    return S.ring_out(out)  # (the last note fades away instead of stopping dead)


def phone_bass(x):
    """The phone trick: the bass's overtones (2 to 5 times its pitch), where
    a phone speaker CAN play. The ear fills in the low note itself."""
    low = S.lowpass(x, 220, 4)
    k = 3.0 / (np.max(np.abs(low)) + 1e-12)
    h = np.tanh(k * low) + 0.6 * np.tanh(k * low) ** 2
    h = S.bandpass(h - np.mean(h), 200, 1100, 2)
    return h / (np.max(np.abs(h)) + 1e-12) * np.max(np.abs(low))


def low_shelf(x, f0, gain_db, slope=1.0):
    """Turns everything below f0 up or down by gain_db (the standard 'RBJ'
    shelf), leaving the rest alone."""
    from scipy.signal import lfilter
    a_ = 10 ** (gain_db / 40)
    w0 = 2 * np.pi * f0 / SR
    alpha = np.sin(w0) / 2 * np.sqrt((a_ + 1 / a_) * (1 / slope - 1) + 2)
    c, r = np.cos(w0), 2 * np.sqrt(a_) * alpha
    b = [a_ * ((a_ + 1) - (a_ - 1) * c + r), 2 * a_ * ((a_ - 1) - (a_ + 1) * c), a_ * ((a_ + 1) - (a_ - 1) * c - r)]
    a = [(a_ + 1) + (a_ - 1) * c + r, -2 * ((a_ - 1) + (a_ + 1) * c), (a_ + 1) + (a_ - 1) * c - r]
    return lfilter(np.array(b) / a[0], np.array(a) / a[0], x)


def phone_speaker(x):
    """Roughly what a phone speaker plays: nothing much below 350 Hz."""
    return S.lowpass(S.highpass(x, 350, 4), 9000, 2)


def render(version):
    """One version of the bassline (see VERSIONS), as a stereo clip."""
    g = globals()
    g.update(VERSIONS[version])
    S.rng = np.random.default_rng(78)  # (the same swirl in both versions)
    x = track()
    x = x + PHONE * phone_bass(x)
    if SUB:
        x = low_shelf(x, 100, SUB)
    x = S.highpass(x, 30, 4)  # nothing below 30 Hz: no speaker plays it
    # (glue: a gentle squash, so the bass sits dense and even like an ad mix)
    x = S.saturate(x / np.max(np.abs(x)) * 1.3, 1.3)
    return np.vstack([x, x])  # (bass sits dead centre: the same on one phone speaker)


def main():
    out_dir = os.path.join(HERE, "..", "public", "sounds", "bassify")
    manifest_path = os.path.join(HERE, "..", "src", "components", "launch", "sounds.bassify.json")
    os.makedirs(out_dir, exist_ok=True)
    big = render("big")
    big = S.limit(big * db(TARGET - S.loudness(big)), -3.0)
    phone = render("phone")
    phone = S.limit(phone * db(TARGET + PHONE_LIFT - S.loudness(phone)), -3.0)
    manifest = {}
    for name, x in (("bass", big), ("bass-phone", phone)):
        S.save_mp3(os.path.join(out_dir, f"{name}.mp3"), x, 128)
        manifest[name] = {"onset": round(S.onset(x), 5), "length": round(x.shape[1] / SR, 4)}
        print(f"{name:10s} loudest {S.loudness(x):5.1f} LUFS, on a phone speaker {S.loudness(S.each(x, phone_speaker)):5.1f},"
              f" peak {20 * np.log10(np.max(np.abs(x))):5.1f} dB")
    with open(manifest_path, "w") as f:
        json.dump({"_about": "Made by scripts/render-bassify.py: where the bassline really starts (see onset() in render-sounds.py)",
                   "onsetDb": S.ONSET_DB, **manifest}, f, indent=2)
    print("manifest ->", os.path.relpath(manifest_path))


if __name__ == "__main__":
    main()
