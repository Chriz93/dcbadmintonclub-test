#!/bin/sh
# Database tests: a fresh copy of the legacy schema on the local rehearsal server, every migration (legacy/tests/rules.sql,
# which also runs its own rule checks), the fixtures, then every generated case. Each case rolls back.
# Usage: sh legacy/tests/db/run.sh   (from anywhere; needs the local rehearsal Postgres, see docs/27)
set -e
cd "$(dirname "$0")/../../.."
export PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH LC_ALL=C
PG="psql -X -h ${PGSOCK:-$HOME/.maplewood/pgsock} -p ${PGPORT:-55433} -U ${PGUSER:-rehearsal}"
DB=legacy_dbt
LOG=$(mktemp -d)
python3 legacy/tests/db/gen_cases.py
$PG -d postgres -q -c "drop database if exists $DB" -c "create database $DB"
if ! $PG -d $DB -q -v ON_ERROR_STOP=1 -f legacy/tests/rules.sql > "$LOG/rules.out" 2>&1; then tail -20 "$LOG/rules.out"; echo "rules.sql failed"; exit 1; fi
grep -h "PASS" "$LOG/rules.out" | tr -s ' ' | tr '\n' ' '; echo
$PG -d $DB -q -v ON_ERROR_STOP=1 -f legacy/tests/db/fixtures.sql > /dev/null
$PG -d $DB -q -o /dev/null -f legacy/tests/db/cases.sql 2> "$LOG/cases.err" || true
total=$(grep -c '^begin;$' legacy/tests/db/cases.sql || true)
pass=$(grep -c 'NOTICE:  PASS ' "$LOG/cases.err" || true)
errors=$(grep -c 'ERROR:' "$LOG/cases.err" || true)
grep 'ERROR:' "$LOG/cases.err" | sed 's/^psql:[^ ]* //' | head -60
echo "database cases: $pass of $total passed, $errors errors"
$PG -d postgres -q -c "drop database $DB"
[ "$pass" -eq "$total" ] && [ "$errors" -eq 0 ]
