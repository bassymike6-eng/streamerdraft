# StreamerDraft

Small streamers keep streaming as usual. Bigger creators (scouts) find them,
draft them and help them grow for a whole season.

This repo is the **coming-soon site**: people join as a **streamer** or a
**scout**, confirm their email, and get a referral link for the **GTA 6
referral competition** (the Road to 300). Built with Next.js (App Router),
React, TypeScript and PostgreSQL, hosted on an IONOS VPS behind Cloudflare.

The launch and marketing plan is in **[docs/LAUNCH-PLAN.md](docs/LAUNCH-PLAN.md)**.

---

## Where it's at (18 October 2026)

**Built and tested:**

| Part | What it does |
| --- | --- |
| Home page | Hero, founder voice note, Road to 300 counter, join as a streamer or a scout. 3D-rendered streaming gear round it (mic, camera, controller, headphones: `public/gear`); on computers the headphones hang on the red Join button and react to it |
| Sign-up | Streamer: email + name. Scout: links, audience, what they make, how they'd help, 4/6/8 weeks. Throwaway emails and bots blocked (Cloudflare Turnstile) |
| Confirm page | Email link → read and accept the rules → confirmed, with their #number and referral link |
| Referrals | `/r/<code>` links. A referral counts once the person confirms and is in the UK |
| Competition | Streamers **and scouts** count towards the 300 and can win. No public leaderboard |
| Scouts | No applications: signing up makes you a scout. Admin can tick "Looks good" or turn one down (they're emailed, stay in the competition, can't sign up as a scout again with that email) |
| Admin (`/admin`) | Overview and charts, People, Scouts, Leaderboard (with cheat flags), Flags, CSV export, disqualify, write and send emails to the list |
| Emails | Confirmation, scout turn-down, launch/news emails (via Resend). Unsubscribe links on everything |
| Sound | The intro is scored scene by scene: each scene its own sound, cut when the next one starts, the title as the peak (`scripts/render-intro.py`, files in `public/sounds/v5`). The page's own sounds: `scripts/render-sounds.py`. Hear the old intro with `?sounds=v2` |
| Rules (`/rules`) and Privacy (`/privacy`) | Written for UK prize promotions (CAP Code). Rules last updated 18 October 2026 |

**Last end-to-end test (18 Oct):** 31 checks, all passing. A scout who joins
and confirms adds 1 to the Road to 300, counts as their referrer's referral,
gets their own link, earns counted referrals, and shows on the admin
leaderboard. When turned down, they still count, are still ranked, see the
note on their page, and can't sign up as a scout again.

---

## Before going live (the L1 deploy list)

1. **Fill in `src/lib/site.ts`**: your name, address and contact email. The
   rules show them (the CAP Code needs them).
2. **Privacy page**: swap the 3 "apply" sentences in
   `src/components/page/Privacy.tsx` if you haven't yet:
   - "If you apply to scout, also:" → "If you sign up as a scout, also:"
   - "To review scout applications … That's what you asked for when you
     applied" → "To check scout sign-ups … That's what you signed up for"
   - "Scout applications are only seen by us." → "Scout sign-ups are only
     seen by us."
3. **Domain**: buy streamerdraft.com.
4. **Cloudflare** (free): add the domain and turn the orange cloud (proxy) on.
   The site reads each visitor's country from Cloudflare, so the UK check
   only works through it.
5. **The VPS**: Node 22, PostgreSQL, the app built with `npm run build` and
   kept running (systemd or PM2), nginx in front, HTTPS. Then lock the
   server so web traffic is only accepted from Cloudflare.
6. **New secrets for the live `.env`** (never the ones from your laptop):
   `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`, `IP_HASH_SECRET`. Plus
   `DATABASE_URL`, `APP_URL=https://streamerdraft.com`, `RESEND_API_KEY`,
   `EMAIL_FROM`, `TURNSTILE_SECRET_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`.
   ⚠ `IP_HASH_SECRET` must never change once live (unsubscribe links use it).
7. **Database**: `npm run db:migrate` on the server (runs 001 to 011).
8. **Resend**: verify streamerdraft.com (add their DNS records in
   Cloudflare) so emails come from your domain and don't land in spam.
   Free plan = 100 emails a day: if a day gets busy, upgrade for that week.
9. **Turnstile**: make a widget for streamerdraft.com and use its keys.
10. **Test on the live site from your phone** (the checklist in
    docs/LAUNCH-PLAN.md), then get the family's feedback.

---

## Running it on your laptop

```powershell
npm install
npm run db:migrate     # once, and after any new migration
npm run dev            # http://localhost:3000
```

Settings go in `.env.local` (never committed). Without a Resend key, emails
are printed in the terminal instead of sent, so you can click the links.

Useful pages: `/admin` (dashboard), `/rules`, `/privacy`, `/r/<code>`
(a referral link). The `requests/` folder has `.http` files for testing the
API from VS Code.

## Rules for this repo

- Never commit `.env.local` or `requests/.env`. Check `git status` first.
- No new npm packages without a good reason.
