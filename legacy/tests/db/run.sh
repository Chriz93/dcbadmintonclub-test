#!/bin/sh
# Database tests: a fresh copy of the legacy schema on the local rehearsal server, every migration (legacy/tests/rules.sql,
# which also runs its own rule checks), the fixtures, then every generated case. Each case rolls back.
# Usage: sh legacy/tests/db/run.sh   (from anywhere; needs the local rehearsal Postgres, see docs/27)
set -e
cd "$(dirname "$0")/../../.."
export PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH LC_ALL=C
PG="psql -X -h ${PGSOCK:-$HOME/.maplewood/pgsock} -p ${PGPORT:-55433} -U ${PGUSER:-rehearsal}"
DB=legacy_dbt
# Local only. This suite creates and drops whole databases, so it refuses anything but the local rehearsal server.
case "${PGSOCK:-$HOME/.maplewood/pgsock}" in /*) ;; *) echo "refusing: PGSOCK must be a local socket folder"; exit 2;; esac
for v in "${PGHOST:-}" "${DATABASE_URL:-}" "${PGSOCK:-}" "${PGSERVICE:-}" "${SUPABASE_URL:-}"; do
  case "$v" in *supabase*|*pooler*|*bwepvxelvwgwxrnaglrx*|*wgolevihkvmosajumzvl*) echo "refusing: database tests run only on the local rehearsal server"; exit 2;; esac
done
LOG=$(mktemp -d)
python3 legacy/tests/db/gen_cases.py
$PG -d postgres -q -c "drop database if exists $DB" -c "create database $DB"
if ! $PG -d $DB -q -v ON_ERROR_STOP=1 -f legacy/tests/rules.sql > "$LOG/rules.out" 2>&1; then tail -20 "$LOG/rules.out"; echo "rules.sql failed"; exit 1; fi
grep -h "PASS" "$LOG/rules.out" | tr -s ' ' | tr '\n' ' '; echo
$PG -d $DB -q -v ON_ERROR_STOP=1 -f legacy/tests/db/fixtures.sql > /dev/null
# The prepared rollback (ROLLBACK_2026-09-12.sql) on the same database: the previous site can register again and no
# waiver record is lost (rollback-check.sql); a second run refuses and changes nothing.
$PG -d $DB -q -c "create table dbt.rb_before as select count(*) n from public.waiver_acceptances"
rb=failed
if $PG -d $DB -q -v ON_ERROR_STOP=1 -f legacy/migrations/ROLLBACK_2026-09-12.sql > "$LOG/rb.out" 2>&1 && $PG -d $DB -q -v ON_ERROR_STOP=1 -f legacy/tests/db/rollback-check.sql >> "$LOG/rb.out" 2>&1; then
  if $PG -d $DB -q -v ON_ERROR_STOP=1 -f legacy/migrations/ROLLBACK_2026-09-12.sql > "$LOG/rb2.out" 2>&1; then echo "a second rollback ran"
  elif grep -q "is not the version from this release (L20) — nothing was changed" "$LOG/rb2.out"; then rb=ok
  else tail -5 "$LOG/rb2.out"; fi
else tail -20 "$LOG/rb.out"; fi
echo "rollback rehearsal: $rb"

[ "$rb" = ok ] || exit 1
$PG -d postgres -q -c "drop database $DB" -c "create database $DB"
$PG -d $DB -q -v ON_ERROR_STOP=1 -f legacy/tests/rules.sql > "$LOG/rules-latest.out" 2>&1
$PG -d $DB -q -v ON_ERROR_STOP=1 -f legacy/tests/db/fixtures.sql > /dev/null
python3 - "$LOG/failed-upgrade.sql" <<'PY'
from pathlib import Path
import sys
sql=Path('legacy/migrations/TEST_2026-09-13.sql').read_text()
Path(sys.argv[1]).write_text(sql.removesuffix('commit;\n')+'select 1/0;\ncommit;\n')
PY
if $PG -d $DB -q -v ON_ERROR_STOP=1 -f "$LOG/failed-upgrade.sql" > "$LOG/failed-upgrade.out" 2>&1; then echo "injected upgrade failure was not detected";exit 1;fi
if ! grep -q 'division by zero' "$LOG/failed-upgrade.out"; then tail -15 "$LOG/failed-upgrade.out";exit 1;fi
$PG -d $DB -q -v ON_ERROR_STOP=1 -c "do \$\$ begin if to_regprocedure('public.save_court_scores(int,int,jsonb,int)') is null or exists(select 1 from information_schema.columns where table_schema='public' and table_name='players' and column_name='archived_at') then raise exception 'Failed upgrade did not roll back';end if;end \$\$;"
echo "atomic upgrade rollback: OK"
for migration in legacy/migrations/TEST_2026-09-13.sql; do
  if ! $PG -d $DB -q -v ON_ERROR_STOP=1 -f "$migration" >> "$LOG/latest.out" 2>&1; then tail -30 "$LOG/latest.out";exit 1;fi
done
$PG -d $DB -At -v ON_ERROR_STOP=1 -f legacy/migrations/verify.sql > "$LOG/verify.out"
if grep 'FAIL' "$LOG/verify.out"; then echo "release verification failed";exit 1;fi
echo "release verification: all checks OK"
$PG -d $DB -q -o /dev/null -f legacy/tests/db/cases.sql 2> "$LOG/cases.err" || true
total=$(grep -c '^begin;$' legacy/tests/db/cases.sql || true)
pass=$(grep -c 'NOTICE:  PASS ' "$LOG/cases.err" || true)
errors=$(grep -c 'ERROR:' "$LOG/cases.err" || true)
grep 'ERROR:' "$LOG/cases.err" | sed 's/^psql:[^ ]* //' | head -60
echo "database cases: $pass of $total passed, $errors errors"
for suite in legacy/tests/db/review.sql legacy/tests/db/season-recovery.sql legacy/tests/db/operations-regressions.sql; do
  if ! $PG -d $DB -q -v ON_ERROR_STOP=1 -f "$suite" >> "$LOG/review.out" 2>&1; then tail -30 "$LOG/review.out";exit 1;fi
done
grep 'PASS review:' "$LOG/review.out"
$PG -d postgres -q -c "drop database $DB"
[ "$pass" -eq "$total" ] && [ "$errors" -eq 0 ]
