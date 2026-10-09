// src/lib/validation.ts
//
// WHAT THIS IS
// The rules every sign-up must pass BEFORE we touch the database.
// We never trust what a browser sends us: anyone can send anything
// to our API, not just our own form. So we check every field here.
//
// HOW IT WORKS
// We use Zod, a library where you describe what valid data looks like,
// and it tells you exactly which fields are wrong (and why).

import { z } from "zod";

// ── Reusable field rules ─────────────────────────────────────────

// Email: trim spaces, make lowercase, then check it looks like an email.
const email = z
  .string({ error: "Add your email." })
  .trim()
  .toLowerCase()
  .max(254, { error: "That email is too long." })
  .pipe(z.email({ error: "Enter a valid email address." }));

// Name shown for this person. 2 to 30 characters.
const displayName = z
  .string({ error: "Add your name." })
  .trim()
  .min(2, { error: "Name must be at least 2 characters." })
  .max(30, { error: "Name must be 30 characters or fewer." });

// A web link. People type "twitch.tv/name" without https://,
// so we add it for them, then check it's a real-looking link.
const link = z
  .string({ error: "Add a link." })
  .trim()
  .min(1, { error: "Add a link." })
  .max(200, { error: "That link is too long." })
  .transform((value) => (/^https?:\/\//i.test(value) ? value : `https://${value}`))
  .pipe(
    z.url({
      protocol: /^https?$/, // only http/https links (blocks tricks like "javascript:")
      hostname: /\.[a-z]{2,}$/i, // must end like ".tv" or ".com"
      error: "That doesn't look like a link.",
    })
  );

// Optional short text, e.g. "GTA RP, Just Chatting". Empty = not given.
const optionalText = z.string().trim().max(80, { error: "Keep this under 80 characters." }).optional();

// ── Fields BOTH roles fill in ────────────────────────────────────
const shared = {
  email,
  displayName,
  // Must be exactly true: the 18+ box has to be ticked.
  ageConfirmed: z.literal(true, { error: "You need to be 18 or over to join." }),
  // "Email me updates": optional, false if not sent.
  marketingOptIn: z.boolean().default(false),
  // The recruit code from the link they came through (if any).
  // We don't fail the sign-up over a bad code, we just ignore it later.
  ref: z.string().trim().max(20).optional(),
};

// ── Prospect (streamer) ──────────────────────────────────────────
const prospectSchema = z.object({
  role: z.literal("prospect"),
  ...shared, // "..." copies all the shared fields in here
  platform: z.enum(["twitch", "tiktok", "youtube", "kick", "other"], {
    error: "Pick the platform you stream on.",
  }),
  channelUrl: link,
  streamCategory: optionalText,
});

// ── Scout (creator) ──────────────────────────────────────────────
const scoutSchema = z.object({
  role: z.literal("scout"),
  ...shared,
  platformUrls: z
    .array(link, { error: "Add at least one platform link." })
    .min(1, { error: "Add at least one platform link." })
    .max(3, { error: "Add up to 3 links." }),
  audienceSize: z.enum(["under_10k", "10k_50k", "50k_100k", "100k_plus"], {
    error: "Pick your audience size.",
  }),
  contentTypes: z
    .array(z.enum(["streaming", "short_form", "videos", "podcasts", "other"]), {
      error: "Pick at least one type of content.",
    })
    .min(1, { error: "Pick at least one type of content." }),
});

// ── The full rule: it's EITHER a prospect OR a scout ─────────────
// Zod looks at "role" first, then checks the matching set of fields.
export const signupSchema = z.discriminatedUnion("role", [prospectSchema, scoutSchema], {
  error: "Choose prospect or scout.",
});

// A TypeScript "type" made from the rules above, so the rest of our
// code knows exactly what a checked sign-up looks like.
export type SignupInput = z.infer<typeof signupSchema>;