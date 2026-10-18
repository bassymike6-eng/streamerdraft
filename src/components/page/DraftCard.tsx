// src/components/page/DraftCard.tsx
//
// WHAT THIS IS
// Your draft card: a picture made for an Instagram / TikTok / Snapchat story
// (1080 x 1920, the story size), with your number, your name and your link,
// like a draft pick's card. Made right here in the browser (nothing's
// uploaded), shown once you're confirmed (the "You're in" pop-up, and the
// confirm page).
//
//   ┌────────────────────────────┐   the red light round the edge: a still
//   │ StreamerDraft (Early access)│   frame of the page's own running light
//   │ Prospect                   │   (Scout, for scouts)
//   │ #047                       │   their number, huge
//   │ John Doe                   │   their name, in the brand font
//   │ Nobody's watching.         │
//   │ Yet.                       │
//   │ Join the draft through my link
//   │ ( streamerdraft.../r/k7x2 )│   their link, so it works even as a screenshot
//   └────────────────────────────┘
// Instagram covers the top and bottom of a story with its own buttons, so
// everything that matters sits in the middle (about 250 px clear at each end).
//
// SHARING IT, THE WAY SPOTIFY WRAPPED DOES
// Wrapped shows you the card big, lets you pick the version you like, then
// one tap puts it in your story. We do the same, in a pop-up:
//   1. The card, big. Three looks to pick from (swipe it, or tap Night / Red / Day)
//   2. "Share to your story": the phone's own share menu opens with the
//      picture, so Instagram, TikTok, Snapchat, WhatsApp, Messages and Save
//      Image are all there with their real icons. In Instagram, pick Story.
//      Your link is copied as it opens: add Instagram's Link sticker and paste.
//   3. Copy link, and Save image (on computers, Save image is the main button:
//      save it, then post it from your phone)
// Why not a straight "Instagram Story" button like Spotify's app has? That
// needs Instagram's "Sharing to Stories" kit, which only works inside an app
// installed on the phone, not on a website. The share menu is the web's way
// in, and it's the same one Safari and Chrome use for everything.
// (The share menu only works on HTTPS pages: on your laptop's address over
// Wi-Fi, http://192.168..., phones hide it. See clipboard.ts.)
//
// Nothing about anyone else is on it: no rank, no other numbers.

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { drawLight, makeShape, parseColor, perimeter, type Rgb } from "@/components/launch/light";
import { BRAND_FONT, FONTS } from "@/lib/brand-font";
import { canShareFile, copyText, copyTextNow } from "./clipboard";
import { referralLink } from "./entry";
import { Segmented } from "./FormParts";
import { Sheet, sheetOrder, slot } from "./Sheet";
import { uiSound, unlockUiSound } from "./uiSound";
import e from "./Entry.module.css";

const W = 1080;
const H = 1920;

export type CardInfo = {
  role: "prospect" | "scout";
  number: number | null;
  name: string;
  link: string; // shown without https://
};

// ---- The three looks ----
// night  black, red number, the red light (the site at night)
// red    all red, black number, a white light (loud: made to stand out in a story)
// day    white, red number, the red light (the site in the day)
export type CardLook = "night" | "red" | "day";
const LOOKS: { value: CardLook; label: string }[] = [
  { value: "night", label: "Night" },
  { value: "red", label: "Red" },
  { value: "day", label: "Day" },
];

type Palette = {
  bg: string;
  glow: string; // "r, g, b" of the soft glow behind the number
  glowStrength: number;
  light: Rgb;
  lightHot: Rgb;
  ring: number;
  wordmark: string;
  pill: string;
  pillDot: string;
  pillText: string;
  label: string;
  hash: string;
  number: string;
  name: string;
  line1: string;
  yet: string;
  linkLabel: string;
  capsule: string;
  capsuleEdge: string;
  linkText: string;
};

