#!/bin/bash
# A night as it is actually played: every court finishing a round at the same moment, each phone holding the version it
# last read. Before L27 the first save won and the rest were refused with "Stale state: this match changed" — the
# "database sync error" of 22 September. This asserts that every court's scores land, and that the protections which
# must survive concurrency still hold.
# Usage: bash legacy/tests/db/concurrency.sh   (local rehearsal Postgres only, same as run.sh)
set -u
cd "$(dirname "$0")/../../.."
export PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH LC_ALL=C
SOCK=${PGSOCK:-$HOME/.maplewood/pgsock}; PORT=${PGPORT:-55433}; USER=${PGUSER:-rehearsal}
case "$SOCK" in /*) ;; *) echo "refusing: PGSOCK must be a local socket folder"; exit 2;; esac
for v in "${PGHOST:-}" "${DATABASE_URL:-}" "${SUPABASE_URL:-}"; do
  case "$v" in *supabase*|*pooler*) echo "refusing: concurrency tests run only on the local rehearsal server"; exit 2;; esac
done
DB=${CONC_DB:-legacy_conc}
PSQL="psql -X -h $SOCK -p $PORT -U $USER -d $DB -At"
fail=0
say() { printf '  %-58s %s\n' "$1" "$2"; }

psql -X -h "$SOCK" -p "$PORT" -U "$USER" -d postgres -q -c "drop database if exists $DB" -c "create database $DB" || exit 2
for f in legacy/tests/rules.sql legacy/tests/db/fixtures.sql; do
  psql -X -h "$SOCK" -p "$PORT" -U "$USER" -d "$DB" -q -v ON_ERROR_STOP=1 -f "$f" >/dev/null 2>&1 || { echo "setup failed: $f"; exit 2; }
done
# WITHOUT_L27=1 leaves the fix out, to show this suite catches the fault it was written for.
MIGRATIONS="legacy/migrations/TEST_2026-09-13.sql legacy/migrations/L25_open_registration.sql legacy/migrations/L26_lock_and_statement_timeouts.sql"
[ "${WITHOUT_L27:-0}" = 1 ] || MIGRATIONS="$MIGRATIONS legacy/migrations/L27_per_court_scores.sql"
for m in $MIGRATIONS; do
  psql -X -h "$SOCK" -p "$PORT" -U "$USER" -d "$DB" -q -v ON_ERROR_STOP=1 -f "$m" >/dev/null 2>&1 || { echo "migration failed: $m"; exit 2; }
done

CLAIMS="select set_config('request.jwt.claim.sub','b0000000-0000-0000-0000-000000000001',false), set_config('request.jwt.claims','{\"aal\":\"aal2\",\"email\":\"db.organizer@example.invalid\"}',false);"
new_night() {
  $PSQL -q <<SQL
delete from public.app_state where key='current_session';
insert into public.app_state(key,value,version,updated_at)
select 'current_session', jsonb_build_object('id','S1','number',1,'cycle',1,'completed',false,'date','Sep 23, 2026',
    'scores','{}'::jsonb,'movements','[]'::jsonb,'attendance','{}'::jsonb,'preTosses','{}'::jsonb,
    'assignments',jsonb_object_agg(c::text,ids),'initialAssignments',jsonb_object_agg(c::text,ids))::text, 1, now()
from (select c, jsonb_agg(id order by id) ids from
       (select id, ((row_number() over (order by id))-1)/4 + 1 as c
          from public.players where approved and not waitlisted order by id) x
      group by c having count(*)=4) y;
SQL
}
save_court() { # court version fire_at [score]
  local sa=${4:-21}
  $PSQL -v court="$1" -v version="$2" -v fire="$3" -v sa="$sa" <<SQL 2>&1 | tail -1
\set ON_ERROR_STOP 0
$CLAIMS
select pg_sleep(greatest(0, extract(epoch from (:'fire'::timestamptz - clock_timestamp()))));
with a as (select (value::jsonb->'assignments'->(:court)::text) ids from public.app_state where key='current_session')
select public.save_court_scores(:court, 1,
  (select jsonb_object_agg('c'||:court||'_y1_g'||g, public.game_pairing(a.ids,g) || jsonb_build_object('sA',:sa,'sB',15,'w','A'))
     from a, generate_series(1,3) g),
  :version, 'S1', (select ids from a));
SQL
}
courts() { $PSQL -c "select count(*) from jsonb_object_keys((select value::jsonb->'assignments' from public.app_state where key='current_session'))"; }
scores() { $PSQL -c "select count(*) from jsonb_object_keys((select value::jsonb->'scores' from public.app_state where key='current_session'))"; }

echo "database concurrency: every court saves at once"
new_night
N=$(courts); V=$($PSQL -c "select version from public.app_state where key='current_session'")
FIRE=$($PSQL -c "select (now() + interval '3 seconds')::text")
out=$(mktemp -d)
for c in $(seq 1 "$N"); do ( save_court "$c" "$V" "$FIRE" > "$out/$c" ) & done
wait
ok=0; for c in $(seq 1 "$N"); do grep -qE '^[0-9]+$' "$out/$c" && ok=$((ok+1)); done
say "$N courts saving together, all holding version $V" "$ok/$N saved"
[ "$ok" = "$N" ] || { fail=1; for c in $(seq 1 "$N"); do grep -qE '^[0-9]+$' "$out/$c" || echo "      court $c: $(cat "$out/$c")"; done; }
got=$(scores); want=$((N*3))
say "every game is stored" "$got/$want"
[ "$got" = "$want" ] || fail=1

# The same court twice at the same moment: they must take turns, and the last write must win cleanly (no lost update).
new_night
V=$($PSQL -c "select version from public.app_state where key='current_session'")
FIRE=$($PSQL -c "select (now() + interval '3 seconds')::text")
( save_court 1 "$V" "$FIRE" 21 > "$out/a" ) & ( save_court 1 "$V" "$FIRE" 21 > "$out/b" ) & wait
both=$(( $(grep -cE '^[0-9]+$' "$out/a") + $(grep -cE '^[0-9]+$' "$out/b") ))
say "the same court saved twice at once takes turns" "$both/2 applied, 3 games stored: $(scores)"
[ "$both" = 2 ] && [ "$(scores)" = 3 ] || fail=1

# The rules that must survive concurrency.
new_night
V=$($PSQL -c "select version from public.app_state where key='current_session'")
NOW=$($PSQL -c "select now()::text")
check() { # label expected_error_fragment sql
  local got; got=$($PSQL <<SQL 2>&1 | tr '\n' ' '
\set ON_ERROR_STOP 0
$CLAIMS
$3
SQL
)
  case "$got" in *"$2"*) say "$1" "refused" ;; *) say "$1" "NOT REFUSED: $got"; fail=1 ;; esac
}
check "a score for another round is refused" "not on this court and round" \
  "with a as (select (value::jsonb->'assignments'->'1') ids from public.app_state where key='current_session')
   select public.save_court_scores(1,1,(select jsonb_build_object('c1_y2_g1', public.game_pairing(a.ids,1) || jsonb_build_object('sA',21,'sB',15,'w','A')) from a),$V,'S1',(select ids from a));"
check "a tie is refused" "no tie" \
  "with a as (select (value::jsonb->'assignments'->'1') ids from public.app_state where key='current_session')
   select public.save_court_scores(1,1,(select jsonb_build_object('c1_y1_g1', public.game_pairing(a.ids,1) || jsonb_build_object('sA',21,'sB',21,'w','A')) from a),$V,'S1',(select ids from a));"
check "a line-up that has changed is refused" "line" \
  "select public.save_court_scores(1,1,'{}'::jsonb,$V,'S1','[999,998,997,996]'::jsonb);"
check "another night's id is refused" "refresh before saving" \
  "with a as (select (value::jsonb->'assignments'->'1') ids from public.app_state where key='current_session')
   select public.save_court_scores(1,1,(select jsonb_build_object('c1_y1_g1', public.game_pairing(a.ids,1) || jsonb_build_object('sA',21,'sB',15,'w','A')) from a),$V,'OTHER',(select ids from a));"
$PSQL -q -c "update public.app_state set value=(value::jsonb || '{\"completed\":true}'::jsonb)::text where key='current_session'"
check "a finished session is locked" "scores are locked" \
  "with a as (select (value::jsonb->'assignments'->'1') ids from public.app_state where key='current_session')
   select public.save_court_scores(1,1,(select jsonb_build_object('c1_y1_g1', public.game_pairing(a.ids,1) || jsonb_build_object('sA',21,'sB',15,'w','A')) from a),$V,'S1',(select ids from a));"

# The wedge of 22 September: a connection that holds the lock and goes idle inside its transaction must be let go of.
say "idle_in_transaction_session_timeout is set for app roles" "$($PSQL -c "select count(*) from pg_roles where rolname in ('authenticated','anon','service_role') and array_to_string(rolconfig,',') like '%idle_in_transaction_session_timeout%'")/3"
[ "$($PSQL -c "select count(*) from pg_roles where rolname in ('authenticated','anon','service_role') and array_to_string(rolconfig,',') like '%idle_in_transaction_session_timeout%'")" = 3 ] || fail=1
UNB=$($PSQL -c "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosrc like '%pg_advisory_xact_lock(7262026%' and not (array_to_string(p.proconfig,',') like '%lock_timeout%' and array_to_string(p.proconfig,',') like '%statement_timeout%')")
say "every lock-taking function is still bounded (L26)" "$UNB unbounded"
[ "$UNB" = 0 ] || fail=1
PERCOURT=$($PSQL -c "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='save_court_scores' and p.prosrc like '%pg_advisory_xact_lock(7262026, p_court)%'")
say "score saves lock per court, not league-wide" "$PERCOURT/1"
[ "$PERCOURT" = 1 ] || fail=1
rm -rf "$out"; psql -X -h "$SOCK" -p "$PORT" -U "$USER" -d postgres -q -c "drop database $DB" >/dev/null 2>&1
echo "database concurrency: $([ $fail -eq 0 ] && echo PASSED || echo FAILED)"
exit $fail
