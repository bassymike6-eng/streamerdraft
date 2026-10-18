// src/lib/socials.ts
//
// THE LINKS IN THE FOOTER: the one place to change them.
//
// Put the full link in `href` (https://...). Any with an empty href are
// left out of the footer, so you can fill them in as the accounts go live.
// Order here = order in the footer. Add or remove lines freely.
//
// (Your name, address and contact email live in src/lib/site.ts.)

export type SocialLink = { label: string; href: string };

// StreamerDraft's own accounts: "follow us" for announcements and the comp
export const SOCIALS: SocialLink[] = [
  { label: "Discord", href: "https://discord.gg/xFqb7qryQ"},
  { label: "Instagram", href: "https://instagram.com/streamerdraft2026?exln=Ympzczd0a3htNWlm&utm_source=qr"},
  { label: "TikTok", href: "http://www.tiktok.com/@streamerdraft2026"},
  { label: "X", href: "https://x.com/streamerdraft26?s=11"},
];

// Where the streams happen (the winner's revealed live there). Shown as its
// own red "Watch live" capsule in the footer. Leave href empty to hide it.
export const STREAM: SocialLink = { label: "Watch live", href: "https://www.twitch.tv/bassy_mike123" };