const RED = "#E50914";
const PALETTES: Record<CardLook, Palette> = {
  night: {
    bg: "#000000", glow: "229, 9, 20", glowStrength: 0.3, light: parseColor(RED), lightHot: parseColor("#FF2D37"), ring: 0.24,
    wordmark: RED, pill: "#1C1C1F", pillDot: RED, pillText: "#FFFFFF",
    label: "rgba(255, 255, 255, 0.66)", hash: "rgba(229, 9, 20, 0.7)", number: RED, name: "#FFFFFF",
    line1: "rgba(255, 255, 255, 0.6)", yet: RED,
    linkLabel: "rgba(255, 255, 255, 0.66)", capsule: "#1C1C1F", capsuleEdge: "rgba(255, 255, 255, 0.12)", linkText: "#FFFFFF",
  },
  red: {
    bg: RED, glow: "255, 80, 60", glowStrength: 0.55, light: parseColor("#FFFFFF"), lightHot: parseColor("#FFFFFF"), ring: 0.3,
    wordmark: "#FFFFFF", pill: "#0B0B0F", pillDot: RED, pillText: "#FFFFFF",
    label: "rgba(255, 255, 255, 0.82)", hash: "rgba(11, 11, 15, 0.55)", number: "#0B0B0F", name: "#FFFFFF",
    line1: "rgba(255, 255, 255, 0.85)", yet: "#0B0B0F",
    linkLabel: "rgba(255, 255, 255, 0.85)", capsule: "rgba(11, 11, 15, 0.3)", capsuleEdge: "rgba(255, 255, 255, 0.25)", linkText: "#FFFFFF",
  },
  day: {
    bg: "#FFFFFF", glow: "229, 9, 20", glowStrength: 0.12, light: parseColor(RED), lightHot: parseColor("#FF2D37"), ring: 0.18,
    wordmark: RED, pill: "#F1F1F5", pillDot: RED, pillText: "#0B0B0F",
    label: "rgba(0, 0, 0, 0.6)", hash: "rgba(229, 9, 20, 0.7)", number: RED, name: "#0B0B0F",
    line1: "rgba(0, 0, 0, 0.55)", yet: RED,
    linkLabel: "rgba(0, 0, 0, 0.6)", capsule: "#F1F1F5", capsuleEdge: "rgba(0, 0, 0, 0.06)", linkText: "#0B0B0F",
  },
};

// "#047" (3 digits at least, like a jersey or a draft pick)
const pick = (number: number | null) => (number ? `#${String(number).padStart(3, "0")}` : "#");

// The biggest font size (up to `max`) at which `text` fits in `width`
function fit(ctx: CanvasRenderingContext2D, text: string, font: (size: number) => string, max: number, width: number) {
  let size = max;
  ctx.font = font(size);
  const measured = ctx.measureText(text).width;
  if (measured > width) size = Math.floor(max * (width / measured));
  ctx.font = font(size);
  return size;
}

