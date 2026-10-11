# StreamerDraft build plan

Phase 0: the coming-soon page (waitlist, referrals, Road to 300, GTA 6 comp).
Built by a streamer, for streamers: get scouted, get drafted, get developed.

## Key dates
| When                  | What                                                        |
|-----------------------|-------------------------------------------------------------|
| This week             | Buy streamerdraft.com, start Resend email setup             |
| Sat 10 – Fri 16 Oct   | B7 scout application, then front end (F1–F5)                |
| Mon 12 – Sun 18 Oct   | Kit check, unlisted YouTube test streams, Discord server     |
| Mon 19 Oct            | FRONT END DEADLINE                                          |
| Mon 19 – Wed 21 Oct   | Deploy (L1), real-inbox email tests, final checks           |
| Thu 22 Oct, evening   | FIRST STREAM (tease StreamerDraft)                          |
| Fri 23 / Sat 24 Oct   | REVEAL: sign-ups open                                       |
| Thu 29 Oct            | Stream 2 (Halloween horror)                                 |
| Thu 5 or 12 Nov       | Stream 3                                                    |
| Mon 16 Nov, 23:59     | Comp + Road to 300 close                                    |
| Tue 17 – Wed 18 Nov   | Check flags, confirm winner is confirmed + UK               |
| Thu 19 Nov            | GTA 6 launch: winner announced LIVE on stream               |

## How it works (the flow)
1. Anyone signs up as a prospect (streamer) or scout (creator)
   -> instantly on the list + gets a recruit link (/r/k7x2qp)
2. They get an email: "Confirm your StreamerDraft entry"
3. Email link opens /confirm -> prospects tick "I've read the rules" -> press Enter
4. Confirmed = private #number + (if UK) entered for the comp + on the leaderboard
5. Recruits count once THEY confirm and are UK-based (until then: "pending")
6. Scouts apply: what they can offer, hours a month, agree to the commitment;
   I approve them in the admin dashboard

## Back end
- [x] B0 Setup: project, folders, /api/health, secrets files
- [x] B1 Database: PostgreSQL + the sign-ups table + migration runner
- [x] B2 Sign-up API: POST /api/signup, input checks, one email = one role
- [x] B3 Email confirmation (tokens, dev-mode email, confirm endpoint, resend)
- [x] B4 Referrals, UK eligibility + numbers
  - [x] 1. Migration 003: "based in UK" + Cloudflare country
  - [x] 2. UK tick + country saved on sign-up
  - [x] 3. Stats helpers: 300 count, recruit counts, top 10
  - [x] 4. Public API: /api/stats + /api/recruits/[code]
  - [x] 5. Tests (requests/stats.http)
  - [x] 6. Commit
- [x] B5 Protection
  - [x] 1. Same-inbox duplicates (Gmail dots, +tags) - migration 004
  - [x] 2. Throwaway email block
  - [x] 3. IP fingerprint (scrambled, never the real IP)
  - [x] 4. Rate limits on every API route
  - [x] 5. Turnstile check (back end)
  - [x] 6. Commit
- [x] B6 Admin API
  - [x] 1. Migration 005: disqualify + notes + admin_signups view (flags)
  - [x] 2. Admin login (cookie session, 5 tries per 15 min)
  - [x] 3. Overview cards + graph data
  - [x] 4. People: table, person page, disqualify, notes, delete,
           full leaderboard, red flags, CSV export
  - [x] 5. Commit
- [ ] B7 Scout application
  - [x] 1. Migration 006: scout offers, hours, pitch, commitment, approval (+ admin view rebuilt)
  - [x] 2. Sign-up rules + sign-up route save the new answers
  - [x] 3. Admin: see scout answers, approve / unapprove scouts
  - [x] 4. Tests (requests/scouts.http) + commit

## Front end (target: Fri 16 Oct, deadline: Mon 19 Oct)
- [ ] F1 Intro animation (slower than v2, better streamer depiction)
- [ ] F2 Hero (the founder story) + sign-up form ("?" on each field,
      scout application questions, Turnstile widget)
      + /r/[code] recruit link page (remembers who sent them)
      + /confirm page (rules tick + Enter)
      + "You're in" screen (recruit link, entry status, counted/pending recruits)
- [ ] F3 Prospect card, Road to 300, leaderboard, footer
- [ ] F4 Privacy + competition rules pages
- [ ] F5 Admin dashboard (/admin): login, overview cards + graphs,
      people table -> person page (disqualify, notes, delete, approve scouts),
      full leaderboard + red flags, "Download CSV" button

## Launch
- [ ] L0 Buy streamerdraft.com (this week)
- [ ] L0 Verify the domain in Resend (SPF + DKIM), add DMARC
- [ ] L0 Test inbox delivery: Gmail, Outlook, Yahoo, iCloud + mail-tester.com
- [ ] L1 Deploy to the VPS behind Cloudflare; production database starts empty
      (run npm run db:migrate on the server)
