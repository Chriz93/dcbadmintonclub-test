# Maplewood league site makeover — plan and working prompt

Written September 9, 2026 for the site at https://chriz93.github.io/dcbadmintonclub/ (repository `Chriz93/dcbadmintonclub`, branch `main`, file `index.html`). This document is two things: the plan we agree on, and the self-contained prompt (section 8) that any engineer or assistant can execute end to end.

## 1. What we are keeping and what we are replacing

Keep: the site, its address, its look and navigation, the player flows people already know (home, register, courts, scores, standings, schedule, admin), the Supabase project behind it, and all historical data (players, completed sessions, scores, snapshots).

Replace, because the September 6 audit found them unsafe for a site holding contact, emergency and medical details of adults and minors:

| Today | After makeover |
|---|---|
| Sign-in = typing an email that exists; stored in localStorage | Email one-time code sign-in (Supabase Auth); no password |
| Admin = 7-digit PIN read from a public table | Admin = signed-in organizer account with a second factor |
| Every visitor has full read and write on all tables with the public key | Row-level rules: players see only their own private fields; only the organizer changes results |
| Whole-state JSON blobs rewritten by every write (lost updates, forged scores possible) | Versioned writes; a stale screen gets "refresh first" instead of overwriting |

Everything else is a makeover of the existing code, not a rewrite: same file structure (single `index.html` plus `sw.js`), same tables, additive columns only.

## 2. Confirmed business rules for 2026–27 (all must be exact)

1. League: Maplewood Advanced Badminton League. Organizer: Christy, personally. No club entity, no surname.
2. Permit 2026-07-21-0001: 28 approved Tuesdays, 6 cancelled dates, 20:15–22:15 Toronto time, finish play by 22:05. Six courts. Dates are data, not code.
3. 25 regular players, $400 season; spares $20 per session. Registration is closed: only emails Christy confirms can complete onboarding.
4. Fresh agreement every season; old payments and waivers give no current-season rights. Under-18: separate guardian consent plus organizer identity review; no minimum age.
5. Absence refund: $14 if notice is at least 72 elapsed hours before start (exactly 72 h qualifies).
6. School cancellation: regulars get two physical shuttles and no cash; a confirmed paid spare gets the full $20 back.
7. No-show: verified absence of a committed player = one court down next session, reversible by the organizer. Missing RSVP alone is never a no-show.
8. Spares: priority goes to the first person who has both confirmed attendance and had payment verified; an unpaid vote reserves nothing.
9. Christy sets initial seeding; the app then does ratings, court placement and deterministic tie-breaks, with organizer overrides and an audit trail.
10. With 25 attending, Court 6 has five players rotating through five games to 15; other courts play three games to 21. Everyone rests once per round on the five-court; who rests first rotates between rounds.
11. Email reminders only (Gmail sender). No SMS, no Facebook automation; the app link is pinned in the groups.

## 3. Known defects in the current production site (fix list)

Security (blocking):
- S1 Anonymous full read/write of `players`, `announcements`, `app_state` with the public key.
- S2 Admin PIN stored in public `app_state` (`admin_pin`) with a source-code fallback; `adminUnlocked` only hides buttons.
- S3 Sign-in by email existence; anyone can act as any player by typing their email.
- S4 Invite code in public storage.
- S5 Snapshots duplicate all personal data into the same public table.
- S6 Service worker caches external responses and deletes every other cache on activate.

