// src/lib/brand-font.ts
//
// THE BRAND FONT: THE ONE PLACE TO CHANGE IT
// The title (STREAMERDRAFT, and the logo it docks into), the SD on our app
// icon, and later the page's headings all use this font. Body text (forms,
// paragraphs) stays a plain, readable font: display fonts are hard to read small.
//
// TO TRY A FONT
//   npm run dev, open the Dev panel (top left) and pick it under "Font".
//   It goes in the URL too (?font=knewave), so you can open each font in
//   its own tab and flick between them. The panel says if a font's file is missing.
//
// TO USE ONE FOR REAL
//   Change BRAND_FONT below. That's it. (Only a free one: see LICENCES.)
//
// TO ADD A FONT
//   1. Put its file in public/fonts/, named after its id (e.g. public/fonts/knewave.woff2).
//      Your own downloads: name them <id>.otf. If one came as a .ttf, just
//      rename it .otf: the browser reads what's inside the file, not its name.
//   2. Add an @font-face for it in src/app/brand-fonts.css (copy one of the others).
//   3. Add it to FONTS below.
//
// LICENCES
//   free: true   Google Fonts under the SIL Open Font Licence (Permanent Marker:
//                Apache 2.0). Free for anything: the live site, the logo,
//                merch. Their licences are in public/fonts/licences/ and must stay there.
//   free: false  Bockley, Paperbreak, Neoradical: PERSONAL use only. Fine to
//                compare against on your own computer, but they can't go on
//                the live site or GitHub without a paid licence. BRAND_FONT
//                won't accept them (the build stops with an error if you try).

export const FONTS = {
  anton: { label: "Anton (the old one)", family: null, text: "STREAMERDRAFT", free: true },
  // Free brush fonts in the spirit of Neoradical, closest first
  knewave: { label: "Knewave", family: "SD Knewave", text: "StreamerDraft", free: true },
  protest: { label: "Protest Revolution", family: "SD Protest Revolution", text: "StreamerDraft", free: true },
  kaushan: { label: "Kaushan Script", family: "SD Kaushan Script", text: "StreamerDraft", free: true },
  sedgwick: { label: "Sedgwick Ave Display", family: "SD Sedgwick Ave Display", text: "StreamerDraft", free: true },
  marker: { label: "Permanent Marker", family: "SD Permanent Marker", text: "StreamerDraft", free: true },
  mansalva: { label: "Mansalva", family: "SD Mansalva", text: "StreamerDraft", free: true },
  // Personal use only (you download these yourself), for comparing
  neoradical: { label: "Neoradical (personal use)", family: "SD Neoradical", text: "StreamerDraft", free: false },
  bockley: { label: "Bockley (personal use)", family: "SD Bockley", text: "STREAMERDRAFT", free: false },
  paperbreak: { label: "Paperbreak (personal use)", family: "SD Paperbreak", text: "StreamerDraft", free: false },
} as const;
//   family  the name it has in brand-fonts.css (null = Anton, loaded by Next in LaunchIntro.tsx)
//   text    how the title is written in this font: all caps suits blocky fonts,
//           "StreamerDraft" suits script and brush ones (the Dev panel can flip it)
//   free    can it go on the live site (see LICENCES)

export type FontId = keyof typeof FONTS;

// Only the fonts with free: true
type FreeFontId = { [K in FontId]: (typeof FONTS)[K]["free"] extends true ? K : never }[FontId];

// THE FONT THE SITE USES. If you put a personal-use font here, TypeScript
// stops the build ("not assignable to type FreeFontId"): that's on purpose.
// The title is written as that font's `text` above (Mansalva: "StreamerDraft").
export const BRAND_FONT: FreeFontId = "mansalva";

export function isFontId(value: string | null): value is FontId {
  return value !== null && value in FONTS;
}

// How the title is written. casing: "caps" = STREAMERDRAFT, "mixed" = StreamerDraft,
// anything else = that font's own default (its text above).
export function titleText(id: FontId, casing: string | null): string {
  if (casing === "caps") return "STREAMERDRAFT";
  if (casing === "mixed") return "StreamerDraft";
  return FONTS[id].text;
}

// The CSS font-family list for a font: the font itself, then Anton while it
// loads (or if its file is missing), then Impact.
export function fontStack(id: FontId): string {
  const family = FONTS[id].family;
  return `${family ? `"${family}", ` : ""}var(--font-anton), Impact, sans-serif`;
}

// ---- Measuring the title ----
// Every font gives a word a different shape: Anton's STREAMERDRAFT is long
// and flat, a script font's is shorter and taller, with loops above and below.
// So instead of squashing every font into one fixed box, we measure the real
// shape of the word in the chosen font and size the title to fit it.

// The word's outline at 160px, measured from where the text starts (x) and
// its baseline (y). Wordmark.tsx uses it as the SVG's box; geometry.ts uses
// width / height to size the title and the docked logo.
export type WordBox = { x: number; y: number; width: number; height: number };

// What Anton's STREAMERDRAFT measures, used until the real measurement is in
export const DEFAULT_WORD_BOX: WordBox = { x: 0, y: 158, width: 1000, height: 200 };

export const TITLE_SIZE = 160; // px: the title is drawn this size, then scaled to fit the screen

// Built-in font names (not files to load)
const GENERIC = new Set(["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui"]);

// stack: the font-family list exactly as the browser has it (from getComputedStyle),
// because a canvas can't read CSS variables. Resolves once the font has loaded
// (or failed to). loaded = false means its file wasn't found.
export async function measureWord(stack: string, family: string | null, text: string): Promise<{ box: WordBox; loaded: boolean }> {
  // Load every font in the list (the brand font, Anton under it ...) ONE AT A
  // TIME and wait for them all. Loading the whole list in one go gives up as
  // soon as any one fails (e.g. Next's "Anton Fallback", which is built from
  // Arial, on a computer without Arial), before the others have finished, and
  // we'd measure the wrong font.
  const families = stack.split(",").map((f) => f.trim()).filter((f) => f && !GENERIC.has(f));
  await Promise.allSettled(families.map((f) => document.fonts.load(`${TITLE_SIZE}px ${f}`, text)));
  let loaded = true;
  if (family) {
    let face: FontFace | undefined;
    document.fonts.forEach((f) => {
      if (f.family.replace(/["']/g, "") === family) face = f;
    });
    loaded = face?.status === "loaded";
  }
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return { box: DEFAULT_WORD_BOX, loaded };
  ctx.font = `${TITLE_SIZE}px ${stack}`;
  const m = ctx.measureText(text);
  const pad = TITLE_SIZE * 0.04; // a little room so nothing touches the edge
  const left = m.actualBoundingBoxLeft + pad;
  const width = left + m.actualBoundingBoxRight + pad;
  const top = m.actualBoundingBoxAscent + pad;
  const height = top + m.actualBoundingBoxDescent + pad;
  if (!(width > 0 && height > 0)) return { box: DEFAULT_WORD_BOX, loaded };
  return { box: { x: left, y: top, width, height }, loaded };
}
