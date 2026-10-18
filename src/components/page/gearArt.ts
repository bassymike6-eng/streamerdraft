// src/components/page/gearArt.ts
//
// MADE BY A SCRIPT (the 3D renders of the streaming gear), don't edit by hand.
// Each piece: its size, its pictures (public/gear, a few widths), the small
// light-on picture laid over it (where, in % of the piece) and where its
// light is (for the glow).

export type GearArt = {
  w: number; h: number;
  src: [string, number][];
  lit: { x: number; y: number; w: number; h: number; src: [string, number][] };
  led: { x: number; y: number };
  front?: [string, number][]; // (hang) just the front half, for in front of the button
  hang?: { x: number; y: number }; // (hang) where it rests on the button's top edge
};

export const GEAR_ART: Record<"mic" | "camera" | "deck" | "phones" | "hang", GearArt> = {
  mic: {
    w: 660, h: 1554,
    src: [["/gear/mic-240.webp", 240], ["/gear/mic-480.webp", 480], ["/gear/mic-660.webp", 660]],
    lit: { x: 6.97, y: 62.48, w: 81.21, h: 28.57, src: [["/gear/mic-lit-240.webp", 195], ["/gear/mic-lit-480.webp", 390], ["/gear/mic-lit-660.webp", 536]] },
    led: { x: 48.87, y: 76.76 },
  },
  camera: {
    w: 916, h: 883,
    src: [["/gear/camera-320.webp", 320], ["/gear/camera-640.webp", 640], ["/gear/camera-916.webp", 916]],
    lit: { x: 62.34, y: 19.25, w: 33.19, h: 33.3, src: [["/gear/camera-lit-320.webp", 106], ["/gear/camera-lit-640.webp", 212], ["/gear/camera-lit-916.webp", 304]] },
    led: { x: 78.87, y: 35.75 },
  },
  deck: {
    w: 790, h: 601,
    src: [["/gear/deck-320.webp", 320], ["/gear/deck-640.webp", 640], ["/gear/deck-790.webp", 790]],
    lit: { x: 23.8, y: 12.98, w: 32.78, h: 52.41, src: [["/gear/deck-lit-320.webp", 105], ["/gear/deck-lit-640.webp", 210], ["/gear/deck-lit-790.webp", 259]] },
    led: { x: 47.34, y: 39.11 },
  },
  phones: {
    w: 915, h: 1104,
    src: [["/gear/phones-320.webp", 320], ["/gear/phones-640.webp", 640], ["/gear/phones-915.webp", 915]],
    lit: { x: 77.7, y: 77.17, w: 20.11, h: 21.29, src: [["/gear/phones-lit-320.webp", 64], ["/gear/phones-lit-640.webp", 129], ["/gear/phones-lit-915.webp", 184]] },
    led: { x: 82.71, y: 90.4 },
  },
  hang: {
    w: 525, h: 857,
    src: [["/gear/hang-200.webp", 200], ["/gear/hang-400.webp", 400], ["/gear/hang-525.webp", 525]],
    lit: { x: 3.05, y: 72.23, w: 46.86, h: 25.44, src: [["/gear/hang-lit-200.webp", 94], ["/gear/hang-lit-400.webp", 187], ["/gear/hang-lit-525.webp", 246]] },
    led: { x: 22.69, y: 87.42 },
    front: [["/gear/hang-front-200.webp", 200], ["/gear/hang-front-400.webp", 400], ["/gear/hang-front-525.webp", 525]],
    hang: { x: 53.2, y: 9.86 },
  },
};
