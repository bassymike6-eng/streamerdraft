// src/components/launch/geometry.ts
//
// WHAT THIS IS
// Every size and position the animations need, worked out from the screen size.
// They're handed to the CSS as custom properties (--W, --Y, --kx ...), so the
// CSS file never has to guess where things are.
//
// THE THREE TRICKS THAT NEED MATHS
// 1. The app opening out of its icon
//    The app window is always full screen. At the start we shrink it (--is) and
//    move it down (--dy) so it sits exactly on the dock icon, and crop it to a
//    square with rounded corners (--it, --il, --ir). Then we animate all of that
//    back to normal, which looks like the icon growing into the app.
// 2. The title docking into the top left
//    The title is drawn big. --cx/--cy put it in the middle; --kx/--ky/--ks are
//    where (and how small) it ends up as the page's logo.
// 3. The dock icon position
//    Our icon is always the middle one in the dock, so it sits on the centre
//    line; --Y is its centre, from the dock's height and gap from the bottom.

import type { Device, DockStyle } from "./detect";

// Dock sizes per device. The CSS reads these too (--I, --dockH, --dockB),
// so the dock always matches the maths.
const DOCKS = {
  phone: { icon: 60, radius: 14, height: 88, bottom: 10 },
  tablet: { icon: 72, radius: 17, height: 100, bottom: 14 },
  deskDock: { icon: 54, radius: 13, height: 72, bottom: 10 },
  deskBar: { icon: 34, radius: 8, height: 52, bottom: 0 },
};

// When you force a device with ?device= on a bigger screen, it's shown in a frame this size.
const PREVIEW_SIZES = { phone: [390, 844], tablet: [1180, 820] } as const;

export type Geometry = {
  W: number; // screen width
  H: number; // screen height
  k: number; // preview scale (1 on a real device)
  framed: boolean;
  frameRadius: number;
  icon: number;
  iconRadius: number;
  dockH: number;
  dockB: number;
  Y: number; // centre of our dock icon
  launchScale: number;
  launchDy: number;
  insetTop: number;
  insetLeft: number;
  insetRadius: number;
  titleW: number;
  titleX: number;
  titleY: number;
  logoX: number;
  logoY: number;
  logoScale: number;
  pad: number;
  headerH: number;
};

export function computeGeometry(device: Device, dockStyle: DockStyle, forced: boolean): Geometry {
  const winW = window.innerWidth;
  const winH = window.innerHeight;

  // Real device: the screen is the window. Forced phone/tablet on a big screen: show a frame.
  let W = winW;
  let H = winH;
  let framed = false;
  if (forced && device !== "desk" && winW > PREVIEW_SIZES[device][0] + 60) {
    framed = true;
    W = PREVIEW_SIZES[device][0];
    H = PREVIEW_SIZES[device][1];
  }
  const k = framed ? Math.min(1, (winW - 40) / W, (winH - 40) / H) : 1;
  const frameRadius = framed ? (device === "phone" ? 46 : 22) : 0;

  const dock =
    device === "phone" ? DOCKS.phone
    : device === "tablet" ? DOCKS.tablet
    : dockStyle === "bar" ? DOCKS.deskBar
    : DOCKS.deskDock;
  const Y = H - dock.bottom - dock.height / 2;

  // 1. App opening out of its icon
  const launchScale = dock.icon / Math.min(W, H);
  const insetTop = H > W ? (H - W) / 2 : 0;
  const insetLeft = W > H ? (W - H) / 2 : 0;

  // 2. Title: big in the middle, then docked top left as the logo
  const titleW = Math.min(W * (device === "phone" ? 0.84 : 0.7), 900);
  const titleH = titleW * 0.2;
  const pad = device === "phone" ? 20 : device === "tablet" ? 28 : 32;
  const headerH = device === "phone" ? 64 : 76;
  const logoW = device === "phone" ? 150 : device === "tablet" ? 168 : 180;
  const contentLeft = Math.max(0, (W - 1120) / 2) + pad; // page content is max 1120px wide

  return {
    W, H, k, framed, frameRadius,
    icon: dock.icon, iconRadius: dock.radius, dockH: dock.height, dockB: dock.bottom, Y,
    launchScale,
    launchDy: Y - H / 2,
    insetTop,
    insetLeft,
    insetRadius: dock.radius / launchScale,
    titleW,
    titleX: (W - titleW) / 2,
    titleY: (H - titleH) / 2 - H * 0.02,
    logoX: contentLeft,
    logoY: (headerH - logoW * 0.2) / 2,
    logoScale: logoW / titleW,
    pad,
    headerH,
  };
}

// Turns the geometry into CSS custom properties for the root element's style.
// a0 = where the light was on the button's ring when it was tapped (so it carries on from there).
export function geometryVars(g: Geometry, a0: number): Record<string, string> {
  const px = (n: number) => `${Math.round(n * 100) / 100}px`;
  return {
    "--W": px(g.W),
    "--H": px(g.H),
    "--k": String(g.k),
    "--fr": px(g.frameRadius),
    "--I": px(g.icon),
    "--IR": px(g.iconRadius),
    "--dockH": px(g.dockH),
    "--dockB": px(g.dockB),
    "--Y": px(g.Y),
    "--is": g.launchScale.toFixed(5),
    "--dy": px(g.launchDy),
    "--it": px(g.insetTop),
    "--il": px(g.insetLeft),
    "--ir": px(g.insetRadius),
    "--ww": px(g.titleW),
    "--cx": px(g.titleX),
    "--cy": px(g.titleY),
    "--kx": px(g.logoX),
    "--ky": px(g.logoY),
    "--ks": g.logoScale.toFixed(4),
    "--pad": px(g.pad),
    "--hh": px(g.headerH),
    "--a0": `${a0}deg`,
  };
}
