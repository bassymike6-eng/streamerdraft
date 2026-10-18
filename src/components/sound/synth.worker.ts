// src/components/sound/synth.worker.ts
//
// WHAT THIS IS
// The background thread the v3 sounds are made on. Making a sound is a few
// milliseconds to a tenth of a second of maths; doing it here means the
// page's animation never stutters while it happens.
//
// engine.ts sends a job ("make me a `lock`, seed 123, at 48,000 samples a
// second") and gets the finished numbers back. Jobs are done in the order
// they arrive, so the engine asks for the intro's sounds in the order the
// intro needs them.

import { renderSound, renderSpace, type Options, type SoundName, type Space } from "./patches";

export type Ask =
  | { kind: "sound"; name: SoundName; seed: number; sr: number; o?: Options }
  | { kind: "space"; space: Space; seed: number; sr: number };
export type Job = Ask & { id: number };

const post = (message: unknown, transfer: Transferable[] = []) =>
  (self as unknown as { postMessage: (m: unknown, t: Transferable[]) => void }).postMessage(message, transfer);

self.onmessage = (event: MessageEvent<Job>) => {
  const job = event.data;
  try {
    const ch = job.kind === "sound" ? renderSound(job.name, job.seed, job.sr, job.o) : renderSpace(job.space, job.seed, job.sr);
    // handed over, not copied (the "transfer" list), so it's instant
    post({ id: job.id, ch }, ch.map((c) => c.buffer));
  } catch (error) {
    post({ id: job.id, ch: null, error: String(error) });
  }
};
