// src/components/admin/labels.ts
//
// WHAT THIS IS
// Turns what the database stores into words for the admin dashboard:
// "under_10k" → "Under 10k", "GB" → "United Kingdom", a timestamp → "15 Oct, 08:40".
// The option labels match the forms people filled in (ScoutForm.tsx,
// JoinSheet.tsx), so you see exactly what they picked. If a form's options
// change, change them here too.

import type { Person, Role } from "./data";

export const PLATFORMS: Record<string, string> = {
  twitch: "Twitch", tiktok: "TikTok", youtube: "YouTube", kick: "Kick", other: "Other",
};
export const AUDIENCE: Record<string, string> = {
  under_10k: "Under 10k", "10k_50k": "10k–50k", "50k_100k": "50k–100k", "100k_plus": "100k+",
};
export const CONTENT: Record<string, string> = {
  streaming: "Streams", short_form: "Short videos", videos: "Videos", podcasts: "Podcasts", other: "Something else",
};
export const OFFERS: Record<string, string> = {
  obs_setup: "Stream setup", multistreaming: "Multistreaming", clipping: "Clips & editing", raids: "Raids & shout-outs",
  collabs: "Collabs", feedback: "Feedback on streams", socials: "Growing on socials", intros: "Intros to creators",
  other: "Something else",
};
// older scout applications (the form asks for weeks now, migration 008)
export const HOURS: Record<string, string> = {
  under_3: "Under 3 hours a month", "3_5": "3–5 hours a month", "6_10": "6–10 hours a month", "10_plus": "10+ hours a month",
};
export const weeks = (value: string | number) => `${value} weeks`;

export const label = (map: Record<string, string>, value: string | null | undefined) =>
  value ? map[value] ?? value : "";

export const roleName = (role: Role) => (role === "scout" ? "Scout" : "Streamer");

// "Streamer #12" (their number in the draft, given when they confirm)
export const roleAndNumber = (person: Pick<Person, "role" | "number">) =>
  person.number ? `${roleName(person.role)} #${person.number}` : roleName(person.role);

// "GB" → "United Kingdom". T1 = Tor, XX = Cloudflare couldn't tell.
let regions: Intl.DisplayNames | null = null;
export function countryName(code: string | null | undefined): string {
  if (!code || code === "XX" || code === "Unknown") return "Unknown";
  if (code === "T1") return "Tor (hidden)";
  try {
    regions ??= new Intl.DisplayNames(["en-GB"], { type: "region" });
    return regions.of(code) ?? code;
  } catch {
    return code;
  }
}

// Everything in UK time, whatever the computer's set to
const DATE_TIME = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const DATE = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short" });
const LONG_DATE = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short" });

export const dateTime = (iso: string | null | undefined) => (iso ? DATE_TIME.format(new Date(iso)) : "");
export const date = (iso: string | null | undefined) => (iso ? DATE.format(new Date(iso)) : "");
export const longDate = (iso: string | null | undefined) => (iso ? LONG_DATE.format(new Date(iso)) : "");
// a "2026-10-15" day from the charts (noon, so no time zone can move it to another day)
export const day = (ymd: string) => DATE.format(new Date(`${ymd}T12:00:00Z`));
export const longDay = (ymd: string) => LONG_DATE.format(new Date(`${ymd}T12:00:00Z`));

// 6 → "6am", 18 → "6pm"
export const hourName = (hour: number) => `${hour % 12 === 0 ? 12 : hour % 12}${hour < 12 ? "am" : "pm"}`;

export const plural = (count: number, one: string, many = `${one}s`) => `${count.toLocaleString("en-GB")} ${count === 1 ? one : many}`;

// ── Red flags ───────────────────────────────────────────────────────
// A flag means "have a look", not "definitely cheating" (rules: migration 005)
export type FlagKey = "flagSameIpAsRecruiter" | "flagSharedIp" | "flagUkMismatch" | "flagTor" | "flagRecruitBurst";
export const FLAGS: { key: FlagKey; name: string; meaning: string }[] = [
  { key: "flagSameIpAsRecruiter", name: "Same IP as their recruiter", meaning: "Signed up from the same place as the person whose link they used. Often someone signing themselves up." },
  { key: "flagRecruitBurst", name: "Recruit burst", meaning: "Got 5 or more recruits within 10 minutes." },
  { key: "flagSharedIp", name: "Shared IP", meaning: "3 or more sign-ups came from one IP. Could be a college or a family, or one person with lots of emails." },
  { key: "flagUkMismatch", name: "Ticked UK, IP elsewhere", meaning: "Said they're based in the UK, but no IP of theirs was in the UK." },
  { key: "flagTor", name: "Tor", meaning: "Signed up through Tor, which hides where someone is." },
];
export const flagsOf = (person: Person) => FLAGS.filter((flag) => person[flag.key]);

// Where they are, in a few words
export function ukStatus(person: Pick<Person, "ukEligible" | "basedInUk" | "ipCountry" | "confirmIpCountry">): string {
  if (person.ukEligible) return "In the UK";
  if (person.basedInUk) return `Ticked UK, IP in ${countryName(person.confirmIpCountry ?? person.ipCountry)}`;
  return "Not in the UK";
}
