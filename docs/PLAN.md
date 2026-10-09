# StreamerDraft build plan

Phase 0: the coming-soon page (waitlist, referrals, Road to 300).

## Back end
- [x] B0 Setup: project, folders, /api/health, secrets files
- [x] B1 Database: PostgreSQL + the sign-ups table
- [ ] B2 Sign-up API: POST /api/signup, input checks, one email = one role
- [ ] B3 Email confirmation: send link, /api/confirm, only confirmed sign-ups count
- [ ] B4 Referrals + numbers: recruit links, prospect counter, top-10 leaderboard
- [ ] B5 Protection: bot check (Turnstile), rate limits
- [ ] B6 Admin API: password-protected, lists every sign-up, details, recruit counts

## Front end
- [ ] F1 Intro animation
- [ ] F2 Hero + sign-up flow (every field gets a "?" explaining why we ask)
- [ ] F3 Prospect card, Road to 300, footer
- [ ] F4 Privacy + competition rules pages
- [ ] F5 Admin dashboard at /admin (who signed up, details, recruits, GTA 6 winner check)

## Launch
- [ ] L1 Deploy to the VPS behind Cloudflare, soft launch

## Decisions
- One email = one role (prospect OR scout, never both)
- Recruit links are random codes: streamerdraft.com/r/k7x2qp
- Scouts get recruit links; their recruits count towards 300,
  but scouts are NOT on the leaderboard and can't win GTA 6
- Prospects: email, streamer name, main platform, channel link, what you stream (optional)
- Scouts: email, creator name, 1-3 platform links, audience size, content types
- Both: 18+ tick (required), email updates tick (optional)
- No follower count, no location (check UK eligibility when contacting the winner)

## Notes
- Design inspiration: the "StreamerDraft Coming Soon" canvas (v2)
- Never commit .env.local (it holds real passwords)