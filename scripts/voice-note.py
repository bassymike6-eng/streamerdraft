# scripts/voice-note.py
#
# WHAT THIS IS
# Turns a raw voice recording (your phone, or your streaming mic) into the
# founder voice note the page plays, plus the loudness the 4 bars dance to.
#
#   1. trims to just your talking. It finds where you start and stop by itself
#      (ignoring short clicks, like your thumb tapping stop), or you tell it:
#        --from 1.345   everything before this is dropped (e.g. you picking
#                       up the mic). The note starts 0.15 s before it.
#        --to 50.12     everything after this is dropped (e.g. putting it down)
#   2. cleans it up, gently, without changing how your voice sounds:
#        pops       "p" and "b" right on the mic send a burst of air that hits
#                   it as a deep thump. Only during those bursts, the part
#                   below 120 Hz is turned down (back to your voice's level)
#        too close  being very close to the mic swells the low end (the
#                   "proximity" boom). Where it's well above your normal,
#                   it's eased back a little (4 dB at most)
#        then       rumble below 75 Hz cut, the quiet bits between lines a
#                   little lower (breaths), loud and quiet words evened out a
#                   touch
#   3. sets the overall level to -16 LUFS (the usual level for voice on the
#      web), with a gentle limiter keeping the peaks under -1.5 dB, and writes
#      public/voice/founder.mp3
#   4. measures how loud it is 30 times a second and writes
#      src/components/page/founderLevels.json (VoiceNote.tsx moves the bars by it)
#
# The captions' timings live in src/components/page/founderNote.ts. They're
# measured from the START OF THE TRIMMED FILE, so if you re-record, the
# script prints where it trimmed: take that off the times you hear in the raw take.
#
# NEEDS: Python with numpy, and ffmpeg on your PATH (it reads .m4a too).
# USAGE: python scripts/voice-note.py path/to/recording.m4a [--from SECONDS] [--to SECONDS]
#   The current note (Recording 2, 20 Oct): --from 1.345 --to 50.12

import argparse
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from numpy.lib.stride_tricks import sliding_window_view

ROOT = Path(__file__).resolve().parent.parent
OUT_MP3 = ROOT / "public" / "voice" / "founder.mp3"
OUT_LEVELS = ROOT / "src" / "components" / "page" / "founderLevels.json"

SR = 48000
FRAME = 0.02  # seconds per loudness reading when finding the speech
SPEECH_DB = -45  # louder than this counts as talking
MIN_SPEECH = 3  # ...for at least this many readings in a row (60 ms), so a click doesn't count
LEAD = 0.22  # seconds of quiet kept before the first word (found by itself)
TAIL = 0.20  # ...and after the last one
LEAD_FROM = 0.15  # seconds kept before --from
TAIL_TO = 0.13  # ...and after --to
LEVEL_RATE = 30  # loudness readings per second for the bars (LEVEL_RATE in founderNote.ts)
TARGET = -16.0  # LUFS
CEILING = -1.5  # dB: the loudest any peak may be


def decode(path: Path) -> np.ndarray:
    # (pan=mono takes the left side as it is: a stereo file with the same
    # sound on both sides would otherwise come out louder)
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-af", "pan=mono|c0=c0", "-ar", str(SR), "-f", "f32le", "-"],
        capture_output=True, check=True,
    ).stdout
    return np.frombuffer(raw, "<f4").astype(np.float64)


def loudness_db(x: np.ndarray, hop: int) -> np.ndarray:
    frames = len(x) // hop
    blocks = x[: frames * hop].reshape(frames, hop)
    return 20 * np.log10(np.sqrt(np.mean(blocks**2, axis=1)) + 1e-9)


def find_speech(x: np.ndarray) -> tuple[float, float]:
    db = loudness_db(x, int(FRAME * SR))
    loud = db > SPEECH_DB
    # a run of at least MIN_SPEECH loud readings is talking (a click is shorter)
    runs, i = [], 0
    while i < len(loud):
        if loud[i]:
            j = i
            while j < len(loud) and loud[j]:
                j += 1
            if j - i >= MIN_SPEECH:
                runs.append((i, j))
            i = j
        else:
            i += 1
    if not runs:
        sys.exit("Couldn't find any talking in that file (is it silent?)")
    start = max(0.0, runs[0][0] * FRAME - LEAD)
    end = min(len(x) / SR, runs[-1][1] * FRAME + TAIL)
    return round(start, 3), round(end, 3)


