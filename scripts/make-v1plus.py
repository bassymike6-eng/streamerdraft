"""
scripts/make-v1plus.py  (the intro's sound, "v1+": v1, polished)

WHAT THIS IS
v1, the first intro sound, with the same sounds at the same moments. Only
two things change:

  THE LEVELS   v1 levelled each sound by its loudest instant, so a few sat in
               the wrong place: the play button's tap was nearly as loud as
               "Yet.", the install chime nearly as loud as the lock, "Yet."
               quieter than the lock, and the build into the title too faint.
               Now: the title is the peak, then "Yet.", then the lock.
  LEFT/RIGHT   things still come from where they are on screen, and the
               light's lap still follows the light round, but gentler: no
               hard left-right ping-pong. Here, the few sounds that lean hard
               to one side are brought towards the middle; the movement while
               they play is softened in the cue sheet (soundCues.ts).

It starts from v1's own sounds: scripts/render-sounds-v1.py makes them again
exactly (same seed), except "Yet.", which comes from the v1 file itself (the
file the site played differs slightly from what the script makes now).

    python scripts/make-v1plus.py      (public/sounds/v1plus + sounds.v1plus.json)
"""

import importlib.util
import json
import os
import subprocess

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
spec = importlib.util.spec_from_file_location("v1", os.path.join(HERE, "render-sounds-v1.py"))
V1 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(V1)
spec = importlib.util.spec_from_file_location("sd_sounds", os.path.join(HERE, "render-sounds.py"))
S = importlib.util.module_from_spec(spec)
spec.loader.exec_module(S)
SR = S.SR

# The only changes (dB): the tap and the install chime down, "Yet." above the
# lock, the title a touch up as the peak, the build into it stronger
TRIM = {"tap": -3.0, "ready": -2.0, "lock": -1.0, "press": -1.0, "hero-yet": 2.8, "title": 0.5, "load": 2.0, "dock": 1.5}
# Sounds that lean hard to one side: how much of their left/right difference to keep
NARROW = {"title": 0.55, "title-dock": 0.55, "ready": 0.55, "lock": 0.55, "hero-yet": 0.55, "launch": 0.55}


def decode(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "s16le", "-ac", "2", "-ar", str(SR), "-"], capture_output=True).stdout
    return np.frombuffer(raw, "<i2").reshape(-1, 2).T.astype(np.float64) / 32768


def main():
    out_dir = os.path.join(ROOT, "public", "sounds", "v1plus")
    manifest_path = os.path.join(ROOT, "src", "components", "launch", "sounds.v1plus.json")
    os.makedirs(out_dir, exist_ok=True)
    manifest = {}
    for name, make in V1.SOUNDS.items():
        if name == "hero-yet":
            x = decode(os.path.join(ROOT, "public", "sounds", "v1", "hero-yet.mp3"))
            x = x[:, int(round(max(S.onset(x) - 0.00008, 0) * SR)):]  # (no MP3 start gap)
        else:
            x = make()
            if x.ndim == 1:
                x = np.vstack([x, x])
        if name in NARROW:
            x = S.widen(x, NARROW[name])
        x = x * S.db(TRIM.get(name, 0.0))
        if np.max(np.abs(x)) > S.db(-1.0):
            x = S.limit(x, -1.0)
        S.save_mp3(os.path.join(out_dir, f"{name}.mp3"), x, V1.BITRATE.get(name, 128))
        manifest[name] = {"onset": round(S.onset(x), 5), "length": round(x.shape[1] / SR, 4)}
        print(f"{name:11s} {x.shape[1] / SR:5.2f}s  loudest {S.loudness(x):6.1f} LUFS  peak {20 * np.log10(np.max(np.abs(x)) + 1e-12):6.1f} dB")
    with open(manifest_path, "w") as f:
        json.dump({"_about": "Made by scripts/make-v1plus.py: where each sound really starts (see onset() in render-sounds.py)", "onsetDb": S.ONSET_DB, **manifest}, f, indent=2)
    print("manifest ->", os.path.relpath(manifest_path))


if __name__ == "__main__":
    main()
