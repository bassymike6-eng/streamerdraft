"""Renders the StreamerDraft home-screen wallpaper: an invented copper gas giant
with rings, in a quiet star field. Two crops: portrait (phones, tablets upright)
and landscape (computers, tablets sideways). Everything is procedural, so the
picture is ours.

Usage (from the project folder): python scripts/render-planet.py public/intro
Needs Python 3 with numpy and Pillow (pip install numpy pillow).
"""
import sys
import numpy as np
from PIL import Image

OUT = sys.argv[1]
SCALE = float(sys.argv[2]) if len(sys.argv) > 2 else 1.0


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def noise2d(w, h, cells, octaves, seed, gain=0.55):
    """Fractal value noise, roughly -0.5..0.5, made by upsampling random grids."""
    r = np.random.default_rng(seed)
    acc = np.zeros((h, w), np.float32)
    amp, total = 1.0, 0.0
    for o in range(octaves):
        cw, ch = max(2, int(cells[0] * 2 ** o)), max(2, int(cells[1] * 2 ** o))
        grid = r.random((ch, cw)).astype(np.float32)
        up = Image.fromarray(grid, mode="F").resize((w, h), Image.BICUBIC)
        acc += amp * (np.asarray(up, np.float32) - 0.5)
        total += amp
        amp *= gain
    return acc / total


def lut_colour(stops, n=2048):
    """stops: [(position 0..1, (r,g,b) 0..255)] -> n x 3 float array 0..1"""
    xs = np.linspace(0, 1, n)
    pos = np.array([s[0] for s in stops])
    cols = np.array([s[1] for s in stops], np.float32) / 255
    return np.stack([np.interp(xs, pos, cols[:, c]) for c in range(3)], axis=1).astype(np.float32)


def sample(lut, t):
    idx = np.clip((t * (len(lut) - 1)).astype(np.int32), 0, len(lut) - 1)
    return lut[idx]


# ---- the planet's look (shared by both crops) ----
TILT = np.radians(-11)  # rings and bands, tilted on screen
ELEV = np.radians(12)  # how far above the ring plane we're looking from
K = np.sin(ELEV)  # ring ellipse flattening
LIGHT = np.array([-0.62, -0.42, 0.66])
LIGHT /= np.linalg.norm(LIGHT)

BANDS = lut_colour([
    (0.00, (52, 18, 11)), (0.18, (92, 36, 20)), (0.36, (150, 72, 38)), (0.52, (190, 112, 66)),
    (0.68, (222, 160, 108)), (0.84, (238, 196, 150)), (1.00, (246, 222, 188)),
])
RINGCOL = lut_colour([(0.0, (92, 82, 76)), (0.45, (168, 154, 138)), (0.75, (212, 198, 178)), (1.0, (234, 224, 208))])

# Band pattern by latitude (1D), plus turbulence textures (2D, lon x lat)
lat_axis = np.linspace(-1, 1, 4096)
r1 = np.random.default_rng(11)
band_noise = np.interp(lat_axis, np.linspace(-1, 1, 70), r1.random(70))
band_f = (0.52 + 0.22 * np.sin(lat_axis * 7.1 + 0.7) + 0.09 * np.sin(lat_axis * 17 + 1.9)
          + 0.03 * np.sin(lat_axis * 41 + 0.4) + 0.24 * (band_noise - 0.5))
# soften it: real gas giants have broad, blurry bands, not wood grain
band_f = np.convolve(band_f, np.ones(41) / 41, mode="same")
band_f = np.clip(band_f, 0, 1).astype(np.float32)
TURB_BIG = noise2d(1024, 512, (6, 10), 5, 21)  # broad wobble of the band edges
TURB_FINE = noise2d(2048, 1024, (24, 60), 4, 33)  # streaky detail along the bands

# Ring brightness by distance from the planet's centre (in planet radii)
rho_axis = np.linspace(1.0, 2.6, 8192)
r2 = np.random.default_rng(5)
ring_noise = np.interp(rho_axis, np.linspace(1.0, 2.6, 900), r2.random(900))
ring_noise2 = np.interp(rho_axis, np.linspace(1.0, 2.6, 1400), r2.random(1400))
ring_a = (smoothstep(1.30, 1.34, rho_axis) * (1 - smoothstep(2.26, 2.30, rho_axis)))
zone = np.where(rho_axis < 1.53, 0.32, np.where(rho_axis < 1.95, 1.0, 0.72))  # inner faint, middle bright, outer
gaps = (1 - 0.92 * smoothstep(1.945, 1.955, rho_axis) * (1 - smoothstep(2.0, 2.01, rho_axis))  # the big gap
        ) * (1 - 0.55 * smoothstep(2.165, 2.17, rho_axis) * (1 - smoothstep(2.178, 2.183, rho_axis)))  # a thin one
