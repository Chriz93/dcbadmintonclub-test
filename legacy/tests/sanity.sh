#!/bin/bash
# The sanity suite: the most important checks, in about six to eight minutes (docs/33). Run it while building a feature.
# GitHub runs the full suite (about 10,800 browser tests) on every push; a release to TEST waits for that to pass.
#   bash legacy/tests/sanity.sh
set -u
cd "$(dirname "$0")/../.." || exit 1
RT="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies"
[ -d "$RT" ] && export PATH="$RT/node/bin:$RT/bin/fallback:$PATH"
export TZ=UTC                         # GitHub's machines run in UTC; league times are worked out in the league's zone
C=../legacy/tests/e2e/playwright.config.ts
fail=0; t0=$(date +%s)
step() { echo; echo "== $1"; }

step "unit (every rule, the reference models, the build and the coverage matrix)"
node --import ./legacy/tests/unit/fetch-guard.mjs --test legacy/tests/unit/*.test.mjs > /tmp/sanity-unit.log 2>&1 || fail=1
grep -E "^ℹ (tests|pass|fail) |^# (tests|pass|fail) " /tmp/sanity-unit.log

step "automation (reminders and backups)"
node --test legacy/automation/*.test.mjs > /tmp/sanity-automation.log 2>&1 || fail=1
grep -E "^ℹ (pass|fail) |^# (pass|fail) " /tmp/sanity-automation.log

cd platform || exit 1
step "match night, ten-session season, season opener, and the two outage guards (desktop and phone size)"
# request-timeout: a request the database never answers is given up on (the 15 September outage, p73).
# score-focus: a redraw never steals the score being typed (p72).
pnpm exec playwright test -c $C --project=desktop --project=mobile --reporter=line || fail=1

step "focused checks for every defect fixed in this release"
pnpm exec playwright test -c $C --project=tabs --reporter=line \
  tabs/call-in tabs/organizer-vote tabs/complete-locks tabs/slow-network tabs/slow-end-session tabs/keyboard-redraw \
  tabs/audit-controls tabs/sync-race tabs/review-regressions tabs/controls tabs/dialog-keyboard tabs/signin \
  tabs/isolation tabs/seating tabs/attendance-count tabs/a11y tabs/organizer-seats tabs/completed-round-cards tabs/tonight-2026-09-16 tabs/courts-layout-and-elo || fail=1

step "the first five leagues of every generated suite (desktop and phone; 005 is a finished night)"
pnpm exec playwright test -c $C --project=tabs --project=tabs-phone --grep " 00[1-5] ·" --reporter=line || fail=1

step "the button census: every control on every page is listed (20 states), and every control of Round 1 is clicked"
pnpm exec playwright test -c $C --project=tabs --project=tabs-phone tabs/buttons.spec tabs/phone/buttons.spec \
  --grep "the census lists every control|Button · round-1 ·" --reporter=line || fail=1

echo; echo "sanity suite: $([ $fail -eq 0 ] && echo PASSED || echo FAILED) in $(( ($(date +%s) - t0) / 60 )) min"
exit $fail
