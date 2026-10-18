# scripts/voice-note.py
#
# WHAT THIS IS
# Turns a raw voice memo (straight off your phone) into the founder voice note
# the page plays, plus the loudness the 4 bars dance to.
#
#   1. finds where you start and stop talking, and trims to just around that
#      (it ignores short clicks, like your thumb tapping stop at the end)
#   2. cleans it up, gently: cuts rumble below 75 Hz, turns the quiet bits
#      between lines down a little (breaths, room hiss), evens out loud and quiet
#      words a touch, then sets the overall level to -16 LUFS (the usual level
#      for voice on the web) with peaks kept under -1.5 dB
#   3. writes public/voice/founder.mp3
#   4. measures how loud it is 30 times a second and writes
#      src/components/page/founderLevels.json (VoiceNote.tsx moves the bars by it)
#
# The captions' timings live in src/components/page/founderNote.ts. They're
# measured from the START OF THE TRIMMED FILE, so if you re-record, the
# script prints where it trimmed: take that off the times you hear in the raw take.
#
# NEEDS: Python with numpy, and ffmpeg on your PATH (it reads phone audio, .m4a).
# USAGE: python scripts/voice-note.py path/to/recording.m4a

import json
import subprocess
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
OUT_MP3 = ROOT / "public" / "voice" / "founder.mp3"
OUT_LEVELS = ROOT / "src" / "components" / "page" / "founderLevels.json"

SR = 48000
FRAME = 0.02  # seconds per loudness reading when finding the speech
SPEECH_DB = -45  # louder than this counts as talking
MIN_SPEECH = 3  # ...for at least this many readings in a row (60 ms), so a click doesn't count
LEAD = 0.22  # seconds of quiet kept before the first word
TAIL = 0.20  # ...and after the last one
LEVEL_RATE = 30  # loudness readings per second for the bars (LEVEL_RATE in founderNote.ts)


def decode(path: Path) -> np.ndarray:
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
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


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit(__doc__ or "usage: python scripts/voice-note.py recording.m4a")
    src = Path(sys.argv[1])
    x = decode(src)
    start, end = find_speech(x)
    length = end - start
    print(f"talking from {start:.2f}s to {end:.2f}s in the raw take -> {length:.2f}s long")

    clean = (
        f"atrim=start={start}:end={end},asetpts=PTS-STARTPTS,"
        "highpass=f=75,"
        # the quiet bits between lines down by up to ~10 dB, gently (not a hard gate)
        "agate=threshold=0.008:ratio=2:attack=5:release=200:range=0.3,"
        # evens out loud and quiet words a touch
        "acompressor=threshold=-24dB:ratio=2.5:attack=8:release=140,"
        f"afade=t=in:d=0.04,afade=t=out:st={max(0, length - 0.15):.3f}:d=0.15"
    )

    # Two passes for the level: measure, then set it exactly
    measure = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", str(src), "-af", f"{clean},loudnorm=I=-16:TP=-1.5:LRA=9:print_format=json", "-f", "null", "-"],
        capture_output=True, text=True, check=True,
    ).stderr
    m = json.loads(measure[measure.rindex("{"): measure.rindex("}") + 1])
    level = (
        f"loudnorm=I=-16:TP=-1.5:LRA=9:linear=true:measured_I={m['input_i']}:measured_TP={m['input_tp']}"
        f":measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:offset={m['target_offset']}"
    )
    OUT_MP3.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-i", str(src), "-af", f"{clean},{level}", "-ar", str(SR), "-ac", "1",
         "-c:a", "libmp3lame", "-b:a", "128k", str(OUT_MP3)],
        check=True,
    )
    print(f"wrote {OUT_MP3.relative_to(ROOT)} (was {m['input_i']} LUFS, now -16)")

    # The bars: how loud it is LEVEL_RATE times a second, 0 (quiet) to 1 (loudest)
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
