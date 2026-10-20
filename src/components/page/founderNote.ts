// src/components/page/founderNote.ts
//
// WHAT THIS IS
// Everything the founder voice note needs: the audio file, how long it is,
// how loud it is moment to moment (for the 4 moving bars) and the captions.
//
// THE REAL RECORDING (Bassy Mike, one take, on the streaming mic)
// public/voice/founder.mp3 and founderLevels.json (its length and loudness) are
// both made from the raw take by scripts/voice-note.py (it also cleans it up:
// the mic being picked up, pops, the boom from being close to the mic):
//   python scripts/voice-note.py <the raw take> --from 1.345 --to 50.12
// The captions below are what was actually said, each timed to the moment its
// first word starts (measured from the trimmed file, word by word), and kept
// short enough for one line. "Read it instead" joins them back into paragraphs.
// To change a caption's words, edit its text; to nudge its timing, edit start
// (each one stays up until the next starts).

import recording from "./founderLevels.json";

export type Caption = {
  start: number; // seconds into the recording
  end: number;
  text: string;
  newParagraph?: boolean; // "Read it instead" starts a new paragraph here
};

export type FounderNote = {
  src: string; // the audio file (in public/)
  duration: number; // seconds (the player also reads it from the file once it loads)
  levels: number[]; // loudness, LEVEL_RATE numbers per second: 0 = quiet, 1 = loudest
  captions: Caption[]; // shown one at a time as it plays
};

export const LEVEL_RATE = recording.rate; // loudness readings per second (30)

// What was said, and when
const CAPTIONS: Caption[] = [
  { start: 0.12, end: 1.17, text: "Yo, my people," },
  { start: 1.17, end: 3.03, text: "it's your boy Michael here." },
  { start: 3.03, end: 3.71, text: "Come on!" },
  { start: 3.71, end: 6.14, text: "And obviously, you know," },
  { start: 6.14, end: 8.21, text: "I'm a small streamer, you know," },
  { start: 8.21, end: 9.77, text: "I'm getting into it, stuff like that." },
  { start: 9.77, end: 13.13, newParagraph: true, text: "But I noticed something very important." },
  { start: 13.13, end: 14.29, text: "For small streamers," },
  { start: 14.29, end: 16.78, text: "getting found is so hard, right?" },
  { start: 16.78, end: 18.15, text: "You grind, you try get clips" },
  { start: 18.15, end: 20.51, text: "for yourself, go viral." },
  { start: 20.51, end: 21.49, text: "Nobody notices it." },
  { start: 21.49, end: 22.82, text: "Like, if you're very lucky," },
  { start: 22.82, end: 23.49, text: "you know what I mean?" },
  { start: 23.49, end: 24.62, text: "You get a little one, two thousand" },
  { start: 24.62, end: 25.93, text: "views here, there." },
  { start: 25.93, end: 27.74, text: "But the algorithm is still against you." },
  { start: 27.74, end: 28.85, newParagraph: true, text: "So what did I do?" },
  { start: 28.85, end: 30.07, text: "I built StreamerDraft." },
  { start: 30.07, end: 32.24, text: "It's like football scouting," },
  { start: 32.24, end: 34.00, text: "but for streamers, you know?" },
  { start: 34.00, end: 36.31, text: "So, like, bigger creators scout you," },
  { start: 36.31, end: 38.86, text: "then they draft you to work with you" },
  { start: 38.86, end: 41.06, text: "and help you grow for a whole season." },
  { start: 41.06, end: 42.13, newParagraph: true, text: "So it's built by a streamer," },
  { start: 42.13, end: 42.79, text: "for streamers." },
  { start: 42.79, end: 43.25, text: "So, you know," },
  { start: 43.25, end: 45.24, text: "I got you people on my back." },
  { start: 45.24, end: 46.16, text: "So join the draft" },
  { start: 46.16, end: 47.34, text: "and let's work together." },
  { start: 47.34, end: 49.05, text: "Come on, baw!" },
];

export const FOUNDER_NOTE: FounderNote = {
  src: "/voice/founder.mp3",
  duration: recording.duration,
  captions: CAPTIONS,
  levels: recording.levels,
};

// The captions as the player shows them: ONE short line at a time.
// Long lines are split into even, short pieces (breaking after a comma or a
// full stop where it can), and each piece gets a share of its line's time by
// how many letters it has. So the real captions can be written as whole
// sentences and still never wrap onto a second line.
export function captionLines(captions: Caption[], maxChars = 40): Caption[] {
  const out: Caption[] = [];
  for (const caption of captions) {
    // fits on one line already: keep it whole (don't split "right?" off on its own)
    if (caption.text.length <= maxChars) {
      out.push({ start: caption.start, end: caption.end, text: caption.text });
      continue;
    }
    const words = caption.text.split(/\s+/).filter(Boolean);
    // How long each piece should be, worked out again at the start of every piece
    // from what's left, so the last piece is never a lonely word
    const aimFor = (from: number) => {
      const left = words.slice(from).join(" ").length;
      return Math.min(maxChars, (left / Math.ceil(left / maxChars)) * 1.15);
    };
    const lines: string[] = [];
    let line = "";
    let aim = aimFor(0);
    words.forEach((word, i) => {
      const longer = line ? `${line} ${word}` : word;
      const fullEnough = /[,.!?]$/.test(line) && line.length >= aim * 0.55;
      if (line && (longer.length > aim || fullEnough)) {
        lines.push(line);
        line = word;
        aim = aimFor(i);
      } else {
        line = longer;
      }
    });
    if (line) lines.push(line);

    const letters = lines.reduce((n, l) => n + l.length, 0);
    let start = caption.start;
    for (const text of lines) {
      const end = start + (caption.end - caption.start) * (text.length / letters);
      out.push({ start, end, text }); // (just the line: paragraphs are only for reading)
      start = end;
    }
  }
  return out;
}

// How loud the note is `seconds` in (0-1), between readings
export function levelAt(levels: number[], seconds: number) {
  const x = seconds * LEVEL_RATE;
  const i = Math.floor(x);
  if (i < 0 || i >= levels.length - 1) return 0;
  return levels[i] + (levels[i + 1] - levels[i]) * (x - i);
}

// The script as paragraphs, for "Read it instead"
export function transcript(captions: Caption[]): string[] {
  const paragraphs: string[] = [];
  for (const c of captions) {
    if (c.newParagraph || paragraphs.length === 0) paragraphs.push(c.text);
    else paragraphs[paragraphs.length - 1] += ` ${c.text}`;
  }
  return paragraphs;
}
