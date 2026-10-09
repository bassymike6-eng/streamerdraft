# StreamerDraft build plan

Phase 0: the coming-soon page (waitlist, referrals, Road to 300).

## Back end
- [x] B0 Setup: project, folders, /api/health, secrets files
- [ ] B1 Database: PostgreSQL + the sign-ups table
- [ ] B2 Sign-up API: POST /api/signup, input checks, one email = one role
- [ ] B3 Email confirmation: send link, /api/confirm, only confirmed sign-ups count
- [ ] B4 Referrals + numbers: recruit links, prospect counter, top-10 leaderboard
- [ ] B5 Protection: bot check (Turnstile), rate limits

## Front end
- [ ] F1 Intro animation
- [ ] F2 Hero + sign-up flow
- [ ] F3 Prospect card, Road to 300, footer
- [ ] F4 Privacy + competition rules pages

## Launch
- [ ] L1 Deploy to the VPS behind Cloudflare, soft launch

## Notes
- Design inspiration: the "StreamerDraft Coming Soon" canvas (v2)
- Never commit .env.local (it holds real passwords)