Logic and season (must fix for 2026–27):
- L1 `DATES` hardcoded to eight April–May 2026 Tuesdays; `startSession` refuses after 8 ("All 8 done!").
- L2 No five-player court: `buildCombos` handles 2, 3 and 4 only; 25 attendees cannot be placed on six courts.
- L3 Ranking uses raw points, so 15-point games and 3-game players are disadvantaged against 21-point/4-game players.
- L4 Ties resolved by manual coin-toss prompts; missed tosses stall rotation.
- L5 First-to-21 with no deuce; the UI accepts admin-confirmed ties and unfinished scores as final.
- L6 Two-round soft cap and auto-advance can rotate before the last court's scores are in when a court is skipped.
- L7 `endSession` writes players, movements, snapshot and totals in separate requests; a failure mid-way leaves inconsistent state, and two admin tabs overwrite each other every 15 seconds.
- L8 Absent-player demotion uses `currentCourt+1` from stale data and runs even when the player was never assigned.
- L9 ELO "court factor" rewards court height, not opponent strength; ratings drift when players skip weeks.
- L10 Highest-court "peak" resets on player edits; `season_wins`/`losses` can double-count when `endSession` runs after `autoAdvance` already processed the cycle.
- L11 Schema drift: runtime expects approval, waitlist, registration-date and admin-note fields that `SUPABASE_SETUP.md` never created.
- L12 Browser-timezone dates; DST edge cases in March and November.
- L13 Polling every 15 s per tab plus a raw realtime socket that leaks heartbeat intervals on reconnect.
- L14 Many interpolated HTML strings without escaping (names, notes, announcements).
- L15 Viewport blocks zoom; several tap targets under 44 px on phones.
- L16 Embedded test runner mixes hundreds of assertions with unconditional pass markers; it does not prove behaviour.

## 4. Enhancements for the new season (proposed; confirm or strike)

Player side (keep it simple):
1. Home shows the next club night, your RSVP, your court, and the refund deadline in Toronto time.
2. RSVP with attending / not attending / maybe / late / need a spare; 72-hour refund cutoff shown; change until 2 h before start.
3. My matches: every game played with partner, opponents, score, court, round; season statistics (games, wins, win %, points %); ELO with a "provisional" tag until games are played.
4. Season agreement signing with a downloadable receipt; guardian flow for under-18.
5. Spare booking: vote, submit e-transfer reference, see confirmation or refund status.
6. Email reminders 7 days, 4 days and 3 days out for missing or "maybe" answers; one-click unsubscribe.

Organizer side (fast recovery on a live night):
7. Confirmed-player list (closed registration) and payment verification with reasons.
8. Attendance check-in, one-click court plan from ratings, drag to adjust, sit out, add a late arrival.
9. Score entry per court with validation (first to 21 or 15, no ties, no partial scores as final).
10. Fix a score with a reason; restart a round; undo the restart; everything audited and statistics recalculated automatically.
11. No-show recording with verification, one-court-down at next start, reversal.
12. Refund and shuttle ledger; school cancellation button that applies rules 6 and 7 in one step.
13. Season rollover: archive 2025–26 results, reset season stats, keep player identities and ratings history.
14. Previous-season history visible to each player after Christy links their old record.

Deferred (after a stable season start): progress charts, partnership stats, web push.

## 5. Delivery phases and exit evidence

| Phase | Work | Exit evidence |
|---|---|---|
| 0 Baseline | Copy production `index.html` into the test repository; point the test copy at the TEST Supabase project; restore the legacy tables on TEST behind proper rules (their anonymous grants were revoked on September 6) | Test copy loads against TEST with synthetic players; production untouched |
| 1 Security | Email-code sign-in, organizer second factor, row-level rules, versioned writes, private snapshots, safe service worker | Adversarial checks: a signed-in player cannot read another's phone/medical/emergency fields, cannot change scores, cannot become admin; stale write rejected |
| 2 Season data | Permit dates as data (28 + 6), five-player courts, normalized ranking, deterministic ties, season rollover | Automated rotation sweep 2–50 players × 1–10 courts; 25-player/80-game synthetic night passes; DST dates correct |
| 3 League rules | Closed registration, agreement + guardian, payments, RSVP + 72 h refund, cancellation rules, no-show, spares, ELO/seeding | Rule-by-rule automated tests including the exact 72-hour boundary and the "unpaid vote reserves nothing" case |
| 4 Reminders | Gmail sender, hourly scheduler, consent, missing-RSVP targeting, retry without duplicates, unsubscribe | Authorized test emails received; duplicate-send rehearsal passes |
| 5 End-to-end on TEST | Full season-night rehearsal with separate real accounts (regular, spare, minor, guardian, organizer): ties, 24/25 players, absences, no-shows, spare payment race, corrections, undo, cancelled session, stale tabs, two admins at once | Written verification report with pass/fail per scenario; no unresolved high-severity defect |
| 6 Release | Encrypted backup of production database and verified restore into an isolated database; migration script; deploy `index.html` to `main`; smoke test; rollback plan | Christy's approval after reviewing the TEST site; backup restore proven before cutover |