# ---- The clean-up's tools ----

def low_part(x: np.ndarray, hz: float, order: int = 4) -> np.ndarray:
    """Just the part of x below hz. x - low_part(x) is then exactly the rest,
    so turning one part down and adding them back changes nothing else."""
    spectrum = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    return np.fft.irfft(spectrum / np.sqrt(1 + (f / hz) ** (2 * order)), len(x))


def band_db(x: np.ndarray, lo: float, hi: float, hop: int) -> np.ndarray:
    """How loud one band (lo to hi Hz) is, every hop samples (dB)."""
    spectrum = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    y = np.fft.irfft(spectrum * ((f >= lo) & (f < hi)), len(x))
    frames = len(y) // hop
    return 10 * np.log10(np.mean(y[: frames * hop].reshape(frames, hop) ** 2, axis=1) + 1e-14)


def smooth_gain(target_db: np.ndarray, attack: float, release: float, hop: int) -> np.ndarray:
    """A gain (dB, 0 or below) that drops fast (attack, seconds) and comes
    back slowly (release), so the changes can't be heard as jumps."""
    a, r = np.exp(-hop / SR / attack), np.exp(-hop / SR / release)
    out, g = np.empty_like(target_db), 0.0
    for i, t in enumerate(target_db):
        g = a * g + (1 - a) * t if t < g else r * g + (1 - r) * t
        out[i] = g
    return out


def per_sample(gain_db: np.ndarray, hop: int, count: int) -> np.ndarray:
    at = (np.arange(len(gain_db)) + 0.5) * hop
    return 10 ** (np.interp(np.arange(count), at, gain_db) / 20)


def fix_pops(x: np.ndarray, hop: int) -> np.ndarray:
    voice = band_db(x, 300, 3000, hop)
    thump = band_db(x, 20, 90, hop)
    over = thump - voice
    is_pop = (thump > -34) & (over > 10)  # loud, and far louder than the voice
    gain = smooth_gain(np.where(is_pop, -np.minimum(over, 24), 0.0), 0.001, 0.04, hop)
    low = low_part(x, 120)
    return (x - low) + low * per_sample(gain, hop, len(x))


def ease_boom(x: np.ndarray, hop: int) -> np.ndarray:
    voice = band_db(x, 300, 3000, hop)
    low_db = band_db(x, 70, 220, hop)
    talking = voice > -45
    w = int(0.4 * SR / hop)  # judged over about half a second, not syllable by syllable
    low_e = np.convolve(10 ** (low_db / 10) * talking, np.ones(w), "same")
    voice_e = np.convolve(10 ** (voice / 10) * talking, np.ones(w), "same")
    share = 10 * np.log10((low_e + 1e-14) / (voice_e + 1e-14))
    enough = np.convolve(talking, np.ones(w), "same") > w * 0.25
    normal = np.median(share[enough])
    target = np.where(enough, -np.minimum(np.clip(share - (normal + 4), 0, None) * 0.5, 4.0), 0.0)
    gain = smooth_gain(target, 0.05, 0.2, hop)
    low = low_part(x, 230, 2)
    return (x - low) + low * per_sample(gain, hop, len(x))


def integrated_lufs(x: np.ndarray) -> float:
    r = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-f", "f64le", "-ar", str(SR), "-ac", "1", "-i", "-",
         "-af", "loudnorm=print_format=json", "-f", "null", "-"],
        input=x.astype("<f8").tobytes(), capture_output=True,
    ).stderr.decode()
    return float(json.loads(r[r.rindex("{"): r.rindex("}") + 1])["input_i"])


def limit(x: np.ndarray, ceiling_db: float = CEILING, look: float = 0.0015, release: float = 0.06) -> np.ndarray:
    """Turns the volume down just around a peak that would go over the
    ceiling (seeing it coming 1.5 ms ahead), then smoothly back up."""
    ceiling = 10 ** (ceiling_db / 20) * 0.95  # (room for the peaks between samples)
    need = np.minimum(1.0, ceiling / np.maximum(np.abs(x), 1e-9))
    k = int(look * SR)
    lowest = sliding_window_view(np.pad(need, (k, k), constant_values=1.0), 2 * k + 1).min(axis=1)
    r = np.exp(-1 / (release * SR))
    gain, g = np.empty_like(lowest), 1.0
    for i, t in enumerate(lowest):
        g = t if t < g else r * g + (1 - r) * t
        gain[i] = g
    return x * np.minimum(gain, need)


