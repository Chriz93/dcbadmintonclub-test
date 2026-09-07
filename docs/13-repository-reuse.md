# Existing repository reuse

Verified September 7, 2026: GitHub repository `Chriz93/dcbadmintonclub` is public, default branch main, latest commit `445d327317a016904397d1377ab0d81ad967aa89`, matching the preserved local production checkout. GitHub Pages reports built from main at `/`, URL https://chriz93.github.io/dcbadmintonclub/. No repository replacement, push or production modification was performed. The replacement platform remains on the TEST branch until release gates pass. Reuse this repository for future deployment; publish only the compiled platform output, not the root legacy HTML or backup files.

## Reuse map

| Existing material | Treatment |
| --- | --- |
| Git repository, history and original source | Retained; verified against remote main |
| Schedule and league policies | Current supplied permit and Christy's updated rules take precedence over old hardcoded dates/fees |
| Partner rotation and court movement | Reimplemented and covered by synthetic 25-player/80-game regression |
| Player records and legacy IDs | Preserve in source database/backup; link only to verified new Auth identities with administrator review |
| Completed session scores, partnerships and court positions | Preserve as old-season history; never silently recalculate old results using new-season rules |
| Frozen playerNames, finalAssignments and perRoundAssignments | Preserve with the original session. Final positions may differ from the lineup that played the last round; do not conflate them |
| Old payment, waiver and approval flags | Preserve as historical evidence; do not grant new-season payment, signature, membership or seeding status |
| Announcements, questions, votes and snapshots | Preserve original export including unknown fields; review audience and season before importing |
| Old PIN/email-only authentication | Replaced by verified Auth and MFA; not migrated as credentials |
| Medical/contact/signature fields | Keep private in source/export; never commit to public GitHub, display in public inventory or automatically publish |

## Data actually available

The Git repository contains app code; live player and session data are in Supabase. A metadata-only query of preserved TEST legacy tables found **32 player rows, 26 state rows, two snapshots, one completed-session object containing 36 game records, and a current-session object**. There were no announcements, no malformed state JSON and no tied completed-game records. The original distinct-ID count revealed that the completed-session object lacks an ID; this is a migration review item, not evidence of a duplicate session. Production data counts have not been inferred from TEST.

Update: migration 025 now stores a private, checksummed archive in the TEST schema: 32 legacy players and one completed session (36 games). No identity links or new-season signatures were created. Users have not yet registered and established the verified identity links required for their private match history. Old-season evidence remains intact in the protected TEST tables and the original production database. A complete encrypted database export and isolated restore remain prerequisites for production migration.

## Import preparation and checks

`platform/scripts/legacy-plan.ts` understands both the old downloaded `S` backup (`players`, `sessions`, `current`) and full snapshots (`players`, `announcements`, `kv`), plus table exports with JSON-string `app_state.value`. It prints only counts, a source hash and issue locations. It does not print names, email, medical details, signatures, PINs or unknown values. Original files are never overwritten. It performs no network access, database writes or identity creation.

Run from platform with a private export path:

```
node --experimental-strip-types scripts/legacy-plan.ts /private/path/dcbc-backup.json
```

Review duplicate/missing IDs, ambiguous email matches, malformed JSON, repeated current/completed sessions, invalid teams, missing players, winner mismatches, old tied/unfinished scores and ambiguous dates before importing. Numeric and string forms of a legacy ID are treated consistently. Sessions without IDs are still counted and their games inspected; they require an explicit reviewed historical identifier. Preserve all fields in the original encrypted archive, even where there is no new-table mapping yet. Do not rerun the old embedded test suite against a live production database.

The new automated cases cover these old formats and migration hazards. They supplement the existing operational, security, browser and match-day suites; they do not constitute a completed production-data import.

## Remaining steps

Obtain/verify the complete encrypted source backup, resolve migration exceptions, map registered/verified identities, import old history into an explicitly historical season, compare source/import counts and totals, and verify private previous-match access with those accounts. Cloudflare account and sender setup remain separate dependencies. Historic data reuse must not bypass this season's fresh signature and Christy's seed order.

Final verification for this phase: **136 automated tests passed**, including 11 legacy-format/SQL-inventory checks. ESLint and the production build passed. Existing browser features were not changed in this phase; the prior 24 browser checks are not represented as a fresh run here.

## Completed archive implementation — September 7

Migration 025 and `archive-existing-test-history.sql` were applied to TEST. The archive preserves original data inside the database, with administrator-only access to its source. Legacy PIN keys and redundant nested snapshots are excluded from the new archive; originals remain in protected source tables. Members load Previous seasons under Member hub after an administrator explicitly links their legacy identity. Linking requires matching verified email, approved current-season registration and a current signature. It does not transfer old payment, waiver or ranking entitlement. Missing session IDs use an archive-specific session ordinal, preserving original date labels and scores; invalid/tied historical results are marked for review.

The archive/link administration and member history UI are implemented. Real-browser archive administration could not be exercised in the final pass because the browser session had returned to the sign-in/MFA gate. Automated SQL isolation and desktop/mobile member-history checks passed. See `14-release-handover.md` for current evidence and remaining gates; earlier phase counts above are historical.
