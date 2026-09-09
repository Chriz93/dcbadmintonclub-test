# Narrated game-day demo — September 9, 2026

## What was delivered

A browsable local demo at `http://127.0.0.1:5173/?demo=game-day`, opened in the Codex side panel. The twelve-step spoken tour was started in the visible browser and observed advancing automatically through registration, approval, movement and completion. Its final audio track ended at step 12. The browser was then left on Courts, session 4, round 4, with all 25 players and the five-player rest rotation visible.

The demo contains 25 named fictional players, three completed sessions and an initially unplayed fourth session. The tour completes four rounds / 80 games for that fourth session, leaving 320 fictional games across the four sessions. Every player has a clickable profile, official ELO, a rating trend, court timeline and match history. Navigation follows the original app: Home, Register, Courts, Scores, Standings, Schedule and Admin.

The old gym arrangement is preserved: C1/C2/C3 above C6/C5/C4. All five Court 6 players appear. Standings includes Leaders, Rankings, Stats, Sessions, History and RSVP. Final placements are recorded after the last movement without inventing a fifth played round.

Players can enter their own first result in the simulation; Christy can correct a result with a reason. Corrections replay ELO chronologically while preserving played court assignments. The demo supports filling synthetic scores, reviewing movements, publishing the next round, completing the evening, swapping players before a round is scored, and reviewing a local audit trail.

Registration, signatures, guardian checks, approvals, payments and attendance in this demo are explicitly simulated. They are not new real records. The spare queue and cancellation screen explain the workflow; they do not perform bank transactions or send messages. Reload/reset restores the fixture. No Supabase client is imported by the demo entry point.

## Narration and replay

- About **4.9 minutes**, twelve locally generated audio tracks, with a transcript for each step.
- Click **Reset demo**, then **Play full tour** to replay from the beginning.
- **Jump to a step** opens any part of the workflow. Playback from that point continues through the remaining steps.
- Pause remains available above the bottom navigation while speaking.
- Expand **Explore as another player or as Christy** to change the simulated viewpoint or select any of the 25 players.
- The local app server must remain running. To restart: run `pnpm dev --port 5173` from `platform`, then open the demo URL.

Narration was generated using the installed macOS Samantha voice with no paid service or external transmission. Audio loads when requested. `scripts/generate-demo-narration.ts` regenerates it on a Mac with access to the local speech service and rejects empty output.

## ELO decision

Christy authorized using the most suitable ELO method on September 9. The selected method is the existing new-backend opponent-based calculation: seed baseline `1000 + (player count − seed) × 15`, team-average expectation on a 400-point scale, K=32, frozen ratings within a round, and mean per-player change per round. Official ratings use completed sessions; rests do not count as games. This gives equal round weight to players on four- and five-player courts.

The demo reproduces the calculation in migration 014 and shares the actual court allocation, game rotation and movement functions. It does not deploy a new SQL ELO formula or overwrite legacy ratings. Court-based Leaders and numeric ELO Rankings remain distinct.

## Checks

- 471 unit/domain/database checks passed, including ten new demo-model checks.
- All 16 new desktop/mobile browser checks passed: onboarding simulation, 25-player visibility, five-player rests, clickable histories, participant scoring, invalid scores, movement/completion, standings tabs, audited correction/reset, playable narration and responsive layout.
- The first browser pass exposed inherited global layout styles that caused phone scrolling/click failures. The demo now resets its own main/footer layout; the same browser assertions passed without forced clicks.
- The regression run passed 40 of the existing 42 browser checks initially. The two offline PWA checks found that a cached reload could report `navigator.onLine = true` while network requests failed. The connected app now verifies public-host reachability through an uncached manifest request when controlled by its service worker. Both failing offline checks passed after the repair, with their original assertions unchanged.
- Lint, TypeScript and production build passed after the offline repair. The build budget counts the connected app's new lazy-loaded chunks: **185.2 KiB gzip**. The demo and narration are separate on-demand assets.
- Final affected-suite rerun: all 12 existing app-shell desktop/mobile checks passed, including both offline checks. Across the runs, all 42 existing browser scenarios and 16 new demo scenarios passed; the 471 unit/domain/database checks also passed. Repeated runs are not counted as additional cases.

## Scope still pending

This is the populated experience preview requested in phase 1. The hosted TEST site and production were not updated by this delivery. Connecting these performance views and participant-scoring permissions to the hosted database remains work, followed by a real authenticated match-day rehearsal.

Broader launch gates remain: agreement review/publication, independent real member/guardian checks, opted-in email reminder and unsubscribe delivery, actual remote-backup restore, and release configuration. The recorded paid-spare facility-cancellation exception must be reconciled with Christy's stated policy before publishing the agreement. No new paid subscription, SMS service or personal Messenger automation was enabled.