def run_ffmpeg(x: np.ndarray, filters: str, out: list[str]) -> bytes:
    return subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-f", "f64le", "-ar", str(SR), "-ac", "1", "-i", "-", "-af", filters, "-ar", str(SR), "-ac", "1", *out],
        input=x.astype("<f8").tobytes(), capture_output=True, check=True,
    ).stdout


def main() -> None:
    args = argparse.ArgumentParser(description="Makes the founder voice note from a raw recording.")
    args.add_argument("recording")
    args.add_argument("--from", dest="start_at", type=float, help="drop everything before this (seconds)")
    args.add_argument("--to", dest="end_at", type=float, help="drop everything after this (seconds)")
    a = args.parse_args()
    x = decode(Path(a.recording))

    # 1. what to keep
    if a.start_at:
        k, fade = int(a.start_at * SR), int(0.02 * SR)
        x[:k] = 0
        x[k: k + fade] *= np.linspace(0, 1, fade)
    if a.end_at:
        k, fade = int(a.end_at * SR), int(0.03 * SR)
        x[k:] = 0
        x[k - fade: k] *= np.linspace(1, 0, fade)
    start, end = find_speech(x)
    if a.start_at:
        start = round(max(0.0, a.start_at - LEAD_FROM), 3)
    if a.end_at:
        end = round(min(len(x) / SR, a.end_at + TAIL_TO), 3)
    length = end - start
    print(f"keeping {start:.3f}s to {end:.3f}s of the raw take -> {length:.2f}s long")

    # 2. the clean-up (pops, then the boom), then the usual tidy
    hop = int(0.005 * SR)
    x = ease_boom(fix_pops(x, hop), hop)
    tidy = (
        f"atrim=start={start}:end={end},asetpts=PTS-STARTPTS,"
        "highpass=f=75,"
        # the quiet bits between lines down by up to ~10 dB, gently (not a hard gate)
        "agate=threshold=0.008:ratio=2:attack=5:release=200:range=0.3,"
        # evens out loud and quiet words a touch
        "acompressor=threshold=-24dB:ratio=2.5:attack=8:release=140,"
        f"afade=t=in:d=0.04,afade=t=out:st={max(0, length - 0.15):.3f}:d=0.15"
    )
    y = np.frombuffer(run_ffmpeg(x, tidy, ["-f", "f32le", "-"]), "<f4").astype(np.float64)

    # 3. the level: -16 LUFS, peaks under -1.5 dB (twice: limiting lowers it a touch)
    was = integrated_lufs(y)
    for _ in range(2):
        y = limit(y * 10 ** ((TARGET - integrated_lufs(y)) / 20))
    OUT_MP3.parent.mkdir(parents=True, exist_ok=True)
    run_ffmpeg(y, "anull", ["-c:a", "libmp3lame", "-b:a", "128k", str(OUT_MP3)])
    print(f"wrote {OUT_MP3.relative_to(ROOT)} (was {was:.1f} LUFS, now {TARGET:.0f})")

    # 4. the bars: how loud it is LEVEL_RATE times a second, 0 (quiet) to 1 (loudest)
    y = decode(OUT_MP3)
    db = loudness_db(y, SR // LEVEL_RATE)
    floor, top = -48.0, float(np.percentile(db, 98))  # the loudest 2% all count as "full"
    levels = np.clip((db - floor) / (top - floor), 0, 1) ** 1.4  # a curve, so quiet syllables stay small
    # a touch of smoothing (a 3-reading average), so the bars glide rather than flicker
    levels = np.convolve(levels, np.ones(3) / 3, mode="same")
    OUT_LEVELS.write_text(json.dumps({
        "duration": round(len(y) / SR, 3),
        "rate": LEVEL_RATE,
        "levels": [round(float(v), 2) for v in levels],
    }, separators=(",", ":")))
    print(f"wrote {OUT_LEVELS.relative_to(ROOT)} ({len(levels)} readings, {len(y) / SR:.2f}s)")


if __name__ == "__main__":
    main()
