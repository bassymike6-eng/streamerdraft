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

// Mac-style dock magnification: when the cursor reaches the dock, the icons
// near it grow (from their bottom edge) and spread apart a little.
// By distance from our app: [ours, next to it, two away, three away].
//   scale   how much each icon grows
//   spread  how far it moves away from ours, in px
// HomeScreen.tsx applies these, and the launch below starts from our icon's grown size.
export const DESK_MAGNIFY = { scale: [1.28, 1.12, 1.04, 1], spread: [0, 5, 7, 8] };

// Dock sizes per device. The CSS reads these too (--I, --dockH, --dockB),
// so the dock always matches the maths. magnify: how big our icon is when it's
// tapped (only the Mac-style dock magnifies).
const DOCKS = {
  phone: { icon: 60, radius: 14, height: 108, bottom: 8, magnify: 1 },
  tablet: { icon: 68, radius: 16, height: 100, bottom: 14, magnify: 1 },
  deskDock: { icon: 54, radius: 13, height: 72, bottom: 10, magnify: DESK_MAGNIFY.scale[0] },
  deskBar: { icon: 34, radius: 8, height: 52, bottom: 0, magnify: 1 },
};

// When you force a device with ?device= on a bigger screen, it's shown in a frame this size.
const PREVIEW_SIZES = { phone: [390, 844], tablet: [1180, 820] } as const;

// How round each device's screen corners are, so the light (EdgeLight.tsx)
// hugs them instead of drawing a square box. Phones ~ an iPhone's curve,
// tablets ~ an iPad's, computers ~ a browser window's corners.
const EDGE_RADIUS = { phone: 46, tablet: 20, desk: 10 } as const;

export type Geometry = {
  W: number; // screen width
  H: number; // screen height
  k: number; // preview scale (1 on a real device)
  framed: boolean;
  frameRadius: number;
  edgeRadius: number; // how round the screen's corners are (for the light)
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
  titleH: number;
  titleX: number;
  titleY: number;
  logoX: number;
  logoY: number;
  logoScale: number;
  pad: number;
  headerH: number;
};

// wordRatio: the title's width / height in the brand font (measured: see brand-font.ts).
// Anton's STREAMERDRAFT is about 5; a script font's is smaller (shorter and taller).
export function computeGeometry(device: Device, dockStyle: DockStyle, forced: boolean, wordRatio = 5): Geometry {
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

  // 1. App opening out of its icon, at the size it is when it's tapped.
  // A magnified icon grows from its bottom edge, so its centre rises.
  const tappedIcon = dock.icon * dock.magnify;
  const tappedY = Y - (tappedIcon - dock.icon) / 2;
  const launchScale = tappedIcon / Math.min(W, H);
  const insetTop = H > W ? (H - W) / 2 : 0;
  const insetLeft = W > H ? (W - H) / 2 : 0;

  // 2. Title: big in the middle, then docked top left as the logo.
  // Sized by width, but never taller than 30% of the screen (a tall script font
  // would otherwise fill it), and the logo never taller than the header allows.
  const titleW = Math.min(W * (device === "phone" ? 0.84 : 0.7), 900, H * 0.3 * wordRatio);
  const titleH = titleW / wordRatio;
  // the page's side margin: computers get more room, growing with the screen (up to 72px)
  const pad = device === "phone" ? 20 : device === "tablet" ? 28 : Math.round(Math.min(72, Math.max(32, W * 0.055)));
  // (a little shorter on short screens, so the page fits without scrolling)
  const headerH = device === "phone" ? (H < 700 ? 56 : 64) : H < 700 ? 64 : 76;
  const logoW = Math.min(device === "phone" ? 150 : device === "tablet" ? 168 : 180, (headerH - 20) * wordRatio);
  const contentLeft = Math.max(0, (W - 1440) / 2) + pad; // the page's header is max 1440px wide (Page.module.css)

  return {
    W, H, k, framed, frameRadius,
    edgeRadius: framed ? frameRadius : EDGE_RADIUS[device],
    icon: dock.icon, iconRadius: dock.radius, dockH: dock.height, dockB: dock.bottom, Y,
    launchScale,
    launchDy: tappedY - H / 2,
    insetTop,
    insetLeft,
    insetRadius: (dock.radius * dock.magnify) / launchScale,
    titleW,
    titleH,
    titleX: (W - titleW) / 2,
    titleY: (H - titleH) / 2 - H * 0.02,
    logoX: contentLeft,
    logoY: (headerH - logoW / wordRatio) / 2,
    logoScale: logoW / titleW,
    pad,
    headerH,
  };
}

// Turns the geometry into CSS custom properties for the root element's style.
export function geometryVars(g: Geometry): Record<string, string> {
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
    "--wh": px(g.titleH),
    "--cx": px(g.titleX),
    "--cy": px(g.titleY),
    "--kx": px(g.logoX),
    "--ky": px(g.logoY),
    "--ks": g.logoScale.toFixed(4),
    "--pad": px(g.pad),
    "--hh": px(g.headerH),
  };
}
