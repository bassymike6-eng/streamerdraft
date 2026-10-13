// src/components/launch/Wallpaper.tsx
//
// WHAT THIS IS
// The home-screen wallpaper: our own rendered planet (an invented copper gas
// giant with rings) in a quiet star field. It's a normal image, so it looks
// the same in every browser and stays sharp on high-res screens:
//   public/intro/planet-portrait.webp   2400 x 3000, phones and upright tablets
//   public/intro/planet-landscape.webp  3840 x 2400, computers and sideways tablets
// The CSS picks one (--wall) by the screen's shape. The glass dock and Search
// pill show bent copies of the same image (see "Liquid glass" in the CSS).
//
// To change the planet (colours, size, position), edit and re-run
// scripts/render-planet.py (needs Python with numpy and Pillow).

import { preload } from "react-dom";
import styles from "./LaunchIntro.module.css";

// wide: is the screen wider than it is tall. Only the image this screen will
// actually show is fetched early (fetching both made the browser warn that one
// was "preloaded but not used"). If the screen turns, the CSS swaps to the
// other one and it loads then.
export function Wallpaper({ wide }: { wide: boolean }) {
  preload(wide ? "/intro/planet-landscape.webp" : "/intro/planet-portrait.webp", { as: "image" });
  return <div className={styles.wallpaper} aria-hidden="true" />;
}
