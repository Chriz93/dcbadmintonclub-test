#!/bin/bash
# A full league night against a real Postgres: six courts, twenty-four players, two rounds, every court's phone saving
# at the same time — plus the faults that actually happen at the gym (a phone that drops mid-save, a phone that retries,
# the organizer's page polling throughout). Written after 22 September 2026, when session 2 wedged mid-round.
# Usage: bash legacy/tests/db/night.sh      (local rehearsal Postgres only)
set -u
cd "$(dirname "$0")/../../.."
export PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH LC_ALL=C
SOCK=${PGSOCK:-$HOME/.maplewood/pgsock}; PORT=${PGPORT:-55433}; PGU=${PGUSER:-rehearsal}
case "$SOCK" in /*) ;; *) echo "refusing: PGSOCK must be a local socket folder"; exit 2;; esac
for v in "${PGHOST:-}" "${DATABASE_URL:-}" "${SUPABASE_URL:-}"; do
  case "$v" in *supabase*|*pooler*) echo "refusing: the night simulation runs only on the local rehearsal server"; exit 2;; esac
done
DB=${NIGHT_DB:-legacy_night}
PSQL="psql -X -h $SOCK -p $PORT -U $PGU -d $DB -At"
COURTS=6; PER=4; GAMES=3; ROUNDS=2
fail=0; say() { printf '  %-56s %s\n' "$1" "$2"; }
bad() { say "$1" "$2"; fail=1; }

psql -X -h "$SOCK" -p "$PORT" -U "$PGU" -d postgres -q -c "drop database if exists $DB" -c "create database $DB" || exit 2
for f in legacy/tests/rules.sql legacy/tests/db/fixtures.sql; do
  psql -X -h "$SOCK" -p "$PORT" -U "$PGU" -d "$DB" -q -v ON_ERROR_STOP=1 -f "$f" >/dev/null 2>&1 || { echo "setup failed: $f"; exit 2; }
done
MIGRATIONS="legacy/migrations/TEST_2026-09-13.sql legacy/migrations/L25_open_registration.sql legacy/migrations/L26_lock_and_statement_timeouts.sql"
[ "${WITHOUT_L27:-0}" = 1 ] || MIGRATIONS="$MIGRATIONS legacy/migrations/L27_per_court_scores.sql"
for m in $MIGRATIONS; do
  psql -X -h "$SOCK" -p "$PORT" -U "$PGU" -d "$DB" -q -v ON_ERROR_STOP=1 -f "$m" >/dev/null 2>&1 || { echo "migration failed: $m"; exit 2; }
done

ORG="select set_config('request.jwt.claim.sub','b0000000-0000-0000-0000-000000000001',false), set_config('request.jwt.claims','{\"aal\":\"aal2\",\"email\":\"db.organizer@example.invalid\"}',false);"

# A full roster: twenty-four approved regulars.
$PSQL -q <<SQL
insert into public.players(name,membership_type,approved,waitlisted,no_show_count,admin_note,updated_at,email_reminders,declared_payment)
select 'Night Player '||g, 'regular', true, false, 0, '', now(), true, ''
from generate_series(1,24) g
where (select count(*) from public.players where approved and not waitlisted and membership_type='regular') < 24;
SQL
ROSTER=$($PSQL -c "select count(*) from (select id from public.players where approved and not waitlisted and membership_type='regular' order by id limit $((COURTS*PER))) x")
[ "$ROSTER" = "$((COURTS*PER))" ] || { echo "roster is $ROSTER, need $((COURTS*PER))"; exit 2; }

start_night() {
  $PSQL -q <<SQL
delete from public.app_state where key='current_session';
insert into public.app_state(key,value,version,updated_at)
select 'current_session', jsonb_build_object('id','NIGHT','number',1,'cycle',1,'completed',false,'date','Sep 24, 2026',
    'scores','{}'::jsonb,'movements','[]'::jsonb,'attendance','{}'::jsonb,'preTosses','{}'::jsonb,
    'assignments',jsonb_object_agg(c::text,ids),'initialAssignments',jsonb_object_agg(c::text,ids))::text, 1, now()
from (select c, jsonb_agg(id order by id) ids from
       (select id, ((row_number() over (order by id))-1)/$PER + 1 as c
          from (select id from public.players where approved and not waitlisted and membership_type='regular'
                order by id limit $((COURTS*PER))) p) x
      group by c) y;
SQL
}

# One court's phone: saves its games one at a time, exactly as the app does (one call per game).
phone() { # court round fire_at out
  local court=$1 round=$2 fire=$3 out=$4 g t0 t1
  : > "$out"
  for g in $(seq 1 $GAMES); do
    t0=$(python3 -c 'import time;print(int(time.time()*1000))')
    $PSQL -v court="$court" -v round="$round" -v g="$g" -v fire="$fire" <<SQL >>"$out" 2>&1
\set ON_ERROR_STOP 0
$ORG
select pg_sleep(greatest(0, extract(epoch from (:'fire'::timestamptz - clock_timestamp()))));
with a as (select (value::jsonb->'assignments'->(:court)::text) ids from public.app_state where key='current_session')
select 'SAVED '||public.save_court_scores(:court, :round,
  (select jsonb_build_object('c'||:court||'_y'||:round||'_g'||:g,
      public.game_pairing(a.ids,:g) || jsonb_build_object('sA',21,'sB',(10+:court+:g)%20,'w','A')) from a),
  (select version from public.app_state where key='current_session'), 'NIGHT', (select ids from a));
SQL
    t1=$(python3 -c 'import time;print(int(time.time()*1000))')
    # Game 1 waits on the start barrier, so only games 2 and 3 measure real save latency under contention.
    [ "$g" = 1 ] || echo "MS $((t1-t0))" >> "$out"
    fire=$($PSQL -c "select now()::text")   # the next game goes as soon as this one is done
  done
}

# The organizer's page, polling while the courts save.
poller() { local until=$1 out=$2; : > "$out"
  while [ "$(date +%s)" -lt "$until" ]; do
    $PSQL -c "select version from public.app_state where key='current_session'" >>"$out" 2>&1 || echo "READ FAILED" >>"$out"
    sleep 1
  done
}

scores_in() { $PSQL -c "select count(*) from jsonb_object_keys((select value::jsonb->'scores' from public.app_state where key='current_session'))"; }
echo "a full night: $COURTS courts, $((COURTS*PER)) players, $ROUNDS rounds, every court saving at once"
start_night
work=$(mktemp -d); saved=0; failed=0; slowest=0

for round in $(seq 1 $ROUNDS); do
  FIRE=$($PSQL -c "select (now() + interval '3 seconds')::text")
  UNTIL=$(( $(date +%s) + 25 ))
  poller "$UNTIL" "$work/reads-$round" &
  POLL=$!
  for c in $(seq 1 $COURTS); do ( phone "$c" "$round" "$FIRE" "$work/r$round-c$c" ) & done
  # A phone drops mid-round: end whichever connection holds the league lock, the way the gym's wifi does.
  if [ "$round" = 1 ]; then ( sleep 4; $PSQL -c "select pg_terminate_backend(pid) from pg_stat_activity where datname=current_database() and wait_event='advisory' and pid<>pg_backend_pid() limit 1" >/dev/null 2>&1 ) & fi
  wait $(jobs -p | grep -v "$POLL") 2>/dev/null
  wait
  for c in $(seq 1 $COURTS); do
    saved=$((saved + $(grep -c '^SAVED' "$work/r$round-c$c")))
    failed=$((failed + $(grep -c '^ERROR' "$work/r$round-c$c")))
    for ms in $(grep '^MS ' "$work/r$round-c$c" | awk '{print $2}'); do [ "$ms" -gt "$slowest" ] && slowest=$ms; done
  done
  got=$(scores_in); want=$((COURTS*GAMES*round))
  if [ "$got" = "$want" ]; then say "round $round: every court's games are stored" "$got/$want"; else bad "round $round: games stored" "$got/$want"; fi
  readfails=$(grep -c "READ FAILED" "$work/reads-$round")
  if [ "$readfails" = 0 ]; then say "round $round: the organizer's page kept reading" "$(grep -c . "$work/reads-$round") reads, 0 failed";
  else bad "round $round: reads failed while courts saved" "$readfails failed"; fi
  if [ "$round" -lt "$ROUNDS" ]; then
    V=$($PSQL -c "select version from public.app_state where key='current_session'")
    adv=$($PSQL <<SQL 2>&1 | tr '\n' ' ' 
\set ON_ERROR_STOP 0
$ORG
select public.set_state('current_session',(select jsonb_set(value::jsonb,'{cycle}',to_jsonb($((round+1)))) from public.app_state where key='current_session')::text,$V);
SQL
)
    case "$adv" in *ERROR*) bad "round $round: advancing to round $((round+1))" "$adv";; *) say "round $round complete, advanced to round $((round+1))" "ok";; esac
  fi
done

say "saves that succeeded / failed" "$saved / $failed"
[ "$failed" = 0 ] || fail=1
say "slowest single save while all six courts saved" "${slowest}ms"
V=$($PSQL -c "select version from public.app_state where key='current_session'")
fin=$($PSQL <<SQL 2>&1 | tr '\n' ' ' 
\set ON_ERROR_STOP 0
$ORG
select 'ENDED' from public.finalize_session('NIGHT',$V,
  (select jsonb_set(jsonb_set(value::jsonb,'{completed}','true'),'{finalAssignments}',value::jsonb->'assignments')
     from public.app_state where key='current_session'),false,'');
SQL
)
case "$fin" in *ENDED*) say "the night is ended and filed" "ok";; *) bad "ending the night" "$fin";; esac
say "sessions on record" "$($PSQL -c "select coalesce(jsonb_array_length((select value::jsonb from public.app_state where key='completed_sessions')),0)")"
say "backends still waiting on the league lock" "$($PSQL -c "select count(*) from pg_stat_activity where datname=current_database() and wait_event='advisory'")"
[ "$($PSQL -c "select count(*) from pg_stat_activity where datname=current_database() and wait_event='advisory'")" = 0 ] || fail=1
rm -rf "$work"; psql -X -h "$SOCK" -p "$PORT" -U "$PGU" -d postgres -q -c "drop database $DB" >/dev/null 2>&1
echo "full night: $([ $fail -eq 0 ] && echo PASSED || echo FAILED)"
exit $fail