// Draws the card onto a 1080 x 1920 canvas. `body` is the page's text font
// (as the browser names it), `display` the brand font.
export function drawDraftCard(canvas: HTMLCanvasElement, card: CardInfo, fonts: { body: string; display: string }, look: CardLook = "night") {
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const c = PALETTES[look];
  const body = (weight: number, size: number) => `${weight} ${size}px ${fonts.body}`;
  const display = (size: number) => `${size}px ${fonts.display}`;
  const left = 96;
  const inner = W - left * 2;

  // ---- The stage, with a soft glow behind the number ----
  ctx.fillStyle = c.bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(330, 640, 40, 330, 640, 760);
  glow.addColorStop(0, `rgba(${c.glow}, ${c.glowStrength})`);
  glow.addColorStop(0.45, `rgba(${c.glow}, ${c.glowStrength * 0.27})`);
  glow.addColorStop(1, `rgba(${c.glow}, 0)`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // ---- The edge: a faint outline with the light running round it ----
  // Drawn on its own see-through canvas first, then laid on top: the light's
  // pieces are ADDED together (light.ts explains why), which only works on an
  // empty canvas. Straight onto the white Day card, red + white = white.
  const lightLayer = document.createElement("canvas");
  lightLayer.width = W;
  lightLayer.height = H;
  const lightCtx = lightLayer.getContext("2d");
  if (lightCtx) {
    const edge = makeShape(W / 2, H / 2, W - 72, H - 72, 84);
    drawLight(lightCtx, edge, { head: 0.17, length: perimeter(edge) * 0.36, width: 8, color: c.light, hot: c.lightHot, ring: c.ring, fade: 1.8 });
    ctx.drawImage(lightLayer, 0, 0);
  }

  // ---- Top: the wordmark and "Early access" ----
  ctx.textBaseline = "alphabetic";
  ctx.font = body(600, 34);
  const tag = "Early access";
  const tagW = ctx.measureText(tag).width + 56 + 26;
  const tagX = W - left - tagW;
  ctx.fillStyle = c.wordmark;
  fit(ctx, "StreamerDraft", display, 92, inner - tagW - 36);
  ctx.fillText("StreamerDraft", left, 236);
  ctx.font = body(600, 34);
  ctx.fillStyle = c.pill;
  ctx.beginPath();
  ctx.roundRect(tagX, 176, tagW, 70, 35);
  ctx.fill();
  ctx.fillStyle = c.pillDot;
  ctx.beginPath();
  ctx.arc(tagX + 40, 211, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = c.pillText;
  ctx.fillText(tag, tagX + 62, 223);

  // ---- The pick: Prospect / Scout, the number, the name ----
  ctx.fillStyle = c.label;
  ctx.font = body(600, 50);
  ctx.fillText(card.role === "scout" ? "Scout" : "Prospect", left + 8, 420);
  // the number, jersey style: a smaller # and big digits
  const digits = pick(card.number).slice(1);
  const hashShare = 0.56;
  ctx.font = body(800, 100);
  const perSize = (ctx.measureText(digits).width + ctx.measureText("#").width * hashShare + 12) / 100;
  const numberSize = Math.min(400, Math.floor(inner / perSize));
  const base = 420 + numberSize * 0.86;
  ctx.fillStyle = c.hash;
  ctx.font = body(800, numberSize * hashShare);
  ctx.fillText("#", left, base - numberSize * 0.3);
  const hashW = ctx.measureText("#").width + numberSize * 0.03;
  ctx.fillStyle = c.number;
  ctx.font = body(800, numberSize);
  ctx.fillText(digits, left + hashW, base);
  ctx.fillStyle = c.name;
  fit(ctx, card.name, display, 168, inner);
  ctx.fillText(card.name, left, 1030);

  // ---- The line from the site ----
  ctx.fillStyle = c.line1;
  ctx.font = display(88);
  ctx.fillText("Nobody’s watching.", left, 1230);
  ctx.fillStyle = c.yet;
  ctx.font = display(230);
  ctx.fillText("Yet.", left - 6, 1430);

  // ---- Their link ----
  ctx.fillStyle = c.linkLabel;
  ctx.font = body(500, 40);
  ctx.fillText(card.role === "scout" ? "Get scouted: join through my link" : "Join the draft through my link", left + 4, 1552);
  const linkSize = fit(ctx, card.link, (size) => body(600, size), 44, inner - 80);
  const capsuleH = 96;
  ctx.fillStyle = c.capsule;
  ctx.beginPath();
  ctx.roundRect(left, 1590, inner, capsuleH, capsuleH / 2);
  ctx.fill();
  ctx.strokeStyle = c.capsuleEdge;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = c.linkText;
  ctx.font = body(600, linkSize);
  ctx.fillText(card.link, left + 44, 1590 + capsuleH / 2 + linkSize * 0.36);
}

// The page's text font, as the browser names it (Next gives it a made-up name)
function bodyFont(from: HTMLElement | null) {
  const family = from ? getComputedStyle(from).fontFamily : "";
  return family || "system-ui, sans-serif";
}

const DISPLAY = `"${FONTS[BRAND_FONT].family ?? "Anton"}", Impact, sans-serif`;

type Made = { url: string; file: File };

// Makes each look's picture the first time it's wanted, and keeps it.
// (Kept under the card's details AND the look, so a changed card, e.g. their
// name arriving, simply gets new pictures.)
function useCardPictures(card: CardInfo, fontFrom: React.RefObject<HTMLElement | null>) {
  const [pictures, setPictures] = useState<Record<string, Made>>({});
  const making = useRef(new Set<string>());
  const urls = useRef<string[]>([]);
  const key = `${card.role}|${card.number}|${card.name}|${card.link}`;

  useEffect(() => {
    const made = urls.current;
    return () => made.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const want = useCallback(
    (look: CardLook) => {
      const id = `${key}|${look}`;
      if (making.current.has(id)) return;
      making.current.add(id);
      void (async () => {
        try {
          await Promise.all([document.fonts.load(`80px ${DISPLAY}`), document.fonts.load(`800 80px ${bodyFont(fontFrom.current)}`)]);
        } catch {
          // a font didn't load: draw with what there is
        }
        const canvas = document.createElement("canvas");
        drawDraftCard(canvas, card, { body: bodyFont(fontFrom.current), display: DISPLAY }, look);
        const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/png"));
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        urls.current.push(url);
        const file = new File([blob], `streamerdraft-${card.number ?? "card"}-${look}.png`, { type: "image/png" });
        setPictures((was) => ({ ...was, [id]: { url, file } }));
      })();
    },
    // (key covers everything in `card`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  const pictureFor = (look: CardLook): Made | undefined => pictures[`${key}|${look}`];
  return { pictureFor, want };
}

export function DraftCard({ role, number, name, code, n = 0 }: {
  role: "prospect" | "scout";
  number: number | null;
  name: string | null;
  code: string;
  n?: number; // its turn to fill in (sheetOrder), inside a pop-up
}) {
  const here = useRef<HTMLElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [look, setLook] = useState<CardLook>("night");
  const [said, setSaid] = useState<{ text: string; bad?: boolean } | null>(null);
  const shown = typeof window === "undefined" ? `/r/${code}` : referralLink(code).shown;
  const card: CardInfo = { role, number, name: name || "You", link: shown };
  const { pictureFor, want } = useCardPictures(card, here);

  // the small preview here: the look they picked (Night to start)
  useEffect(() => want(look), [want, look]);
  // opening the pop-up: get the other looks ready too
  useEffect(() => {
    if (open) LOOKS.forEach((l) => want(l.value));
  }, [open, want]);

  const picture = pictureFor(look);
  const canShare = picture ? canShareFile(picture.file) : false;
  const link = typeof window === "undefined" ? "" : referralLink(code).href;

  // No waiting on anything in here before the share menu opens: iPhones only
  // open it straight from the tap (see copyTextNow in clipboard.ts). That's
  // also why the picture is made ahead of time, not when they tap.
  const share = (from: HTMLElement) => {
    if (!picture) return;
    unlockUiSound();
    // the link goes on the clipboard first, for Instagram's Link sticker
    const copied = copyTextNow(link, from);
    // Just the picture: adding text or a link makes some apps (Instagram on
    // iPhone among them) take the words instead of the picture, or not show
    // up at all. The link's on the card and on the clipboard instead.
    navigator.share({ files: [picture.file] }).then(
      () => {
        setSaid({ text: copied ? "Your link's copied: in Instagram, add the Link sticker and paste it." : "Shared." });
        uiSound("share", from);
      },
      () => {
        // they closed the share menu: nothing to say
      },
    );
  };

  const save = () => {
    if (!picture) return;
    const a = document.createElement("a");
    a.href = picture.url;
    a.download = picture.file.name;
    a.click();
    setSaid({ text: "Saved. Post it from your phone: your link's on the card." });
    uiSound("copy");
  };

  const copyLink = async (from: HTMLElement) => {
    unlockUiSound();
    if (await copyText(link, from)) {
      setSaid({ text: "Link copied." });
      uiSound("copy", from);
    } else {
      setSaid({ text: "Couldn't copy: press and hold the link on the card to copy it.", bad: true });
    }
  };

  // Swipe the big card left or right to change the look
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const onDown = (ev: ReactPointerEvent) => {
    swipe.current = { x: ev.clientX, y: ev.clientY };
  };
  const onUp = (ev: ReactPointerEvent) => {
    const start = swipe.current;
    swipe.current = null;
    if (!start) return;
    const dx = ev.clientX - start.x;
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(ev.clientY - start.y)) return;
    const at = LOOKS.findIndex((l) => l.value === look);
    const next = LOOKS[(at + (dx < 0 ? 1 : LOOKS.length - 1)) % LOOKS.length].value;
    setLook(next);
    uiSound("tick-on");
  };

  const alt = `Your draft card: ${role === "scout" ? "Scout" : "Prospect"} ${pick(number)}, ${name ?? ""}, with your link`;

  return (
    <>
      <section ref={here} className={`${slot.box} ${e.cardShare}`} style={sheetOrder(n)} aria-label="Your draft card">
        <div className={e.cardThumb}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {picture ? <img src={picture.url} alt={alt} /> : <span className={e.cardMaking} aria-hidden="true" />}
        </div>
        <div className={e.cardWords}>
          <h3 className={e.cardTitle}>Your draft card</h3>
          <p className={e.cardText}>Post it to your story. Your link&apos;s on it, so friends can join through you.</p>
          <div className={e.cardButtons}>
            <button ref={opener} type="button" className={e.primary} onClick={() => setOpen(true)} aria-haspopup="dialog">
              <span>Share your card</span>
            </button>
          </div>
        </div>
      </section>

      <Sheet open={open} onClose={() => setOpen(false)} origin={opener} title="Your draft card" subtitle="Pick a look, then post it to your story.">
        <div className={`${e.view} ${e.cardSheet}`}>
          <div
            className={`${slot.box} ${e.cardBig}`}
            style={sheetOrder(2)}
            onPointerDown={onDown}
            onPointerUp={onUp}
            onPointerCancel={() => (swipe.current = null)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {picture ? <img key={look} src={picture.url} alt={alt} draggable={false} /> : <span className={e.cardMaking} aria-hidden="true" />}
          </div>

          <Segmented
            id="card-look"
            n={3}
            label="Look"
            choices={LOOKS}
            value={look}
            onChange={(next) => {
              setLook(next);
              setSaid(null);
            }}
            error={null}
          />

          {canShare ? (
            <button type="button" className={`${slot.box} ${e.primary} ${e.submit}`} style={sheetOrder(4)} onClick={(ev) => share(ev.currentTarget)} disabled={!picture}>
              <span>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3.5M7.5 8 12 3.5 16.5 8" /><path d="M8 11H6.5A2.5 2.5 0 0 0 4 13.5v5A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5v-5a2.5 2.5 0 0 0-2.5-2.5H16" /></svg>
                Share to your story
              </span>
            </button>
          ) : (
            <button type="button" className={`${slot.box} ${e.primary} ${e.submit}`} style={sheetOrder(4)} onClick={save} disabled={!picture}>
              <span>Save image</span>
            </button>
          )}
          <div className={`${slot.box} ${e.row}`} style={sheetOrder(5)}>
            <button type="button" className={`${e.secondary} ${e.grow}`} onClick={(ev) => copyLink(ev.currentTarget)}>
              <span>Copy link</span>
            </button>
            {canShare && (
              <button type="button" className={`${e.secondary} ${e.grow}`} onClick={save} disabled={!picture}>
                <span>Save image</span>
              </button>
            )}
          </div>

          {/* How it works, until they do something: then what just happened, in
              the same spot (so nothing moves and it all still fits on screen) */}
          <p
            className={`${slot.text} ${said ? e.cardSaid : e.small}`}
            style={sheetOrder(6)}
            role="status"
            data-tone={said?.bad ? "bad" : undefined}
          >
            {said
              ? said.text
              : canShare
                ? "Tap Instagram, then Story. Your link's copied as it opens, ready for the Link sticker."
                : "Save it, then post it from your phone. Your link's on the card."}
          </p>
        </div>
      </Sheet>
    </>
  );
}