Order of work inside each phase: write the test first, make it pass on the TEST copy, then move on. No phase starts on production until Phase 6.

## 6. Testing protocol on the test website

- The test website is the test repository's `index.html` served from its own origin against Supabase project `wgolevihkvmosajumzvl`. Production (`bwepvxelvwgwxrnaglrx`) is never used for testing.
- Synthetic players only (names prefixed TEST, emails ending `example.invalid`) plus Christy's own real account and the authorized plus-alias accounts for real sign-in checks.
- Every rule in section 2 has at least one automated test; every defect in section 3 has a regression test.
- A full "match night" rehearsal is run twice: once scripted (80 games, ties, corrections), once by hand with two browsers open as two organizers.
- Results are recorded in a verification report with counts, failures and limitations. Passing tests are evidence, not proof; the manual rehearsal and the real-account checks are required.

## 7. Release to production

1. Freeze: announce a read-only window; take an encrypted backup of the production database; restore it into a disposable database and compare counts and checksums.
2. Apply the database migration (additive tables/columns, row-level rules, revocation of anonymous grants) in one reviewed transaction.
3. Deploy the new `index.html`, `sw.js` and `manifest.json` to `main`; GitHub Pages publishes within minutes.
4. Smoke test with Christy's account and one player account; confirm old history is visible.
5. Rollback: redeploy the previous commit of `index.html`; database rollback restores the verified backup into a new project and switches the URL. Never restore insecure anonymous access.

## 8. The working prompt (self-contained)

> You are taking over the Maplewood Advanced Badminton League website, a single-file web app (`index.html`, about 9,000 lines of HTML, CSS and JavaScript, plus `sw.js` and `manifest.json`) hosted on GitHub Pages from `Chriz93/dcbadmintonclub` `main`, backed by Supabase project `bwepvxelvwgwxrnaglrx` with tables `players`, `announcements` and `app_state` (JSON values under keys such as `current_session`, `completed_sessions`, `player_approvals`, `membership_overrides`, `pre_session_attendance`, `round_snapshots`, `qa_questions`, `votes_session_N`, `rsvp_session_N`, `snapshot_*`). A test copy lives in `Chriz93/dcbadmintonclub-test` and must use Supabase project `wgolevihkvmosajumzvl` only. Production must not be changed until the release step.
>
> Goal: keep this site and make it correct, safe and ready for the 2026–27 season under the rules in section 2 of `docs/18-legacy-site-makeover-plan.md`, fixing every defect in section 3 and adding the enhancements in section 4 that the organizer confirms. Work in full auto mode on the test copy: read the code first, write tests before changes, keep the single-file structure, keep the existing look and navigation, and never remove historical data.
>
> Hard requirements: (1) email one-time-code sign-in and organizer second factor replace the PIN and invite code; (2) row-level rules so a signed-in player reads only their own private fields and only the organizer changes results; (3) versioned writes so a stale screen cannot overwrite newer data; (4) permit dates as data (28 approved, 6 cancelled, Tuesdays 20:15–22:15 Toronto); (5) five-player Court 6 with games to 15, everyone rests once per round and the first rest rotates between rounds; (6) normalized ranking (win %, then points as a share of possible points) with deterministic tie-breaks and organizer override; (7) $14 refund at exactly 72 elapsed hours or more; (8) school cancellation gives regulars two shuttles and no cash, confirmed paid spares the full $20; (9) verified no-show = one court down, reversible, never from a missing RSVP alone; (10) spare priority = first to complete both attendance confirmation and verified payment; (11) fresh season agreement with guardian consent and organizer review for under-18; (12) closed registration by confirmed email list; (13) Gmail reminders with consent, missing-RSVP targeting, no duplicates, unsubscribe; no SMS.
>
> Method: for each phase in section 5, produce the tests, the change, and the evidence. Run the automated suite, then a scripted 25-player, 80-game night with ties, corrections, restart, undo, absences, no-shows, spare payment race, cancelled session and two simultaneous organizer tabs. Then run the manual rehearsal with separate real accounts on the test website. Record results honestly in a verification report: counts, failures, limitations. Do not claim zero bugs.
>
> Release: only after the organizer approves the test website. Take an encrypted backup of production, prove the restore in an isolated database, apply the additive database migration, deploy `index.html`, smoke test, and keep the rollback commit ready. Never restore anonymous full access.
>
> Do not contact players or send email without explicit authorization. Keep secrets out of the repository and out of chat. Report what was done, what was verified, and what remains, in that order.

