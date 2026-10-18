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

// The same, but optional: an empty box counts as "not given"
const optionalLink = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  link.optional()
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
  // "I'm based in the UK": optional, false if not sent.
  // Anyone can join, but only UK-based people can win the prize
  // or count as someone's recruit.
  basedInUk: z.boolean({ error: "Answer yes or no." }).default(false),
  // The recruit code from the link they came through (if any).
  // We don't fail the sign-up over a bad code, we just ignore it later.
  ref: z.string().trim().max(20).optional(),
  // The one-time "I'm human" token from the Cloudflare Turnstile widget.
  // Checked with Cloudflare in the route (src/lib/turnstile.ts), not here.
  turnstileToken: z.string().max(2048).optional(),
};

// ── Prospect (streamer) ──────────────────────────────────────────
// Signing up is just email + name now (F2): we want as many people as possible
// to register their interest, so where they stream is asked later, at launch.
// The fields stay here (optional) for when we do.
const prospectSchema = z.object({
  role: z.literal("prospect"),
  ...shared, // "..." copies all the shared fields in here
  platform: z
    .enum(["twitch", "tiktok", "youtube", "kick", "other"], { error: "Pick the platform you stream on." })
    .optional(),
  channelUrl: optionalLink,
  streamCategory: optionalText,
});

// ── Scout (creator) ──────────────────────────────────────────────
// The scout application (F2). The form's two steps, in the same order:
//   About you          email, name, their links, audience size, what they make
//   How you'd scout    what they can help with, how many weeks they'll back
//                      each streamer, a line on why (optional), the commitment

// What they can help a streamer with. Tick 1 or more. ("other" = "Something
// else", which they then describe in scoutOfferOther.)
export const SCOUT_OFFERS = [
  "obs_setup", "multistreaming", "clipping", "raids", "collabs", "feedback", "socials", "intros", "other",
] as const;

// How long they'll back each streamer they draft (migration 008)
export const SCOUT_WEEKS = [4, 6, 8] as const;

const scoutSchema = z
  .object({
    role: z.literal("scout"),
    ...shared,
    // Their channels and socials: 1 to 5 links (Twitch, YouTube, TikTok, Instagram...)
    platformUrls: z
      .array(link, { error: "Add a link to your channel or socials." })
      .min(1, { error: "Add a link to your channel or socials." })
      .max(5, { error: "Add up to 5 links." }),
    audienceSize: z.enum(["under_10k", "10k_50k", "50k_100k", "100k_plus"], {
      error: "Pick your audience size.",
    }),
    contentTypes: z
      .array(z.enum(["streaming", "short_form", "videos", "podcasts", "other"]), {
        error: "Pick at least one type of content.",
      })
      .min(1, { error: "Pick at least one type of content." }),

    scoutOffers: z
      .array(z.enum(SCOUT_OFFERS), { error: "Pick at least one thing you can help with." })
      .min(1, { error: "Pick at least one thing you can help with." }),
    // "Something else": what, in their own words. Only needed when they tick it
    // (the check at the bottom). Empty = not given.
    scoutOfferOther: z
      .string()
      .trim()
      .max(120, { error: "Keep this under 120 characters." })
      .optional()
      .transform((value) => value || undefined),
    // 4, 6 or 8 weeks. (A number, not text: z.literal checks it's exactly one of them.)
    scoutWeeks: z.union(SCOUT_WEEKS.map((weeks) => z.literal(weeks)), {
      error: "Pick 4, 6 or 8 weeks.",
    }),
    // Roughly how many hours a month. Not asked any more (the weeks say more),
    // but still accepted, so nothing breaks if an old copy of the form sends it.
    scoutHours: z.enum(["under_3", "3_5", "6_10", "10_plus"]).optional(),
    // One line on why they want to scout. Optional; empty = not given.
    scoutPitch: z.string().trim().max(200, { error: "Keep this under 200 characters." }).optional(),
    // Must be exactly true: they agree to back each streamer they draft for
    // the weeks they picked, with 2 feedback calls and 1 shout-out to their
    // followers (sharing the streamer's stream or a clip).
    commitmentAccepted: z.literal(true, {
      error: "Tick the box to agree to the scout commitment.",
    }),
  })
  // Ticked "Something else"? Then say what. (A check across two fields, so it
  // goes here rather than on one of them; path says which box the error is for.)
  .check((ctx) => {
    const { scoutOffers, scoutOfferOther } = ctx.value;
    if (scoutOffers.includes("other") && !scoutOfferOther) {
      ctx.issues.push({
        code: "custom",
        input: scoutOfferOther,
        path: ["scoutOfferOther"],
        message: "Say what else you can help with.",
      });
    }
  });

// ── The full rule: it's EITHER a prospect OR a scout ─────────────
// Zod looks at "role" first, then checks the matching set of fields.
export const signupSchema = z.discriminatedUnion("role", [prospectSchema, scoutSchema], {
  error: "Choose prospect or scout.",
});

// A TypeScript "type" made from the rules above, so the rest of our
// code knows exactly what a checked sign-up looks like.
export type SignupInput = z.infer<typeof signupSchema>;
