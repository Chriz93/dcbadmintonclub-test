# The sanity suite, and where the full suite's time goes

The full suite is about 10,800 browser tests plus about 1,100 unit tests. It takes about 50 minutes on this Mac and 45
on GitHub. That is too slow to wait for while building a feature, so there are two levels:

- **Sanity suite** (`bash legacy/tests/sanity.sh`, 6 minutes on this Mac on 14 September: 792 browser tests, 1,114
  unit and 39 automation tests, all passed): run it while building and before pushing.
- **Full suite** (GitHub, on every push, unattended): a release to TEST waits for it to pass. Nobody has to wait for it
  locally.

## What the sanity suite runs, and why

| Part | Tests | Why it is in the sanity suite |
|---|---|---|
| Unit tests (all) | about 1,110 | Every rule (court engine, starting courts, spare seats, scoring, fees, times), the reference models, the production build and the coverage matrix. Under a minute. |
| Automation tests (all) | 39 | Reminders and backups: who is emailed, and when. Seconds. |
| Match night, ten-session season, season opener (desktop and phone size) | 24 | The end-to-end journeys: register, vote, start a night, score two rounds, rotate, end, undo, standings. |
| Focused checks for the defects fixed in this release | about 340 | Call In, the vote lock, players set before the session, slow-connection saves, End Session, the keyboard after a redraw, court locks, sync races, sign-in, production isolation, seating, attendance counts, dialogs and accessibility. Each one fails if its defect comes back. |
| The first three leagues of every generated suite (desktop and phone) | about 150 | Every tab and flow (Players, Registered, Attendance, Assign, Adjust, Scores, Standings, Vote, Pay, Tools, Q&A, History…) on three different leagues: small, full, and mid-season. |
| Button census: every control on every page listed, in 20 states, desktop and phone | 40 | Fails if a new button appears without a test, or an old one disappears. |
| Button census: every control of a Round 1 night clicked | about 90 | Every button, list and tag in a live night does something and never answers only "not available". |

## Where the full suite's time goes (GitHub timings, 666d29d)

211 test-minutes in total (run in parallel, so about 45 minutes of waiting).

| Suite | Tests | Test-minutes | Share |
|---|---|---|---|
| `interop` (10 two-person journeys × 50 leagues) | 500 | 34 | 16% |
| Button census, desktop clicks | 1,704 | 27 | 13% |
| Button census, keyboard | 1,547 | 26 | 12.5% |
| Button census, phone clicks | 1,704 | 18 | 9% |
| About 40 generated suites of 100 leagues each (Players, Adjust, Tools, Standings…) | about 4,300 | about 90 | 43% |
| Focused checks and journeys | about 1,000 | about 16 | 7% |

## Redundancy, and what could be trimmed (not done without the organizer's approval)

1. **The keyboard census repeats the click census.** It works the same 1,547 controls, with the same effect checks,
   from the keyboard instead of the mouse. Its own value is that every control can be reached with Tab and works with
   Enter. One reachability check per state (about 20 tests, checking every control's Tab stop and role), plus
   `keyboard-redraw.spec.ts` and `dialog-keyboard.spec.ts`, keeps that. It saves about 1,500 tests and 25 test-minutes.
2. **The phone click census repeats the desktop one** on the same controls. What phones add (tap size, layout at
   320 px) is covered by `phone/reflow.spec.ts` and the phone suites. Keeping four states on phone (before a session,
   Round 1, both rounds done, a spare's view) saves about 1,350 tests and 14 test-minutes.
3. **`interop` repeats each of its ten journeys on 50 leagues.** Ten leagues per journey would still cover small,
   full and mid-season leagues. It saves 400 tests and about 27 test-minutes.
4. **The generated suites (100 leagues each) are cheap and have found real defects** (24 "present" with 22 on the
   courts, the round-advance timing, the attendance toast). They are worth keeping at full size on GitHub. The sanity
   suite runs three of each.

Together 1–3 would take the full suite from about 10,800 to about 7,500 browser tests and from 211 to about 145
test-minutes: about 32 minutes on GitHub instead of 45. Each check that would be removed is covered elsewhere, as noted.