- [ ] L1 Lock the server so it only accepts Cloudflare traffic
      (otherwise CF-IPCountry and the IP fingerprint can be faked)
- [ ] L1 Turnstile widget for the real domain (no localhost)
      -> NEXT_PUBLIC_TURNSTILE_SITE_KEY + TURNSTILE_SECRET_KEY on the server
- [ ] L1 NEW secrets on the server, never the dev ones:
      long ADMIN_PASSWORD, ADMIN_SESSION_SECRET, IP_HASH_SECRET
      (never change IP_HASH_SECRET after launch)
- [ ] L1 Soft launch: sign up myself + 2-3 friends, check the dashboard

## My streams
- [ ] Kit check (laptop/PC, mic, camera; OBS: 720p 30fps, hardware encoder)
- [ ] Unlisted YouTube test streams: run the whole plan once, watch it back
- [ ] Discord server ready before stream 1
- [ ] Stream 1 running order: intro (who I am, why I stream) -> horror game
      (Roblox) -> chill chat + StreamerDraft tease
- [ ] After every stream: clip 3-5 moments for Shorts / TikTok

## Content + community
- [ ] Starter playbook (OBS, multistreaming, clips, socials): every confirmed
      prospect gets it, drafted or not
- [ ] Clips + posts through the campaign (TikTok, Shorts, X, IG)
- [ ] StreamerDraft Discord

## Decisions
### The story
- Founder-led: I stream first, then reveal StreamerDraft as built by a
  streamer, for streamers
- Our difference: other platforms get you found then drop you; we help you
  grow all season
- Never promise growth or fame: "a real shot, with a scout in your corner"
- Public copy avoids real celebrity names (no implied endorsement)

### Sign-up
- One email = one role (prospect OR scout, never both)
- Anyone from any country can sign up and instantly gets a recruit link
- Recruit links are random codes: streamerdraft.com/r/k7x2qp
- Prospects: email, streamer name, main platform, channel link, what you stream (optional)
- Scouts: email, creator name, 1-3 platform links, audience size, content types
  + the scout application (see Scouts)
- Both: "based in the UK?" tick, 18+ tick (required), email updates tick (optional)

### Scouts
- Scouts apply; I approve them (audience size matters, but what they can
  GIVE matters more)
- Commitment per drafted prospect: at least 6 weeks, 2 feedback calls,
  1 raid or collab. Ticking the box = agreeing to it
- Application asks: what they can help with, hours a month, a one-line pitch

### Email confirmation
- Email = "Confirm your StreamerDraft entry" (no "win" in subject lines)
- Link opens a page with a button (email scanners can't press buttons)
- Prospects must tick "I've read the rules" to enter; scouts just confirm
- Links last 48 hours; signing up again unconfirmed sends a fresh link
- Email service: Resend (free: 3,000/month, 100/day); dev mode prints emails in the terminal

### The 300 goal
- Counts every PROSPECT who signs up, any country, no confirmation needed
- Deadline: Mon 16 Nov, 23:59
- Disqualified / fake sign-ups are removed from the count

### GTA 6 competition
- 300 prospects by Mon 16 Nov 23:59 -> top recruiter wins GTA 6 (or £70 cash)
- Under 300 -> top recruiter still wins a mystery prize worth £25
- The rules page states BOTH outcomes upfront
- To enter: confirm your email AND be UK-based
- A recruit counts only if they're confirmed AND UK-based
- Leaderboard: top 10 by counted recruits, only people with 1+ recruits
- Ties go to whoever reached that number first
- Leaderboard shows streamer name + recruit count only; #number stays private
- Scouts can recruit, but aren't on the leaderboard and can't win
- UK check: form tick + Cloudflare country + manual check before awarding
- Winner checked Tue 17 - Wed 18 Nov, announced live on stream Thu 19 Nov

### Anti-cheat
- Gmail dots/+tags count as the same email; throwaway email sites blocked
- Dashboard flags: shared IP, same IP as recruiter, UK tick vs IP country,
  Tor, 5+ recruits in 10 minutes
- Cheaters disqualified; the prize goes to the next eligible person

### Dashboard (/admin)
- Signed up vs confirmed, UK vs not UK, % by country, recruits per person,
  graphs over time, red flags, scout applications

## To decide before Draft Day
- Season 1 size (pilot idea: 20-30 prospects, 3-5 scouts)
- Max prospects per scout (I said up to 5: with 2 calls each, is 5 realistic?)
- What undrafted prospects get besides the playbook (feedback note? featured clip?)
- Draft Day format, date, platform
- Scout code of conduct + safeguarding (official channels only, how to report problems)
- How scout commitments are tracked (check-ins)

## Notes
- Design inspiration: the v2 canvas (opener slower, better streamer
  depiction, new colours instead of black and white)
- Never commit .env.local or requests/.env
- API tests live in requests/*.http