## 9. Decisions needed from Christy before Phase 0

1. Confirm the split: this plan makes over the existing single-file site; the separate React platform in `dcbadmintonclub-test/platform` is handed to whoever continues it and is not part of this scope.
2. Confirm the sign-in change: players will receive a one-time code by email each time they sign in (no passwords, no PIN). This is the only visible change to how people log in.
3. Approve restoring the legacy tables on the TEST project behind new rules so the test copy can run.
4. Season rollover: keep 2025–26 results as history and reset season statistics for 2026–27 (recommended), or keep counting.
5. Any enhancement in section 4 you do not want.

## Status — 2026-09-09 (end of Phase 3)

- Phases 1–2 complete on TEST: email one-time-code sign-in, organizer authenticator, database rules L01–L06, derived
  statistics, Elo, registration-first, voting, season constants from the OCDSB permit.
- Phase 2f cross-tab audit: dates carried a duplicated year; Home picked the next session by calendar instead of by
  completed sessions; win streaks miscounted games after a court move; Player of the Session assumed 3 games a round;
  fees and capacity were literals; history could show "?" for renamed players; hard-coded "8 sessions". All fixed
  (`legacy/patches/p07`–`p10`), guarded by the extended Playwright scenario (Leaders, Rankings against an independent
  Elo reference, per-player game history, Stats, Sessions, History, Home, Schedule) — 6/6 passing.
- Phase 3 visual refresh applied (`p09`, `p10`): midnight-and-gold tokens, Inter, glass navigation, 10px text floor,
  organizer tab only for organizers. Screenshots: `legacy/tests/e2e/screens/` (run with `SCREENS=<dir>`).
- Open: reminder emails, backup/restore drill, production migration script (L01, L03–L06) and cutover checklist,
  Supabase Free-plan move (see `docs/19-supabase-free-plan.md`), organizer's real sign-in check on the test site.

## Status — 2026-09-09 (end of Phase 4)

- Voting: spares answer "available"; each declined regular opens a seat, filled in answer order (confirmed/standby),
  organizer seats confirmed spares from Attendance in one tap. One-tap links `?vote=coming&s=N` from emails.
- Reminders: `legacy/automation/remind.mjs` (hourly workflow `legacy-reminders.yml`, dry-run until
  `LEGACY_DELIVERY_MODE=live`, redirected to the league inbox until `ALLOW_REAL_RECIPIENTS=true`). Stages: Thursday
  evening, Saturday before the 72-hour cutoff, Monday afternoon; spare invitations whenever a seat is open.
- L07 applied to TEST; `verify.sql` green on TEST and on the local rehearsal.
- Production kit ready: `PROD_2026-27.sql`, `P00_organizer.sql`, `verify.sql`, `ROLLBACK_reopen_anon.sql`,
  `build-production.py`, `docs/20-production-cutover.md`.
- Open: organizer's real sign-in check on TEST; credential rotation; backup/restore drill; secrets for the reminder job.
