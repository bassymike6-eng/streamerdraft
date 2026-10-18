// src/components/page/founderNote.ts
//
// WHAT THIS IS
// Everything the founder voice note needs: the audio file, how long it is,
// how loud it is moment to moment (for the 4 moving bars) and the captions.
//
// THE REAL RECORDING (Bassy Mike, one take)
// public/voice/founder.mp3 and founderLevels.json (its length and loudness) are
// both made from the raw take by scripts/voice-note.py.
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
  { start: 0.17, end: 3.38, text: "Yo guys, it's Michael." },
  { start: 3.38, end: 4.65, text: "Obviously, you know I'm a streamer," },
  { start: 4.65, end: 6.91, text: "just like everyone else," },
  { start: 6.91, end: 8.52, text: "and straight up, I actually" },
  { start: 8.52, end: 10.71, text: "noticed something, right?" },
  { start: 10.71, end: 12.93, newParagraph: true, text: "For small streamers like us," },
  { start: 12.93, end: 16.32, text: "getting found is so crazy hard, right?" },
  { start: 16.32, end: 18.44, text: "You grind, you stream to nobody," },
  { start: 18.44, end: 19.55, text: "you even do mad stuff" },
  { start: 19.55, end: 21.12, text: "to try and get clips," },
  { start: 21.12, end: 22.27, text: "to get seen," },
  { start: 22.27, end: 24.47, text: "and the algorithm is still against you." },
  { start: 24.47, end: 25.56, newParagraph: true, text: "So what did I do?" },
  { start: 25.56, end: 27.50, text: "I built StreamerDraft." },
  { start: 27.50, end: 29.44, text: "It's... football scouting," },
  { start: 29.44, end: 30.89, text: "but for streamers." },
  { start: 30.89, end: 32.97, text: "So like, bigger creators scout you," },
  { start: 32.97, end: 34.14, text: "then they draft you" },
  { start: 34.14, end: 36.60, text: "and help you grow for a whole season." },
  { start: 36.60, end: 38.08, text: "Built by a streamer," },
  { start: 38.08, end: 39.51, text: "for streamers, alright?" },
  { start: 39.51, end: 41.92, text: "Join the draft and let's work together." },
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
