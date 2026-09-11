#!/usr/bin/env python3
"""Turn the season-opener run (legacy/tests/e2e/screens/opener/run.json) into SQL that replaces every player on the
TEST database, so the admin can sign in to the test site and click through the finished Session 1.

    python3 legacy/scripts/load-run-into-test.py > /tmp/load.sql     # then paste into the TEST SQL editor

TEST ONLY. It refuses to emit anything that could reach a real person: every email must end in @example.invalid.
Before deleting anything it copies the current players table into app_state key snapshot_test_players_<date>."""
import json, pathlib, sys, datetime
run = json.loads(pathlib.Path("legacy/tests/e2e/screens/opener/run.json").read_text())
raw = run["raw"]
def lit(v):
    if v is None: return "null"
    if isinstance(v, bool): return "true" if v else "false"
    if isinstance(v, (int, float)): return str(v)
    return "'" + str(v).replace("'", "''") + "'"
players = raw["players"]
for p in players:
    if not str(p["email"]).endswith("@example.invalid"): sys.exit(f"refusing: {p['email']} is not a reserved test address")
stamp = datetime.date.today().strftime("%Y%m%d")
out = [f"-- Season-opener run {run['generated']} loaded into TEST. {len(players)} players, all @example.invalid.",
       "begin;",
       f"delete from public.app_state where key='snapshot_test_players_{stamp}';",
       f"insert into public.app_state(key,value) select 'snapshot_test_players_{stamp}', coalesce(jsonb_agg(to_jsonb(p) order by p.id),'[]'::jsonb)::text from public.players p;",
       "delete from public.undo_journal; delete from public.rsvp_log; delete from public.rsvps; delete from public.payments;",
       "delete from public.push_subscriptions; delete from public.reminder_log; delete from public.questions; delete from public.invitations;",
       "delete from public.players;",
       "delete from public.app_state where key in ('current_session','completed_sessions','round_snapshots','player_approvals','membership_overrides',"
       "'pre_session_attendance','reminder_request','reminder_last_run','vote_digest_last_id');"]
cols = ["id","name","email","phone","emergency","medical","sig","waiver_signed","paid","current_court","highest_court","season_wins",
        "season_losses","games_played","no_show_count","membership_type","approved","waitlisted","registered_at","admin_note","declared_payment","created_at"]
for p in sorted(players, key=lambda x: x["id"]):
    row = {**{c: None for c in cols}, **{c: p.get(c) for c in cols if c in p}}
    row["admin_note"] = row["admin_note"] or ""; row["declared_payment"] = row["declared_payment"] or ""
    out.append(f"insert into public.players({','.join(cols)}) overriding system value values({','.join(lit(row[c]) for c in cols)});")
out.append("select setval(pg_get_serial_sequence('public.players','id'),(select max(id) from public.players));")
for k in ["completed_sessions", "player_approvals", "membership_overrides"]:
    if k in raw["app_state"]: out.append(f"insert into public.app_state(key,value,version) values({lit(k)},{lit(raw['app_state'][k])},1);")
for email, kind in raw["invitations"].items():
    out.append(f"insert into public.invitations(email,membership_type,note) values({lit(email)},{lit(kind)},'season-opener run');")
for r in raw["rsvps"]:
    out.append(f"insert into public.rsvps(session_number,player_id,response,note,updated_at) values({r['session_number']},{r['player_id']},{lit(r['response'])},{lit(r.get('note',''))},{lit(r['updated_at'])});")
for x in raw["payments"]:
    out.append(f"insert into public.payments(player_id,kind,amount,session_number,method,received_on,note) values({x['player_id']},{lit(x['kind'])},{x['amount']},{lit(x.get('session_number'))},{lit(x.get('method','e-transfer'))},{lit(x['received_on'])},{lit(x.get('note',''))});")
out.append("commit;")
# Independent check in real PostgreSQL: statistics recomputed from the stored scores must equal the player rows.
out.append("""with games as (select e.value sc from jsonb_array_elements((select value::jsonb from public.app_state where key='completed_sessions')) s
  cross join lateral jsonb_each(s->'scores') e),
 sides as (select (x#>>'{}')::bigint pid,(sc->>'w')='A' won from games cross join lateral jsonb_array_elements(jsonb_build_array(sc->'a1',sc->'a2')) x where jsonb_typeof(x)='number'
  union all select (x#>>'{}')::bigint,(sc->>'w')='B' from games cross join lateral jsonb_array_elements(jsonb_build_array(sc->'b1',sc->'b2')) x where jsonb_typeof(x)='number'),
 t as (select pid,count(*) g,count(*) filter(where won) w from sides group by pid)
select (select count(*) from public.players) as players,
       (select count(*) from public.players p left join t on t.pid=p.id where coalesce(t.g,0)<>p.games_played or coalesce(t.w,0)<>p.season_wins or coalesce(t.g,0)-coalesce(t.w,0)<>p.season_losses) as stat_mismatches,
       (select count(*) from games) as games_stored,
       (select count(*) from public.rsvps) as votes,
       (select count(*) from public.players where email not like '%@example.invalid') as real_addresses;""")
print("\n".join(out))