ring_alpha = (ring_a * zone * gaps * (0.62 + 0.25 * ring_noise + 0.13 * ring_noise2)).astype(np.float32)
ring_tone = np.clip(0.35 + 0.45 * ring_noise + 0.2 * np.sin(rho_axis * 60), 0, 1).astype(np.float32)


def lookup(arr, axis_lo, axis_hi, x):
    idx = np.clip(((x - axis_lo) / (axis_hi - axis_lo) * (len(arr) - 1)).astype(np.int32), 0, len(arr) - 1)
    return arr[idx]


def tex(t, u, v):
    """Sample a 2D texture at u (lon -1..1) and v (lat -1..1)."""
    h, w = t.shape
    x = np.clip(((u + 1) / 2 * (w - 1)).astype(np.int32), 0, w - 1)
    y = np.clip(((v + 1) / 2 * (h - 1)).astype(np.int32), 0, h - 1)
    return t[y, x]


def render(W, H, cx, cy, R, seed, name):
    print("rendering", name, W, H)
    img = np.zeros((H, W, 3), np.float32)

    # ---- space: near black, a little depth, faint dust ----
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    vign = 1 - 0.55 * smoothstep(0.3, 1.2, np.hypot((xx - W / 2) / W, (yy - H * 0.35) / H) * 1.6)
    dust = noise2d(W // 4, H // 4, (3, 4), 5, seed + 1)
    dust = np.asarray(Image.fromarray(dust, mode="F").resize((W, H), Image.BICUBIC))
    dust = np.clip(dust + 0.15, 0, None) * 0.05
    img[..., 0] = 0.008 + dust * 0.55
    img[..., 1] = 0.009 + dust * 0.42
    img[..., 2] = 0.016 + dust * 0.75
    img *= vign[..., None]
    del xx, yy, vign, dust

    # ---- stars ----
    r = np.random.default_rng(seed)
    n = int(W * H / 9000)
    sx, sy = r.random(n) * W, r.random(n) * H
    mag = r.random(n) ** 6  # mostly faint, a few bright
    for x0, y0, m in zip(sx, sy, mag):
        bright = 0.25 + 1.6 * m
        sigma = (0.55 + 1.1 * m) * max(1.0, W / 2400)
        rad = int(np.ceil(sigma * 3))
        xi, yi = int(x0), int(y0)
        xs = np.arange(max(0, xi - rad), min(W, xi + rad + 1))
        ys = np.arange(max(0, yi - rad), min(H, yi + rad + 1))
        if len(xs) == 0 or len(ys) == 0:
            continue
        gx, gy = np.meshgrid(xs, ys)
        k = np.exp(-((gx - x0) ** 2 + (gy - y0) ** 2) / (2 * sigma ** 2)) * bright
        tint = np.array([1.0, 0.96, 0.9]) if r.random() < 0.5 else np.array([0.88, 0.94, 1.0])
        img[ys[0]:ys[-1] + 1, xs[0]:xs[-1] + 1] += k[..., None] * tint

    # ---- planet and rings, a strip of rows at a time ----
    ct, st = np.cos(TILT), np.sin(TILT)
    axis = np.array([0.0, -np.cos(ELEV), np.sin(ELEV)])  # the planet's north pole, tipped towards us
    e1 = np.array([1.0, 0.0, 0.0])
    e2 = np.cross(axis, e1)
    for y0 in range(0, H, 400):
        y1 = min(H, y0 + 400)
        yy, xx = np.mgrid[y0:y1, 0:W].astype(np.float32)
        dx, dy = (xx - cx) / R, (yy - cy) / R
        u = dx * ct + dy * st  # along the bands / ring plane
        v = -dx * st + dy * ct
        rr = np.sqrt(u * u + v * v)
        px = 1.0 / R  # one pixel, in planet radii

        # rings: distance from the centre in the ring plane
        rho = np.sqrt(u * u + (v / K) ** 2)
        ra = lookup(ring_alpha, 1.0, 2.6, rho)
        rt = lookup(ring_tone, 1.0, 2.6, rho)
        rcol = sample(RINGCOL, rt)
        rlit = np.clip(0.82 - 0.2 * u / 2.3, 0.45, 1.1)  # the left (lit) side is brighter
        back = v < 0
        # the planet's shadow on the rings: does a ray from the ring towards the light hit the planet?
        Q = np.stack([u, v, v / np.tan(ELEV)], -1)  # the ring point in 3D (it lies on the ring plane)
        b = Q @ LIGHT
        disc = b * b - (np.sum(Q * Q, -1) - 1)
        shadow = smoothstep(-0.02, 0.06, disc) * (b < 0)
        rcol = rcol * (rlit * (1 - 0.85 * shadow))[..., None]

        # planet surface
        inside = rr < 1 + 2 * px
        z = np.sqrt(np.clip(1 - rr * rr, 0, 1))
        P = np.stack([u, v, z], -1)
        sinlat = P @ axis
        lon = np.arctan2(P @ e1, P @ e2) / np.pi
        # longitude is meaningless right at the pole, so the swirls fade out near it
        calm = 1 - smoothstep(0.8, 0.96, np.abs(sinlat))
        latw = sinlat + calm * (0.05 * tex(TURB_BIG, lon, sinlat) + 0.012 * tex(TURB_FINE, lon * 0.6, sinlat))
        col = sample(BANDS, lookup(band_f, -1, 1, latw))
        detail = 1 + 0.07 * calm * tex(TURB_FINE, lon * 1.7, sinlat * 1.3)
        polar = 1 - 0.35 * smoothstep(0.55, 0.95, np.abs(sinlat))
        col = col * (detail * polar)[..., None]
        ndl = P @ LIGHT
        light = 0.03 + 1.05 * smoothstep(-0.12, 0.75, ndl)
        limb = 0.55 + 0.45 * z ** 0.55
        col = col * (light * limb)[..., None]
        # the rings' shadow on the planet: follow the ray towards the light to the ring plane
        la = LIGHT @ axis
        t = -sinlat / la
        Qs = P + t[..., None] * LIGHT
        rs = lookup(ring_alpha, 1.0, 2.6, np.sqrt(np.sum(Qs * Qs, -1))) * (t > 0)
        col = col * (1 - 0.7 * rs)[..., None]
        cover = np.clip((1 - rr) / px * 0.7 + 0.5, 0, 1) * inside  # smooth edge
        # a thin haze of atmosphere on the lit edge
        haze = np.exp(-np.clip(rr - 1, 0, None) / (6 * px)) * (rr > 1) * np.clip(ndl + 0.3, 0, 1) * 0.18

        out = img[y0:y1]
        a_back = ra * back
        out[:] = out * (1 - a_back[..., None]) + rcol * a_back[..., None]
        out[:] = out * (1 - cover[..., None]) + col * cover[..., None]
        out[:] += haze[..., None] * np.array([0.95, 0.62, 0.42])
        a_front = ra * (~back)
        out[:] = out * (1 - a_front[..., None]) + rcol * a_front[..., None]

    # ---- finish: gentle tone curve, grain to stop banding ----
    img = np.clip(img, 0, None)
    img = img / (1 + img * 0.18)  # soft shoulder on the brightest bits
    img = np.clip(img ** (1 / 1.06), 0, 1)
    grain = np.random.default_rng(seed + 9).normal(0, 1.1 / 255, img.shape).astype(np.float32)
    img = np.clip(img + grain, 0, 1)
    out = Image.fromarray((img * 255 + 0.5).astype(np.uint8))
    out.save(f"{OUT}/{name}.webp", quality=86, method=6)
    out.resize((W // 4, H // 4), Image.LANCZOS).save(f"{OUT}/{name}-preview.png")
    print("saved", name)


s = SCALE
# Portrait: phones and upright tablets. Planet low and centred, cut by the bottom edge.
render(int(2400 * s), int(3000 * s), 1200 * s, 2380 * s, 640 * s, 101, "planet-portrait")
# Landscape: computers and sideways tablets. Planet low, right of centre.
render(int(3840 * s), int(2400 * s), 2420 * s, 1930 * s, 880 * s, 202, "planet-landscape")
