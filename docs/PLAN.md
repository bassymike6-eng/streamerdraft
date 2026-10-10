# StreamerDraft build plan

Phase 0: the coming-soon page (waitlist, referrals, Road to 300, GTA 6 comp).

## How it works (the flow)
1. Anyone signs up -> instantly on the list + gets a recruit link (/r/k7x2qp)
2. They get an email: "Confirm your StreamerDraft entry"
3. Email link opens /confirm -> prospects tick "I've read the rules" -> press Enter
4. Confirmed = private #number + (if UK) entered for GTA 6 + on the leaderboard
5. Recruits count once THEY confirm and are UK-based (until then: "pending")

## Back end
- [x] B0 Setup: project, folders, /api/health, secrets files
- [x] B1 Database: PostgreSQL + the sign-ups table + migration runner
- [x] B2 Sign-up API: POST /api/signup, input checks, one email = one role
- [x] B3 Email confirmation
  - [x] 1. Migration 002: number counters + rules_accepted_at column
  - [x] 2. Secret link maker (src/lib/tokens.ts)
  - [x] 3. Email sender with dev mode (src/lib/email.ts)
  - [x] 4. The confirmation email (src/lib/confirmation.ts)
  - [x] 5. Sign-up sends the email; signing up again unconfirmed resends it
  - [x] 6. Confirm endpoint: POST /api/confirm (token + rules tick)
  - [x] 7. Test the whole flow (requests/confirm.http)
  - [x] 8. Commit
- [x] B4 Referrals, UK eligibility + numbers
  - Migration 003: "based in UK" answer + Cloudflare country code
  - Recruit counts (confirmed + UK) and pending counts
  - 300 counter (all prospect sign-ups, any country)
  - Top-10 leaderboard (1+ recruits, ties -> whoever got there first)
- [x] B5 Protection: bot check (Turnstile), rate limits, Gmail dot/+ tricks,
      throwaway email block, IP fingerprint
- [x] B6 Admin API: password-protected, every sign-up, details, recruits, flags

## Front end
- [ ] Turnstile widget on the sign-up form (sends turnstileToken with the sign-up)
- [ ] F1 Intro animation
- [ ] F2 Hero + sign-up flow ("?" on each field), "You're in" screen
      (recruit link, entry status, counted/pending recruits),
      /confirm page (rules tick + Enter button)
- [ ] F3 Prospect card, Road to 300, leaderboard, footer
- [ ] F4 Privacy + competition rules pages
- [ ] F5 Admin dashboard at /admin (sign-ups, details, recruits,
      country breakdown, cheat flags, GTA 6 winner check)
- [ ] Admin: login page (/admin)
- [ ] Admin: overview cards + graphs (overview, charts)
- [ ] Admin: people table with search/filters → person page (disqualify, notes, delete)
- [ ] Admin: full leaderboard (winner picking) + red flags page
- [ ] Admin: "Download CSV" button

## Launch
- [ ] L0 Buy streamerdraft.com + verify it in Resend (emails from @streamerdraft.com)
- [ ] L1 Deploy to the VPS behind Cloudflare, soft launch
- [ ] Strong, NEW ADMIN_PASSWORD + ADMIN_SESSION_SECRET on the server (not the dev ones)
- [ ] Lock the server so it only accepts traffic from Cloudflare (otherwise CF-IPCountry can be faked)
- [ ] L0 Buy streamerdraft.com, verify it in Resend (SPF + DKIM), add DMARC,
      test inbox delivery on Gmail, Outlook, Yahoo, iCloud + mail-tester.com
- [ ] Create a Turnstile widget in Cloudflare for the real domain (no localhost) → NEXT_PUBLIC_TURNSTILE_SITE_KEY + TURNSTILE_SECRET_KEY on the server
- [ ] Set a NEW random IP_HASH_SECRET on the server (and never change it after launch)

## Decisions
### Sign-up
- One email = one role (prospect OR scout, never both)
- Anyone from any country can sign up and instantly gets a recruit link
- Recruit links are random codes: streamerdraft.com/r/k7x2qp
- Prospects: email, streamer name, main platform, channel link, what you stream (optional)
- Scouts: email, creator name, 1-3 platform links, audience size, content types
- Both: "based in the UK?" tick, 18+ tick (required), email updates tick (optional)

### Email confirmation
- Email = "Confirm your StreamerDraft entry" (no "win" in subject lines)
- Link opens a page with a button (email scanners can't press buttons)
- Prospects must tick "I've read the rules" to enter; scouts just confirm
- Links last 48 hours; signing up again unconfirmed sends a fresh link
- Email service: Resend (free: 3,000/month, 100/day); dev mode prints emails in the terminal

### The 300 goal
- Counts every PROSPECT who signs up, any country, no confirmation needed
- Rules allow removing fake/duplicate sign-ups from the count

### GTA 6 competition
- Prize: "Win GTA 6" (winner can choose GTA 6 or £70 cash)
- To enter: confirm your email AND be UK-based
- A recruit counts for you only if they're confirmed AND UK-based
- Leaderboard: top 10 by counted recruits, only people with 1+ recruits
- Ties go to whoever reached that number first
- Leaderboard shows streamer name + recruit count only; #number stays private
- Scouts can recruit, but aren't on the leaderboard and can't win
- UK check: form tick + Cloudflare country code + manual check before awarding

### Anti-cheat
- Gmail dots/+tags count as the same email; throwaway email sites blocked
- Dashboard flags: shared network, sign-up bursts, suspicious recruits
- Cheaters disqualified, prize goes to the next eligible person

### Dashboard (/admin)
- Signed up vs confirmed, UK vs not UK, % by country, recruits per person

## Notes
- Design inspiration: the "StreamerDraft Coming Soon" canvas (v2)
- Never commit .env.local (it holds real passwords)