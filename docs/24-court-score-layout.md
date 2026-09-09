# Courts and Scores layout — 9 September 2026

This update follows Christy's two supplied reference screenshots. It changes the connected `platform/` app and its fictional game-day demo, using shared presentation components. Deployment destination remains the `league-release` Preview of the Cloudflare TEST project.

## Courts

- Compact dark gym enclosure, entrance/back-wall labels, C1/C2/C3 above C6/C5/C4, and gold/silver/bronze court accents.
- Gym and list views; every player has a profile button. The map shows the next unscored game's actual teams. Once a court finishes, it shows the last played game and labels it accordingly.
- The fifth player is explicitly shown as resting, never omitted. Court details include all three or five games and the complete rest rotation.
- Incoming arrows use saved assignments. The separate movement view retains the complete up/down/stayed history.
- Sharing opens a WhatsApp draft containing only the displayed league summary. The user chooses a recipient and sends it themselves.
- Administrator assignment editing links to the existing reviewed match-day workflow, retaining eligibility checks and audit controls.

## Scores

- Court selection, a six-court roster grid, progress tiles, and completed-court standings with wins and points, followed by the selected court's score forms.
- The member's court is selected initially. Other courts are readable; only a participant can submit the first result. Christy retains audited correction access.
- Finished individual courts show standings while waiting for the rest. Proposed movement appears only when the complete schedule validates. Published arrows always come from saved assignments rather than a fresh recalculation.
- Missing games invalidate completion even if all remaining games have scores. Unsaved edits require confirmation before a court switch.
- ELO, rotation, tie-breaking, payment, agreement and database authorization logic remain unchanged.

## Verification

- TypeScript, lint and both demo/TEST build checks.
- 1,190 unit/database tests.
- All 92 desktop/mobile browser acceptance tests passed locally after fixing contrast, a screen-reader-label overflow and obsolete layout selectors.
- Six additional browser scenarios, each on desktop and mobile: physical layout/teams/rests/accessibility; roster selection and permissions; partial completion; proposed versus published movement; missing-game rejection; unsaved edit protection and administrator corrections.
- Existing browser selectors updated to the new controls; all original permission, scoring, navigation and match-day assertions retained.

## Published verification

- Preview: https://league-release.maplewood-league-test.pages.dev/
- Source revision: `304b770b94f28dedef85d2076c08bb345869f9c2`.
- [GitHub quality gates passed](https://github.com/Chriz93/dcbadmintonclub-test/actions/runs/34407320522), including coverage, builds, dependency audit and all browser tests.
- TEST archive: 27 public files, SHA-256 `8f6e4eae4b367ba5be7acd5ce1805ad0f29255db76b04c29052d778c464726df`; no hidden build metadata or credentials packaged.
- Hosted browser loaded `assets/index-DkPjGf-d.js`, matching the built entry. After a simulated round publication, the map showed 25 players, one resting slot, five upward and five downward movements. Scores showed six roster cards, six completed courts and 25 standings rows with published movement labels. No browser errors were reported.

The launch dependencies documented in [23-connected-product-release.md](23-connected-product-release.md) still apply. This visual update does not enable the deferred reminder credentials or constitute a production launch.
