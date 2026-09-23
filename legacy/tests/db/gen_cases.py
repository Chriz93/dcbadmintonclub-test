#!/usr/bin/env python3
"""Database tests for the league's Supabase rules (legacy/migrations L01–L15), run on the local rehearsal database.

Writes fixtures.sql (the people and records the cases use) and cases.sql (the cases). Each case runs in its own
transaction that is rolled back, so no case affects another. A case prints NOTICE "PASS <name>" or fails with
"FAIL [<name>] <why>". Expected results are written here from the rules the migrations describe, never read back from
the database. Run everything with legacy/tests/db/run.sh."""
import json, pathlib, random

R = random.Random(20260911)
HERE = pathlib.Path(__file__).parent
cases = []

# ── people ───────────────────────────────────────────────────────────────────────────────────────────────────────────
def uid(n): return f"b0000000-0000-0000-0000-{n:012d}"
ACCOUNTS = {"ORG": (uid(1), "db.organizer@example.invalid", True), "P1": (uid(2), "db.p1@example.invalid", True),
            "P2": (uid(3), "db.p2@example.invalid", True), "S1": (uid(4), "db.s1@example.invalid", True),
            "STR": (uid(5), "db.stranger@example.invalid", True), "INV": (uid(6), "db.invited@example.invalid", True),
            "UNC": (uid(7), "db.unconfirmed@example.invalid", False)}
# Who a case signs in as: the organizer without (ORG1) and with (ORG2) the second factor, two regulars, a spare, a
# signed-in stranger with no player record, an invited newcomer, an unconfirmed email, anonymous, and the service role.
LOGIN = {"ORG1": ("ORG", "aal1"), "ORG2": ("ORG", "aal2"), "P1": ("P1", "aal1"), "P2": ("P2", "aal1"), "S1": ("S1", "aal1"),
         "STR": ("STR", "aal1"), "INV": ("INV", "aal1"), "UNC": ("UNC", "aal1")}
REGS = ["P1", "P2", "R3", "R4", "R5", "R6", "R7", "R8"]
SPARES = ["S1", "S2", "S3", "S4", "S5"]
NAME = {"P1": "Dee Bee One", "P2": "Dee Bee Two", "S1": "Dee Bee Spare"}
def ID(k): return f"(select id from dbt.ids where name='{k}')"

def player(key, mtype, court, approved=True, waitlisted=False, account=None):
    name = NAME.get(key, f"Dee Bee {key}")
    email = ACCOUNTS[account][1] if account else f"db.{key.lower()}@example.invalid"
    user = f"'{ACCOUNTS[account][0]}'" if account else "null"
    return (" insert into public.players(name,email,phone,emergency,medical,sig,waiver_signed,paid,current_court,highest_court,season_wins,"
            "season_losses,games_played,no_show_count,membership_type,approved,waitlisted,registered_at,user_id) values("
            f"'{name}','{email}','613-555-0100','Kin 613','','{name}',true,false,{court},{court},0,0,0,0,'{mtype}',"
            f"{str(approved).lower()},{str(waitlisted).lower()},now(),{user}) returning id into i; insert into dbt.ids values('{key}',i);")

fx = ["create schema if not exists dbt;", "create table if not exists dbt.ids(name text primary key,id bigint);",
      "grant usage on schema dbt to anon,authenticated,service_role; grant select on dbt.ids to anon,authenticated,service_role;",
      "-- dbt.n(query): rows the database owner sees, so a case can check rows its own caller is not allowed to see.",
      "create or replace function dbt.n(q text) returns bigint language plpgsql security definer as $$ declare r bigint; begin execute 'select count(*) from ('||q||') x' into r; return r; end $$;",
      "grant execute on function dbt.n(text) to anon,authenticated,service_role;",
      "insert into auth.users(id,email,email_confirmed_at) values " + ",".join(f"('{u}','{e}',{'now()' if ok else 'null'})" for u, e, ok in ACCOUNTS.values()) + ";",
      f"insert into public.app_admins(user_id,label) values('{ACCOUNTS['ORG'][0]}','db organizer');",
      f"insert into public.invitations(email,membership_type) values('{ACCOUNTS['INV'][1]}','regular');",
      "do $f$ declare i bigint; begin"]
fx += [player("P1", "regular", 1, account="P1"), player("P2", "regular", 1, account="P2")]
fx += [player(f"R{n}", "regular", 1 + (n - 1) // 4) for n in range(3, 9)]
fx += [player("S1", "spare", 0, account="S1")] + [player(f"S{n}", "spare", 0) for n in range(2, 6)]
fx += [player("W1", "regular", 0, waitlisted=True), player("U1", "regular", 0, approved=False), player("U2", "spare", 0, approved=False)]
fx += ["end $f$;",
       f"insert into public.payments(player_id,kind,amount) values({ID('P1')},'season',400),({ID('S1')},'spare',20);",
       f"insert into public.push_subscriptions(player_id,endpoint,p256dh,auth) values({ID('P1')},'https://push.example.invalid/p1','k','a');",
       f"insert into public.questions(player_id,asker,question) values({ID('P1')},'Dee Bee One','Is there parking?');",
       "insert into public.announcements(type,title,body) values('info','db fixture','notice');",
       f"insert into public.rsvps(session_number,player_id,response) values(25,{ID('P1')},'coming'),(25,{ID('P2')},'coming');",
       f"insert into public.reminder_log(session_number,player_id,kind) values(1,{ID('P2')},'vote');",
       "insert into public.past_players(id,season_label,name,email,phone) values(700001,'2025-26','Old Timer','old.timer@example.invalid','613-555-0199');",
       # L20: P1 and P2 accepted the current waiver when they registered (written directly by the owner, as the record would be).
       *[f"insert into public.waiver_acceptances(player_id,user_id,email,participant_name,typed_signature,waiver_version,waiver_sha256,action,registration_ref) select {ID(k)},'{ACCOUNTS[k][0]}','{ACCOUNTS[k][1]}','{NAME[k]}','{NAME[k]}',version,sha256,'registration','REG-fixture' from public.waiver_versions where is_current;" for k in ("P1", "P2")]]
(HERE / "fixtures.sql").write_text("\n".join(fx) + "\n")

# ── how a case is written ────────────────────────────────────────────────────────────────────────────────────────────
def case(name, who, body, setup=""):
    assert "'" not in name and "%" not in name, name
    if who in ("anon", "SVC"):
        sub, claims, role = "", ('{"role":"service_role"}' if who == "SVC" else "{}"), ("service_role" if who == "SVC" else "anon")
    else:
        acct, aal = LOGIN[who]
        sub, role = ACCOUNTS[acct][0], "authenticated"
        claims = json.dumps({"sub": sub, "email": ACCOUNTS[acct][1], "role": "authenticated", "aal": aal})
    cases.append("begin;\n" + (setup + "\n" if setup else "") +
                 f"select set_config('request.jwt.claim.sub','{sub}',true), set_config('request.jwt.claims','{claims}',true);\n"
                 f"set local role {role};\n"
                 f"do $c$ declare vn bigint; vm bigint; vt text; vj jsonb; vb boolean; begin\n{body}\n raise notice 'PASS {name}';\n"
                 f"exception when others then raise exception 'FAIL [{name}] %', sqlerrm;\nend $c$;\nrollback;")

def err(stmt, pat):   # the statement must fail with a message containing pat
    assert "'" not in pat and "%" not in pat
    return (f" begin {stmt}; raise exception 'NO ERROR (wanted: {pat})'; exception when others then"
            f" if sqlerrm like 'NO ERROR%' or sqlerrm not ilike '%{pat}%' then raise exception 'wanted an error like [{pat}], got: %', sqlerrm; end if; end;")
def rows(query, expected):
    return f" select count(*) into vn from ({query}) q; if vn <> ({expected}) then raise exception 'saw % rows, expected %', vn, ({expected}); end if;"
def affected(stmt, expected):
    return f" {stmt}; get diagnostics vn = row_count; if vn <> ({expected}) then raise exception 'changed % rows, expected %', vn, ({expected}); end if;"
def total(k): return f"current_setting('dbt.{k}')::bigint"   # counted by the database owner before the case signs in
COUNTS = {"players": "public.players", "ann": "public.announcements", "state": "public.app_state", "rsvps": "public.rsvps",
          "q": "public.questions", "inv": "public.invitations", "admins": "public.app_admins", "audit": "public.audit_log",
          "pay": "public.payments", "parch": "public.payments_archive", "push": "public.push_subscriptions", "rlog": "public.reminder_log",
          "vlog": "public.rsvp_log", "undo": "public.undo_journal", "dates": "public.season_dates", "past": "public.past_players", "wa": "public.waiver_acceptances",
          "state_member": "public.app_state where (key not like 'snapshot\\_%' and key not in ('admin_pin','pin','invite_code')) or key like 'archive\\_%'"}
TOTALS = "select " + ", ".join(f"set_config('dbt.{k}',(select count(*) from {v})::text,true)" for k, v in COUNTS.items()) + ";"

# ── 1. who can read, add, change, remove and empty each table ────────────────────────────────────────────────────────
TABLES = ["players", "players_public", "announcements", "app_state", "rsvps", "questions", "invitations", "app_admins", "audit_log",
          "payments", "payments_archive", "push_subscriptions", "reminder_log", "rsvp_log", "undo_journal", "season_dates", "past_players"]
TOT = {"players": "players", "players_public": "players", "announcements": "ann", "app_state": "state", "rsvps": "rsvps", "questions": "q",
       "invitations": "inv", "app_admins": "admins", "audit_log": "audit", "payments": "pay", "payments_archive": "parch",
       "push_subscriptions": "push", "reminder_log": "rlog", "rsvp_log": "vlog", "undo_journal": "undo", "season_dates": "dates", "past_players": "past"}
AUTH_WRITE = {"players", "announcements", "questions", "invitations"}   # signed-in users may try; row rules decide
SVC = {"select": set(TABLES) - {"players_public"}, "insert": {"app_state", "reminder_log"}, "update": {"app_state"},
       "delete": {"reminder_log", "push_subscriptions"}}
CALLERS = ["anon", "P1", "S1", "STR", "ORG1", "ORG2", "SVC"]
DENY, RLS = ("err", "permission denied"), ("err", "row-level security")

def can_read(t, who):
    if who == "anon": return DENY
    if who == "SVC": return ("n", total(TOT[t])) if t in SVC["select"] else DENY
    own = who in ("P1", "S1")
    if t in ("players_public", "announcements", "rsvps", "questions", "season_dates"): n = total(TOT[t])
    elif t == "push_subscriptions": n = 1 if who == "P1" else 0             # your own only, even for the organizer
    elif who == "ORG2": n = total(TOT[t])
    elif t == "players": n = 1 if own else 0
    elif t == "app_state": n = total("state_member")
    elif t == "app_admins": n = 1 if who == "ORG1" else 0
    elif t == "payments": n = 1 if own else 0
    else: n = 0
    return ("n", n)
for t in TABLES:
    for who in CALLERS:
        e = can_read(t, who)
        case(f"read {t} as {who}", who, err(f"perform count(*) from public.{t}", e[1]) if e[0] == "err" else rows(f"select 1 from public.{t}", e[1]), TOTALS)

def can_write(op, t, who, rule):
    if who == "anon": return DENY
    if who == "SVC": return ("n", 1 if op == "insert" else total(TOT[t])) if t in SVC[op] else DENY
    if t not in AUTH_WRITE: return DENY
    if op == "insert": return ("n", 1) if who in rule else RLS
    return ("n", rule(who))
ADMIN_ALL = {t: (lambda k: (lambda w: total(k) if w == "ORG2" else 0))(TOT[t]) for t in TABLES}
INSERTS = [
    ("a player", "players", "insert into public.players(name,email) values('Zed Insert','zed@example.invalid')", {"ORG2"}),
    ("an announcement", "announcements", "insert into public.announcements(type,title,body) values('info','x','x')", {"ORG2"}),
    ("own question", "questions", "insert into public.questions(player_id,asker,question) values(public.my_player_id(),'me','Where do we park?')", {"P1", "S1"}),
    ("question as someone else", "questions", f"insert into public.questions(player_id,asker,question) values({ID('P2')},'me','q?')", set()),
    ("an invitation", "invitations", "insert into public.invitations(email) values('new.one@example.invalid')", {"ORG2"}),
    ("own vote directly", "rsvps", "insert into public.rsvps(session_number,player_id,response) values(26,public.my_player_id(),'coming')", set()),
    ("vote for someone else directly", "rsvps", f"insert into public.rsvps(session_number,player_id,response) values(26,{ID('P2')},'coming')", set()),
    ("a payment", "payments", f"insert into public.payments(player_id,kind,amount) values({ID('P2')},'season',400)", set()),
    ("an archived payment", "payments_archive", "insert into public.payments_archive(id,season_label,kind,amount) values(999999,'x','season',1)", set()),
    ("a state key", "app_state", "insert into public.app_state(key,value) values('dbt_direct','1')", set()),
    ("an audit entry", "audit_log", "insert into public.audit_log(action) values('forged')", set()),
    ("an organizer", "app_admins", f"insert into public.app_admins(user_id) values('{ACCOUNTS['STR'][0]}')", set()),
    ("a push endpoint", "push_subscriptions", f"insert into public.push_subscriptions(player_id,endpoint,p256dh,auth) values({ID('P2')},'https://x.invalid/z','k','a')", set()),
    ("a reminder claim", "reminder_log", f"insert into public.reminder_log(session_number,player_id,kind) values(1,{ID('P2')},'forged')", set()),
    ("a vote-log entry", "rsvp_log", f"insert into public.rsvp_log(session_number,player_id,new_response) values(1,{ID('P2')},'coming')", set()),
    ("an undo step", "undo_journal", "insert into public.undo_journal(label,snapshot) values('forged','{}')", set()),
    ("a session date", "season_dates", "insert into public.season_dates values(99,'2027-06-01',now())", set()),
    ("a past player", "past_players", "insert into public.past_players(id,season_label,name) values(999999,'x','x')", set()),
]
for label, t, stmt, rule in INSERTS:
    for who in CALLERS:
        e = can_write("insert", t, who, rule)
        case(f"add {label} as {who}", who, err(stmt, e[1]) if e[0] == "err" else affected(stmt, e[1]), TOTALS)
UPDATES = [
    ("another player", "players", f"update public.players set admin_note=admin_note where id={ID('P2')}", lambda w: 1 if w == "ORG2" else 0),
    ("own player row", "players", "update public.players set season_wins=99 where id=public.my_player_id()", lambda w: 0),
    ("announcements", "announcements", "update public.announcements set title=title", ADMIN_ALL["announcements"]),
    ("questions", "questions", "update public.questions set answer='yes'", ADMIN_ALL["questions"]),
    ("invitations", "invitations", "update public.invitations set note=note", ADMIN_ALL["invitations"]),
    ("own vote directly", "rsvps", "update public.rsvps set response='notcoming' where session_number=25 and player_id=public.my_player_id()", None),
    ("another vote directly", "rsvps", f"update public.rsvps set response='notcoming' where session_number=25 and player_id={ID('P2')}", None),
    ("app_state", "app_state", "update public.app_state set value=value", None),
    ("payments", "payments", "update public.payments set amount=0", None),
    ("payments_archive", "payments_archive", "update public.payments_archive set amount=0", None),
    ("audit_log", "audit_log", "update public.audit_log set subject=subject", None),
    ("app_admins", "app_admins", "update public.app_admins set label=label", None),
    ("season_dates", "season_dates", "update public.season_dates set start_at=start_at", None),
    ("undo_journal", "undo_journal", "update public.undo_journal set label=label", None),
    ("reminder_log", "reminder_log", "update public.reminder_log set kind=kind", None),
    ("push_subscriptions", "push_subscriptions", "update public.push_subscriptions set auth=auth", None),
    ("rsvp_log", "rsvp_log", "update public.rsvp_log set new_response=new_response", None),
    ("past_players", "past_players", "update public.past_players set name=name", None),
]
for label, t, stmt, rule in UPDATES:
    for who in CALLERS:
        e = can_write("update", t, who, rule)
        case(f"change {label} as {who}", who, err(stmt, e[1]) if e[0] == "err" else affected(stmt, e[1]), TOTALS)
DELETES = [
    ("a player", "players", f"delete from public.players where id={ID('R8')}", lambda w: 1 if w == "ORG2" else 0),
    ("announcements", "announcements", "delete from public.announcements", ADMIN_ALL["announcements"]),
    ("questions", "questions", "delete from public.questions", ADMIN_ALL["questions"]),
    ("invitations", "invitations", "delete from public.invitations", ADMIN_ALL["invitations"]),
] + [(t, t, f"delete from public.{t}", None) for t in ["rsvps", "payments", "payments_archive", "app_state", "audit_log", "app_admins",
                                                      "rsvp_log", "undo_journal", "season_dates", "push_subscriptions", "reminder_log", "past_players"]]
for label, t, stmt, rule in DELETES:
    for who in CALLERS:
        e = can_write("delete", t, who, rule)
        case(f"remove {label} as {who}", who, err(stmt, e[1]) if e[0] == "err" else affected(stmt, e[1]), TOTALS)
for t in [x for x in TABLES if x != "players_public"]:   # TRUNCATE ignores row rules, so nobody may have it
    for who in ["anon", "P1", "ORG2", "SVC"]:
        case(f"empty {t} as {who}", who, err(f"truncate public.{t} cascade", "permission denied"))
for col in ["email", "phone", "emergency", "medical", "sig", "admin_note", "user_id", "declared_payment"]:
    case(f"public roster hides {col}", "P1", err(f"perform {col} from public.players_public", "does not exist"))

# ── 2. voting: only your own answer, closed Sunday 10 PM (46 hours before play) for regulars ─────────────────────────
for who in ["P1", "S1", "STR", "ORG1", "ORG2"]:
    for target in ["P1", "P2", "S1"]:
        for off in [100, 47, 46.25, 45.75, 10, -1]:
            for resp in ["coming", "notcoming", "bogus"]:
                s = R.randint(3, 24)
                admin, me = who == "ORG2", who if who in ("P1", "S1") else None
                if not admin and target != me: want = "only answer for yourself"
                elif resp == "bogus": want = "Invalid response"
                elif not admin and target in REGS and off < 46: want = "Voting closed"
                else: want = None
                call = f"perform public.set_rsvp({s},{ID(target)},'{resp}')"
                body = err(call, want) if want else (call + f"; select response into vt from public.rsvps where session_number={s} and player_id={ID(target)};"
                                                      f" if vt is distinct from '{resp}' then raise exception 'answer saved as %', vt; end if;")
                case(f"vote {who} for {target} {off}h before session {s} {resp}", who, body,
                     f"update public.season_dates set start_at=now()+interval '{off} hours' where session_number={s};")

# ── 3. saving scores ─────────────────────────────────────────────────────────────────────────────────────────────────
def combos(ids):   # who plays each game on a court of this size (the app's rotation)
    A, B, C, D, E = (ids + [None] * 5)[:5]
    if len(ids) == 5: return [(B, E, C, D), (C, A, D, E), (D, B, E, A), (E, C, A, B), (A, D, B, C)]
    if len(ids) == 4: return [(A, B, C, D), (A, C, B, D), (A, D, B, C)]
    if len(ids) == 3: return [(A, None, B, None), (A, None, C, None), (B, None, C, None)]
    return [(A, None, B, None)] * 3
VARIANTS = ["valid"] * 6 + ["tie", "over", "under", "flag", "key-court", "key-cycle", "g-high", "offcourt", "dup", "count", "stale", "cycle", "completed", "court7", "lonely"]
for k in range(260):
    n, c = R.choice([2, 3, 4, 4, 4, 5, 5]), R.randint(1, 6)
    with_p1 = R.random() < 0.6
    court_ids = (["P1"] if with_p1 else []) + R.sample([x for x in REGS if x != "P1"], n - (1 if with_p1 else 0))
    R.shuffle(court_ids)
    others, oc = [x for x in REGS if x not in court_ids], c % 6 + 1
    assign = {str(i): [] for i in range(1, 7)}
    assign[str(c)], assign[str(oc)] = court_ids, others[:4]
    who = R.choice(["P1", "P1", "P1", "ORG2", "STR", "S1", "ORG1"])
    cy, T, games = R.choice([1, 2]), 15 if n == 5 else 21, 5 if n == 5 else 3
    g = R.randint(1, games)
    a1, a2, b1, b2 = combos(court_ids)[g - 1]
    lo = R.randint(0, T - 2)
    sA, sB = (T, lo) if R.random() < 0.5 else (lo, T)
    variant = R.choice(VARIANTS)
    key_c, key_cy, p_court, p_cycle, completed, ver = c, cy, c, cy, False, 5
    if variant == "tie": sA = sB = R.choice([T, lo])
    if variant == "over": sA, sB = T + R.randint(1, 5), lo
    if variant == "under": sA, sB = T - 1, lo if lo < T - 1 else 0
    w = "A" if sA > sB else "B"
    if variant == "flag": w = "B" if w == "A" else "A"
    if variant == "key-court": key_c = oc
    if variant == "key-cycle": key_cy = 3 - cy
    if variant == "g-high": g = games + 1 if games < 5 else 5
    if variant == "offcourt": a1 = others[0]
    if variant == "dup": a2, b1 = (a1, b1) if a2 is not None else (b1, a1)
    if variant == "count": a2, b2 = (None, None) if n >= 4 else (court_ids[0], court_ids[-1])
    if variant == "stale": ver = 4
    if variant == "cycle": p_cycle = 3 - cy
    if variant == "completed": completed = True
    if variant == "court7": p_court = 7
    if variant == "lonely": assign[str(c)] = court_ids[:1]
    session = json.dumps({"number": 1, "cycle": cy, "completed": completed, "scores": {}, "movements": [],
                          "assignments": {kk: [f"@{x}" for x in v] for kk, v in assign.items()}})
    for x in REGS: session = session.replace(f'"@{x}"', f"'||{ID(x)}||'")
    setup = f"insert into public.app_state(key,value,version) values('current_session','{session}',5) on conflict(key) do update set value=excluded.value,version=5;"
    ref = lambda x: ID(x) if x else "null"
    score = f"jsonb_build_object('c{key_c}_y{key_cy}_g{g}',jsonb_build_object('a1',{ref(a1)},'a2',{ref(a2)},'b1',{ref(b1)},'b2',{ref(b2)},'sA',{sA},'sB',{sB},'w','{w}'))"
    on = assign[str(c)]
    ids = [x for x in (a1, a2, b1, b2) if x is not None]
    need = 4 if len(on) >= 4 else 2
    # expected outcome, checked in the order the rules state them.
    # L27: the league-wide version is NOT a conflict for a score save. Two courts finishing together must both save,
    # so a stale `ver` alone no longer refuses; the same night, the same round, the same line-up and an unfinished
    # session still do. The "stale" variant therefore falls through to whatever the other rules say.
    if p_cycle != cy: want = "Stale state"
    elif not 1 <= p_court <= 6: want = "Invalid court"
    elif completed: want = "scores are locked"
    elif who != "ORG2" and not (who == "P1" and "P1" in on): want = "Only players on this court"
    elif len(on) < 2: want = "Court needs two to five players"
    elif key_c != p_court or key_cy != p_cycle: want = "is not on this court and round"
    elif g > (5 if len(on) == 5 else 3): want = "Invalid game number"
    elif (a1,a2,b1,b2)!=combos(on)[g-1]: want = "scheduled pairing"
    elif sA == sB or max(sA, sB) != T or min(sA, sB) < 0: want = "must finish at"
    elif w != ("A" if sA > sB else "B"): want = "Winner flag"
    elif not (len(ids) == need and a1 and b1 and len(set(ids)) == need and all(x in on for x in ids)): want = "scheduled pairing"
    else: want = None
    call = f"perform public.save_court_scores({p_court},{p_cycle},{score},{ver})"
    body = err(call, want) if want else (call + "; select version into vn from public.app_state where key='current_session'; if vn <> 6 then raise exception 'version %', vn; end if;"
                                          f" select value::jsonb->'scores' ? 'c{key_c}_y{key_cy}_g{g}' into vb from public.app_state where key='current_session'; if not vb then raise exception 'game not stored'; end if;")
    case(f"scores {k + 1} {variant} on court {c} of {n} by {who}", who, body, setup)

# ── 4. payments drive the paid flag ──────────────────────────────────────────────────────────────────────────────────
for k in range(100):
    target, who = R.choice(["P2", "R3", "S2", "S3"]), R.choice(["ORG2"] * 7 + ["P1", "ORG1", "STR"])
    spare, variant = target.startswith("S"), R.choice(["ledger"] * 6 + ["bad-kind", "negative", "unknown"])
    if who != "ORG2":
        case(f"payment {k + 1} refused for {who}", who, err(f"perform public.record_payment({ID(target)},'season',400)", "Organizer verification required")); continue
    if variant == "bad-kind": case(f"payment {k + 1} kind cash refused", who, err(f"perform public.record_payment({ID(target)},'cash',400)", "positive amount")); continue
    if variant == "negative": case(f"payment {k + 1} negative amount refused", who, err(f"perform public.record_payment({ID(target)},'season',-5)", "positive amount")); continue
    if variant == "unknown": case(f"payment {k + 1} unknown player refused", who, err("perform public.record_payment(99999999,'season',400)", "Unknown player")); continue
    ledger = [(R.choice(["season", "adjustment", "spare", "refund"]), R.choice([14, 20, 100, 200, 300, 400])) for _ in range(R.randint(1, 4))]
    is_paid = lambda L: sum(a for kd,a in L if kd=="spare")>=20 if spare else sum(a for kd, a in L if kd in ("season", "adjustment")) >= 400
    body = "".join(f" perform public.record_payment({ID(target)},'{kd}',{a});" for kd, a in ledger)
    body += f" select paid into vb from public.players where id={ID(target)}; if vb is distinct from {str(is_paid(ledger)).lower()} then raise exception 'paid is %', vb; end if;"
    if R.random() < 0.4:   # remove the first payment again
        body += (f" perform public.delete_payment((select min(id) from public.payments where player_id={ID(target)}));"
                 f" select paid into vb from public.players where id={ID(target)}; if vb is distinct from {str(is_paid(ledger[1:])).lower()} then raise exception 'after removal paid is %', vb; end if;")
    case(f"payment {k + 1} ledger of {len(ledger)} for a {'spare' if spare else 'regular'}", who, body,
         f"delete from public.payments where player_id={ID(target)}; update public.players set paid=false where id={ID(target)};")

# ── 5. registration ──────────────────────────────────────────────────────────────────────────────────────────────────
NAMES = [("A", False), ("Al", True), ("x" * 80, True), ("x" * 81, False), ("  Bo Bee  ", True), ("", False)]
for k in range(110):
    who = R.choice(["INV", "INV", "INV", "STR", "P1", "ORG1", "ORG2", "UNC"])
    (name, name_ok), phone, emer, med = R.choice(NAMES), "1" * R.choice([10, 40, 41]), "e" * R.choice([5, 200, 201]), "m" * R.choice([0, 500, 501])
    pay, mem = R.choice(["paid_full", "will_pay", "per_session", "bogus"]), R.choice(["regular", "spare"])
    # L20: every registration accepts the current waiver wording (its version and the digest of the text on screen).
    call = (f"public.register_me('{name}','{phone}','{emer}','{med}','sig','{mem}','{pay}',(select version from public.waiver_versions where is_current),"
            f"(select sha256 from public.waiver_versions where is_current),'Signed {k + 1}','America/Toronto',-240)")
    if who == "UNC": want = "Verified sign-in email required"
    elif not (name_ok and len(phone) <= 40 and len(emer) <= 200 and len(med) <= 500): want = "Invalid registration details"
    else: want = None
    if want: body = err(f"perform {call}", want)
    else:
        mtype = "regular" if who in ("INV", "P1") else mem   # an invitation (or the existing record) decides the membership
        body = (f" select {call} into vn;"
                f" if (select name from public.players where id=vn) <> trim('{name}') then raise exception 'name stored wrong'; end if;"
                f" if (select membership_type from public.players where id=vn) <> '{mtype}' then raise exception 'membership stored wrong'; end if;"
                f" if (select declared_payment from public.players where id=vn) <> '{pay if pay != 'bogus' else ''}' then raise exception 'declared payment stored wrong'; end if;"
                f" if (select registered_at from public.players where id=vn) is null then raise exception 'not dated'; end if;"
                + (f" if vn <> {ID('P1')} then raise exception 'an existing player got a second record'; end if;" if who == "P1" else ""))
    case(f"register {k + 1} {who} name {len(name)} phone {len(phone)} emergency {len(emer)} medical {len(med)} {pay}", who, body)

# ── 6. shared state writes carry a version ───────────────────────────────────────────────────────────────────────────
for k in range(60):
    who, key, v = R.choice(["ORG2"] * 6 + ["P1", "ORG1"]), f"dbt_key_{k}", R.randint(1, 5)
    variant = R.choice(["new-ok", "new-stale", "same", "stale", "null", "retired", "empty", "long", "delete"])
    setup = "" if variant.startswith("new") else f"insert into public.app_state(key,value,version) values('{key}','\"x\"',{v}) on conflict(key) do update set version={v};"
    if who != "ORG2":
        case(f"state {k + 1} write refused for {who}", who, err(f"perform public.set_state('{key}','1',{v})", "Organizer verification required"), setup); continue
    body = {"new-ok": f" select public.set_state('{key}','1',0) into vn; if vn <> 1 then raise exception 'version %', vn; end if;",
            "new-stale": err(f"perform public.set_state('{key}','1',3)", "Stale state"),
            "same": f" select public.set_state('{key}','2',{v}) into vn; if vn <> {v + 1} then raise exception 'version %', vn; end if;",
            "stale": err(f"perform public.set_state('{key}','2',{v - 1})", "Stale state"),
            "null": err(f"perform public.set_state('{key}','2',null)", "Stale state"),
            "retired": err("perform public.set_state('admin_pin','1',0)", "Retired key"),
            "empty": err("perform public.set_state('','1',0)", "Invalid state write"),
            "long": err(f"perform public.set_state('{'k' * 121}','1',0)", "Invalid state write"),
            "delete": f" perform public.delete_state('{key}');" + rows(f"select 1 from public.app_state where key='{key}'", 0)}[variant]
    case(f"state {k + 1} {variant}", who, body, setup)

# ── 7. spare seats and the reminder list ─────────────────────────────────────────────────────────────────────────────
for k in range(45):
    answers = {p: R.choice(["coming", "notcoming", "notcoming"]) for p in REGS + ["W1", "U1"] if R.random() < 0.7}
    answers.update({p: R.choice(["coming", "coming", "notcoming"]) for p in SPARES + ["U2"] if R.random() < 0.7})
    order = list(answers); R.shuffle(order)
    setup = "delete from public.rsvps where session_number=28;" + "".join(
        f" insert into public.rsvps(session_number,player_id,response,updated_at) values(28,{ID(p)},'{answers[p]}',now()+interval '{i} minutes');" for i, p in enumerate(order))
    declined = sum(1 for p in REGS if answers.get(p) == "notcoming")        # a waitlisted or unapproved regular opens no seat
    claims = [p for p in order if p in SPARES and answers[p] == "coming"]   # an unapproved spare never claims
    open_seats = max(declined - len(claims), 0)
    body = rows("select 1 from public.spare_seats(28)", len(claims))
    for rank, p in enumerate(claims, 1):
        body += (f" select rank, confirmed, open_seats into vn, vb, vm from public.spare_seats(28) where player_id={ID(p)};"
                 f" if vn <> {rank} or vb is distinct from false or vm <> {open_seats} then raise exception '{p}: rank %, confirmed %, open %', vn, vb, vm; end if;")
    case(f"spare seats {k + 1} with {declined} declined and {len(claims)} spares available", "P1", body, setup)
    if k < 25:
        mute = R.sample(REGS + SPARES, 2)
        body2 = ""
        for p in REGS + SPARES + ["W1", "U1", "U2"]:
            expect = p not in answers and p not in mute and p not in ("W1", "U1", "U2") and (p in REGS or open_seats > 0)
            body2 += f" select exists(select 1 from public.reminder_targets(28) where player_id={ID(p)}) into vb; if vb is distinct from {str(expect).lower()} then raise exception '{p} on the list: %', vb; end if;"
        case(f"reminder list {k + 1} with {open_seats} open seats", "SVC", body2, setup + "".join(f" update public.players set email_reminders=false where id={ID(p)};" for p in mute))
        case(f"reminder list {k + 1} hidden from players", "P1", err("perform count(*) from public.reminder_targets(28)", "permission denied"), setup)

# ── 8. statistics are rebuilt from the stored scores ─────────────────────────────────────────────────────────────────
def sj(sc): return "{" + ",".join(f'"{key}":{{"a1":\'||{ID(v[0][0])}||\',"a2":\'||{ID(v[0][1])}||\',"b1":\'||{ID(v[0][2])}||\',"b2":\'||{ID(v[0][3])}||\',"w":"{v[1]}"}}' for key, v in sc.items()) + "}"
for k in range(40):
    tally = {p: [0, 0, 0] for p in REGS}
    def game(four, w):
        for p in four: tally[p][2] += 1
        if w in ("A", "B"):
            win, lose = (four[:2], four[2:]) if w == "A" else (four[2:], four[:2])
            for p in win: tally[p][0] += 1
            for p in lose: tally[p][1] += 1
    done = []
    for s in range(R.randint(0, 3)):
        sc = {}
        for gi in range(R.randint(1, 6)):
            four, w = R.sample(REGS, 4), R.choice(["A", "B", "A", "B", "T"])   # T: a legacy tie counts as played only
            sc[f"c1_y{1 + gi % 2}_g{1 + gi % 3}_{gi}"] = (four, w); game(four, w)
        done.append(sc)
    rotated, cur = R.choice([[], [1], [1, 2]]), {}
    for gi in range(R.randint(0, 5)):
        cur[f"c2_y{R.choice([1, 2])}_g{1 + gi % 3}"] = (R.sample(REGS, 4), R.choice(["A", "B"]))
    for key, (four, w) in cur.items():   # the live night counts only rounds that have rotated
        if int(key.split("_y")[1][0]) in rotated: game(four, w)
    sessions = "[" + ",".join(f'{{"number":{i + 1},"scores":{sj(sc)}}}' for i, sc in enumerate(done)) + "]"
    live = f'{{"number":{len(done) + 1},"cycle":2,"scores":{sj(cur)},"movements":[' + ",".join(f'{{"cycle":{c}}}' for c in rotated) + "]}"
    setup = (f"insert into public.app_state(key,value,version) values('completed_sessions','{sessions}',1) on conflict(key) do update set value=excluded.value;"
             f" insert into public.app_state(key,value,version) values('current_session','{live}',1) on conflict(key) do update set value=excluded.value;")
    body = " perform public.rebuild_player_stats();"
    for p, (w, l, g) in tally.items():
        body += (f" select season_wins, season_losses, to_jsonb(games_played) into vn, vm, vj from public.players where id={ID(p)};"
                 f" if vn <> {w} or vm <> {l} or vj <> '{g}'::jsonb then raise exception '{p}: %W %L % games, expected {w}W {l}L {g}', vn, vm, vj; end if;")
    case(f"statistics rebuild {k + 1} over {len(done)} finished nights and {len(rotated)} rotated rounds", "ORG2", body, setup)
case("statistics rebuild refused for a player", "P1", err("perform public.rebuild_player_stats()", "Organizer verification required"))

# ── 9. undo ──────────────────────────────────────────────────────────────────────────────────────────────────────────
UNDO_SETUP = ("delete from public.undo_journal; insert into public.app_state(key,value,version) values('current_session','{\"id\":\"dbt\",\"number\":1,\"cycle\":1,\"assignments\":{},\"scores\":{},\"note\":\"original\"}',1) "
              "on conflict(key) do update set value=excluded.value,version=1;")
for k in range(30):
    variant = ["undo-change", "undo-change", "undo-change", "skip-unchanged", "nothing", "after-season", "player"][k % 7]
    setup = UNDO_SETUP
    if variant == "player": case(f"undo {k + 1} refused for a player", "P1", err("perform public.checkpoint('x')", "Organizer verification required"), setup); continue
    if variant == "nothing": case(f"undo {k + 1} with nothing saved", "ORG2", err("perform public.undo_last()", "Nothing to undo"), setup); continue
    body = f" perform public.checkpoint('step {k}');"
    if variant in ("undo-change", "after-season"):
        body += " select version into vn from public.app_state where key='current_session'; perform public.set_state('current_session','{\"id\":\"dbt\",\"number\":1,\"cycle\":1,\"assignments\":{},\"scores\":{},\"note\":\"changed\"}',vn::int);"
    if variant == "after-season":
        body += err("perform public.undo_last()", "new season")
        setup += " insert into public.audit_log(action,subject,created_at) values('season.started','x',now()+interval '1 hour');"
    elif variant == "skip-unchanged":
        body += f" select public.undo_last() into vj; if vj->>'skipped' is distinct from 'step {k}' then raise exception 'not skipped: %', vj; end if;"
    else:
        body += (f" select public.undo_last() into vj; if vj->>'undone' is distinct from 'step {k}' then raise exception 'undo said %', vj; end if;"
                 " select value into vt from public.app_state where key='current_session'; if vt::jsonb->>'note' <> 'original' then raise exception 'not restored: %', vt; end if;")
    case(f"undo {k + 1} {variant}", "ORG2", body, setup)
case("undo checkpoint tidy-up refused for a player", "P1", err("perform public.checkpoint_settle(1)", "Organizer verification required"))

# ── 10. season rollover closes last season's ledger and reminder log (L15) ───────────────────────────────────────────
for k in range(20):
    target, last, now_paid = R.choice(["P2", "R3", "R4"]), R.choice([0, 200, 400]), R.choice([0, 200, 400])
    setup = ("delete from public.app_state where key='current_session';"
             + (f" insert into public.payments(player_id,kind,amount) values({ID(target)},'season',{last});" if last else "")
             + f" insert into public.reminder_log(session_number,player_id,kind) values({k % 28 + 1},{ID(target)},'spare') on conflict do nothing; " + TOTALS)
    body = (f" select public.start_new_season('rollover-{k + 1}') into vj;"
            f" if (vj->>'payments_archived')::bigint <> {total('pay')} then raise exception 'archived %', vj; end if;"
            + rows("select 1 from public.payments", 0) + rows(f"select 1 from public.payments_archive where season_label='rollover-{k + 1}'", total("pay"))
            + rows("select 1 from public.reminder_log", 0) + rows("select 1 from public.rsvps", 0)
            + (f" perform public.record_payment({ID(target)},'season',{now_paid});" if now_paid else "")
            + f" select paid into vb from public.players where id={ID(target)}; if vb is distinct from {str(now_paid >= 400).lower()} then raise exception 'paid is % with {last} last season and {now_paid} this season', vb; end if;")
    case(f"rollover {k + 1} with {last} paid last season and {now_paid} this season", "ORG2", body, setup)
for label, ok in [("ab", False), ("abc", True), ("x" * 40, True), ("x" * 41, False), ("  2031-32  ", True)]:
    body = (f" select public.start_new_season('{label}') into vj; if vj->>'archived' <> trim('{label}') then raise exception 'archived %', vj; end if;"
            + rows("select 1 from public.players where approved or registered_at is not null or season_wins<>0 or paid", 0)) if ok else err(f"perform public.start_new_season('{label}')", "Unique archive label required")
    case(f"new season label of {len(label)} characters", "ORG2", body, "delete from public.app_state where key='current_session';")
case("new season refused during a session", "ORG2", err("perform public.start_new_season('2031-32')", "active session"),
     "insert into public.app_state(key,value) values('current_session','{}') on conflict(key) do nothing;")
case("new season label used twice", "ORG2", " perform public.start_new_season('twice-1');" + err("perform public.start_new_season('twice-1')", "Unique archive label required"),
     "delete from public.app_state where key='current_session';")
for who in ["P1", "ORG1"]: case(f"new season refused for {who}", who, err("perform public.start_new_season('abc')", "Organizer verification required"))

# ── 11. questions carry the asker's real name (L15) ──────────────────────────────────────────────────────────────────
for k, fake in enumerate(["Dee Bee Two", "The Organizer", "Anonymous", "x" * 200, "", "Dee Bee Spare", "admin", "Christy", "?", "Dee Bee One"]):
    who = "P1" if k % 2 == 0 else "S1"
    case(f"question {k + 1} shows the real asker", who,
         f" insert into public.questions(player_id,asker,question) values(public.my_player_id(),'{fake}','Question {k + 1}?') returning asker into vt;"
         f" if vt <> '{NAME[who]}' then raise exception 'shown as %', vt; end if;")

# ── 12. everything else a signed-in person can call ──────────────────────────────────────────────────────────────────
for who in ["P1", "STR", "ORG1"]: case(f"instant email refused for {who}", who, err("perform public.dispatch_reminder_job('x')", "Organizer verification required"))
case("instant email refused for anon", "anon", err("perform public.dispatch_reminder_job('x')", "permission denied"))
for who in ["ORG2", "SVC"]:   # allowed; the rehearsal has no Vault, so it explains instead of sending
    case(f"instant email for {who} reports why nothing was sent", who, " select public.dispatch_reminder_job('x') into vj; if (vj->>'dispatched')::boolean or vj->>'reason' is null then raise exception 'got %', vj; end if;")
for ph, em, md, ok in [("1" * 40, "e", "m", True), ("1" * 41, "e", "m", False), ("1", "e" * 200, "m", True), ("1", "e" * 201, "m", False), ("1", "e", "m" * 500, True), ("1", "e", "m" * 501, False)]:
    body = (f" perform public.update_my_profile('{ph}','{em}','{md}'); if (select phone from public.players where id=public.my_player_id()) <> '{ph}' then raise exception 'phone not saved'; end if;"
            if ok else err(f"perform public.update_my_profile('{ph}','{em}','{md}')", "Invalid details"))
    case(f"profile phone {len(ph)} emergency {len(em)} medical {len(md)}", "P1", body)
case("profile refused without a player record", "STR", err("perform public.update_my_profile('1','e','m')", "No player record"))
for ep, ok in [("https://push.example.invalid/new", True), ("http://push.example.invalid/new", False), ("ftp://x", False)]:
    body = (f" perform public.save_push_subscription('{ep}','k','a');" + rows(f"select 1 from public.push_subscriptions where endpoint='{ep}'", 1)
            if ok else err(f"perform public.save_push_subscription('{ep}','k','a')", "Invalid subscription"))
    case(f"push endpoint {ep.split(':')[0]}", "P1", body)
case("push refused without a player record", "STR", err("perform public.save_push_subscription('https://x.invalid/a','k','a')", "No player record"))
case("push removal only touches your own", "S1", " perform public.delete_push_subscription('https://push.example.invalid/p1');"
     " if dbt.n('select 1 from public.push_subscriptions where endpoint=''https://push.example.invalid/p1''') <> 1 then raise exception 'removed another players endpoint'; end if;")
for on in [True, False]:
    case(f"email reminders {'on' if on else 'off'}", "P1", f" perform public.set_email_reminders({str(on).lower()});"
         f" if (select email_reminders from public.players where id=public.my_player_id()) is distinct from {str(on).lower()} then raise exception 'not saved'; end if;")
case("email reminders refused without a player record", "STR", err("perform public.set_email_reminders(false)", "No player record"))
for who, org, ver in [("ORG2", True, True), ("ORG1", True, False), ("P1", False, False), ("STR", False, False)]:
    case(f"admin status for {who}", who, f" select public.admin_status() into vj; if (vj->>'organizer')::boolean <> {str(org).lower()} or (vj->>'verified')::boolean <> {str(ver).lower()} then raise exception 'status %', vj; end if;")
case("admin status hidden from anon", "anon", err("perform public.admin_status()", "permission denied"))
for fn in ["capture_state()", "refresh_paid_flag(1)", "log_rsvp_change()", "prune_undo_journal()", "set_question_asker()"]:
    for who in ["P1", "ORG2", "SVC"]:
        case(f"internal {fn.split('(')[0]} not callable by {who}", who, err(f"perform public.{fn}", "permission denied"))

# ── 13. waiver wording, acceptance records and the environment marker (L18–L20): who may read and write ─────────────
WRITES_DENIED = [
    ("add a waiver version", "insert into public.waiver_versions(version,title,body) values('2027-01-v9','x','# x')"),
    ("change waiver wording", "update public.waiver_versions set body=body"),
    ("remove a waiver version", "delete from public.waiver_versions"),
    ("add an acceptance directly", "insert into public.waiver_acceptances(email,participant_name,typed_signature,waiver_version,waiver_sha256,action) select 'x','x','x',version,sha256,'registration' from public.waiver_versions limit 1"),
    ("change an acceptance", "update public.waiver_acceptances set typed_signature='forged'"),
    ("remove an acceptance", "delete from public.waiver_acceptances"),
    ("relabel the environment", "update public.environment set name='production'"),
    ("remove the environment marker", "delete from public.environment"),
    ("add an environment marker", "insert into public.environment(name,schema_version) values('test','x')"),
    ("run the TEST-only guard function", "perform public.assert_test_environment()"),
    ("record an acceptance through the internal function", "perform public.record_waiver_acceptance(1,'x','x','x','x','x','x',0,'registration','adult','',false,'')"),
]
for who in CALLERS + ["P2", "INV"]:
    # Anonymous visitors get nothing (the site reads both only after sign-in); everyone signed in, and the jobs, read them.
    case(f"read waiver wording as {who}", who, err("perform count(*) from public.waiver_versions", "permission denied") if who == "anon" else rows("select 1 from public.waiver_versions", 2))
    case(f"read the environment marker as {who}", who, err("perform count(*) from public.environment", "permission denied") if who == "anon" else rows("select 1 from public.environment where name='test'", 1))
    acc = {"anon": None, "SVC": total("wa"), "ORG2": total("wa"), "P1": 1, "P2": 1}.get(who, 0)
    case(f"read waiver acceptances as {who}", who, err("perform count(*) from public.waiver_acceptances", "permission denied") if acc is None else rows("select 1 from public.waiver_acceptances", acc), TOTALS)
    for label, stmt in WRITES_DENIED: case(f"{label} as {who}", who, err(stmt, "permission denied"))
    for t in ["waiver_versions", "waiver_acceptances", "environment"]: case(f"empty {t} as {who}", who, err(f"truncate public.{t} cascade", "permission denied"))

# ── 14. registering records the acceptance of the exact current wording ──────────────────────────────────────────────
WV, WH = "(select version from public.waiver_versions where is_current)", "(select sha256 from public.waiver_versions where is_current)"
V1H = "(select sha256 from public.waiver_versions where version='2026-09-v1')"
def reg(extra): return f"public.register_me('Nia Newcomer','613','EC','','sig','regular','will_pay'{extra})"
INV_EMAIL = ACCOUNTS["INV"][1]
for label, extra, pat in [
    ("no waiver", "", "out of date"), ("an unknown version", f",'1999-01-v1',{WH},'Nia Newcomer'", "out of date"),
    ("an older version", f",'2026-09-v1',{V1H},'Nia Newcomer'", "updated while you were registering"),
    ("a wrong digest", f",{WV},repeat('a',64),'Nia Newcomer'", "does not match"), ("an empty digest", f",{WV},'','Nia Newcomer'", "does not match"),
    ("the digest of other words", f",{WV},encode(sha256(convert_to('other words','UTF8')),'hex'),'Nia Newcomer'", "does not match"),
    ("the digest of the older version", f",{WV},{V1H},'Nia Newcomer'", "does not match"),
    ("a one-letter signature", f",{WV},{WH},'N'", "full name"), ("an 81-letter signature", f",{WV},{WH},repeat('n',81)", "full name"),
    ("a blank signature", f",{WV},{WH},'   '", "full name"),
    ("an unknown age declaration", f",{WV},{WH},'Nia Newcomer','America/Toronto',-240,'child'", "18 or older"),
    ("a guardian without the name of the minor", f",{WV},{WH},'Nia Newcomer','America/Toronto',-240,'guardian',''", "under 18"),
    ("a guardian with a one-letter name for the minor", f",{WV},{WH},'Nia Newcomer','America/Toronto',-240,'guardian','N'", "under 18")]:
    case(f"register refused with {label}", "INV", err(f"perform {reg(extra)}", pat) + rows(f"select 1 from public.players where email='{INV_EMAIL}'", 0) + rows("select 1 from public.waiver_acceptances where participant_name='Nia Newcomer'", 0))
for label, extra, cond in [
    ("an adult giving photo consent", f",{WV},{WH},'Nia Newcomer','America/Toronto',-240,'adult','',true,'agent'", "age_declaration='adult' and media_consent and client_timezone='America/Toronto' and client_utc_offset_minutes=-240 and minor_name='' and user_agent='agent'"),
    ("an adult without photo consent", f",{WV},{WH},'Nia Newcomer','America/Toronto',-240,'adult','',false", "not media_consent"),
    ("a guardian registering a minor", f",{WV},{WH},'Nia Newcomer','America/Toronto',-300,'guardian','Nico Newcomer'", "age_declaration='guardian' and minor_name='Nico Newcomer' and client_utc_offset_minutes=-300"),
    ("the digest in capitals", f",{WV},upper({WH}),'Nia Newcomer'", "waiver_sha256=" + WH),
    ("a device offset out of range (not stored)", f",{WV},{WH},'Nia Newcomer','X',9999", "client_utc_offset_minutes is null"),
    ("a half-hour time zone", f",{WV},{WH},'Nia Newcomer','Asia/Kolkata',330", "client_timezone='Asia/Kolkata' and client_utc_offset_minutes=330"),
    ("a time zone longer than 64 characters (cut)", f",{WV},{WH},'Nia Newcomer',repeat('z',100)", "length(client_timezone)=64"),
    ("a device description longer than 300 characters (cut)", f",{WV},{WH},'Nia Newcomer','',null,'adult','',false,repeat('u',400)", "length(user_agent)=300"),
    ("a name for a minor on an adult declaration (not stored)", f",{WV},{WH},'Nia Newcomer','',null,'adult','Someone'", "minor_name=''"),
    ("a signature with spaces around it (trimmed)", f",{WV},{WH},'  Nia N  '", "typed_signature='Nia N'")]:
    case(f"register records the acceptance: {label}", "INV",
         f" select {reg(extra)} into vm;" + rows(f"select 1 from public.waiver_acceptances where player_id=vm and {cond} and action='registration' and waiver_version={WV} and waiver_sha256={WH}"
                                                 f" and email='{INV_EMAIL}' and user_id='{ACCOUNTS['INV'][0]}' and participant_name='Nia Newcomer' and registration_ref like 'REG-'||vm||'-________T______Z' and accepted_at>now()-interval '1 minute'", 1))
case("a new acceptance by a returning player attaches to their existing record", "P1",
     f" select public.register_me('Dee Bee One','613','EC','','sig','regular','will_pay',{WV},{WH},'Dee Bee One') into vm; if vm<>{ID('P1')} then raise exception 'new record'; end if;" + rows(f"select 1 from public.waiver_acceptances where player_id={ID('P1')}", 2))

# ── 15. accepting an updated version, and publishing one ─────────────────────────────────────────────────────────────
PUB_V1 = "update public.waiver_versions set is_current=false where is_current; update public.waiver_versions set is_current=true where version='2026-09-v1';"
for label, who, stmt, want, setup in [
    ("the version already accepted", "P1", f"perform public.accept_waiver({WV},{WH},'Dee Bee One')", "already accepted", ""),
    ("an older version", "P1", f"perform public.accept_waiver('2026-09-v1',{V1H},'Dee Bee One')", "updated while you were registering", ""),
    ("no player record", "STR", f"perform public.accept_waiver({WV},{WH},'Stranger Person')", "Register first", ""),
    ("a wrong digest", "P2", f"perform public.accept_waiver('2026-09-v1',repeat('b',64),'Dee Bee Two')", "does not match", PUB_V1),
    ("a missing signature", "P2", f"perform public.accept_waiver('2026-09-v1',{V1H},'')", "full name", PUB_V1),
    ("an anonymous visitor", "anon", f"perform public.accept_waiver({WV},{WH},'x')", "permission denied", "")]:
    case(f"accept waiver refused: {label}", who, err(stmt, want), setup)
case("a player accepts the newly published version: a second record, marked as a later acceptance", "P1",
     f" perform public.accept_waiver('2026-09-v1',{V1H},'Dee Bee One','America/Toronto',-240,'adult','',true);" +
     rows(f"select 1 from public.waiver_acceptances where player_id={ID('P1')}", 2) + rows(f"select 1 from public.waiver_acceptances where player_id={ID('P1')} and action='updated-version' and waiver_version='2026-09-v1' and media_consent", 1), PUB_V1)
case("a spare with no earlier record accepts the current version", "S1", f" perform public.accept_waiver({WV},{WH},'Dee Bee Spare');" + rows(f"select 1 from public.waiver_acceptances where player_id={ID('S1')} and action='updated-version'", 1))
case("the organizer publishes a version: exactly one is current", "ORG2", " perform public.publish_waiver_version('2026-09-v1');" + rows("select 1 from public.waiver_versions where is_current and version='2026-09-v1'", 1) + rows("select 1 from public.waiver_versions where is_current", 1))
case("publishing the current version again changes nothing", "ORG2", f" perform public.publish_waiver_version({WV});" + rows("select 1 from public.waiver_versions where is_current", 1))
for who, want in [("ORG1", "Organizer verification required"), ("P1", "Organizer verification required"), ("STR", "Organizer verification required"), ("anon", "permission denied")]:
    case(f"publish a waiver version refused for {who}", who, err("perform public.publish_waiver_version('2026-09-v1')", want))
case("publishing an unknown version is refused", "ORG2", err("perform public.publish_waiver_version('1999-01-v1')", "No waiver version"))

case("my_email is the verified sign-in email, in lower case", "P1", rows(f"select 1 where public.my_email()='{ACCOUNTS['P1'][1]}'", 1))
case("my_email is not available to an anonymous visitor", "anon", err("perform public.my_email()", "permission denied"))

# ── 16. best of three on a court of two (L19) ────────────────────────────────────────────────────────────────────────
def sess(ids): return ("insert into public.app_state(key,value,version) values('current_session','{\"number\":1,\"cycle\":1,\"completed\":false,\"scores\":{},\"assignments\":{\"1\":['||"
                       + "||','||".join(ID(k) for k in ids) + "||']}}',1) on conflict(key) do update set value=excluded.value,version=1;")
def g(n, a, b, sa, sb): return f'"c1_y1_g{n}":{{"a1":\'||{ID(a)}||\',"a2":null,"b1":\'||{ID(b)}||\',"b2":null,"sA":{sa},"sB":{sb},"w":"{"A" if sa > sb else "B"}"}}'
def save(*games): return f"perform public.save_court_scores(1,1,('{{{','.join(games)}}}')::jsonb,null)"
W1, W2, L1_, L2_ = g(1, "P1", "P2", 21, 10), g(2, "P1", "P2", 21, 12), g(1, "P1", "P2", 10, 21), g(2, "P1", "P2", 12, 21)
S2, G3 = g(2, "P1", "P2", 15, 21), g(3, "P1", "P2", 21, 19)
stored = lambda n: f" select count(*) into vn from jsonb_object_keys((select value::jsonb->'scores' from public.app_state where key='current_session')); if vn<>{n} then raise exception '% games stored', vn; end if;"
for who in ["ORG2", "P1"]:
    case(f"best of three ({who}): after a 2–0 there is no Game 3", who, f" {save(W1, W2)};" + err(save(G3), "Best of three"), sess(["P1", "P2"]))
    case(f"best of three ({who}): a 2–0 sent together with a Game 3 is refused", who, err(save(W1, W2, G3), "Best of three") + stored(0), sess(["P1", "P2"]))
    case(f"best of three ({who}): a split court plays Game 3", who, f" {save(W1, S2)}; {save(G3)};" + stored(3), sess(["P1", "P2"]))
    case(f"best of three ({who}): Game 3 saved first is removed when corrected to a 2–0", who, f" {save(G3)}; {save(L1_, L2_)};" + stored(2), sess(["P1", "P2"]))
case("best of three: Game 3 saved first, then a split, is kept", "ORG2", f" {save(G3)}; {save(W1, S2)};" + stored(3), sess(["P1", "P2"]))
case("best of three: a 2–0 alone is two stored games", "ORG2", f" {save(W1, W2)};" + stored(2), sess(["P1", "P2"]))
case("three players still play all three games even when one player wins the first two", "ORG2",
     f" perform public.save_court_scores(1,1,('{{{g(1, 'P1', 'P2', 21, 5)},{g(2, 'P1', 'R3', 21, 6).replace('g2', 'g2')},{g(3, 'P2', 'R3', 21, 7)}}}')::jsonb,null);" + stored(3), sess(["P1", "P2", "R3"]))

# ── 17. accepting an updated waiver: every detail recorded, every refusal, and who may call what (L20) ───────────────────
# P2 accepted the current version (v2) when registering; with v1 made current (PUB_V1) P2 has a new version to accept.
def aw(rest=",'Dee Bee Two'", sha=V1H): return "public.accept_waiver('2026-09-v1'," + sha + rest + ")"
P2_EMAIL, P2_UID = ACCOUNTS["P2"][1], ACCOUNTS["P2"][0]
for label, call, cond in [
    ("an adult giving photo consent", aw(",'Dee Bee Two','America/Toronto',-240,'adult','',true,'agent'"), "age_declaration='adult' and media_consent and client_timezone='America/Toronto' and client_utc_offset_minutes=-240 and minor_name='' and user_agent='agent'"),
    ("an adult without photo consent", aw(",'Dee Bee Two','America/Toronto',-240,'adult','',false"), "media_consent=false"),
    ("no photo choice offered", aw(), "media_consent is null and age_declaration='adult' and client_timezone='' and client_utc_offset_minutes is null and user_agent=''"),
    ("a guardian accepting for a minor", aw(",'Dee Bee Two','America/Toronto',-300,'guardian','Nico Two'"), "age_declaration='guardian' and minor_name='Nico Two' and client_utc_offset_minutes=-300"),
    ("the digest in capitals", aw(sha=f"upper({V1H})"), f"waiver_sha256={V1H}"),
    ("a device offset out of range (not stored)", aw(",'Dee Bee Two','X',9999"), "client_utc_offset_minutes is null and client_timezone='X'"),
    ("a half-hour time zone", aw(",'Dee Bee Two','Asia/Kolkata',330"), "client_timezone='Asia/Kolkata' and client_utc_offset_minutes=330"),
    ("a time zone longer than 64 characters (cut)", aw(",'Dee Bee Two',repeat('z',100)"), "length(client_timezone)=64"),
    ("a device description longer than 300 characters (cut)", aw(",'Dee Bee Two','',null,'adult','',false,repeat('u',400)"), "length(user_agent)=300"),
    ("a name for a minor on an adult declaration (not stored)", aw(",'Dee Bee Two','',null,'adult','Someone'"), "minor_name=''"),
    ("a signature with spaces around it (trimmed)", aw(",'  Dee Two  '"), "typed_signature='Dee Two'"),
    ("the name of the minor with spaces around it (trimmed)", aw(",'Dee Bee Two','',null,'guardian','  Nico Two  '"), "minor_name='Nico Two'")]:
    case(f"accept waiver records {label}", "P2", f" perform {call};" + rows(
        f"select 1 from public.waiver_acceptances where player_id={ID('P2')} and waiver_version='2026-09-v1' and waiver_sha256={V1H} and action='updated-version'"
        f" and email='{P2_EMAIL}' and user_id='{P2_UID}' and participant_name='Dee Bee Two' and registration_ref like 'REG-'||{ID('P2')}||'-________T______Z'"
        f" and accepted_at>now()-interval '1 minute' and {cond}", 1), PUB_V1)
for label, who, stmt, pat, setup in [
    ("an unknown version", "P2", "perform public.accept_waiver('1999-01-v1',repeat('a',64),'Dee Bee Two')", "out of date", PUB_V1),
    ("an empty version", "P2", f"perform public.accept_waiver('',{V1H},'Dee Bee Two')", "out of date", PUB_V1),
    ("an empty digest", "P2", "perform " + aw(sha="''"), "does not match", PUB_V1),
    ("the digest of other words", "P2", "perform " + aw(sha="encode(sha256(convert_to('other words','UTF8')),'hex')"), "does not match", PUB_V1),
    ("the digest of another version", "P2", "perform " + aw(sha="(select sha256 from public.waiver_versions where version='2026-09-v2')"), "does not match", PUB_V1),
    ("a one-letter signature", "P2", "perform " + aw(",'D'"), "full name", PUB_V1),
    ("an 81-letter signature", "P2", "perform " + aw(",repeat('d',81)"), "full name", PUB_V1),
    ("a blank signature", "P2", "perform " + aw(",'   '"), "full name", PUB_V1),
    ("an unknown age declaration", "P2", "perform " + aw(",'Dee Bee Two','',null,'child'"), "18 or older", PUB_V1),
    ("a guardian without the name of the minor", "P2", "perform " + aw(",'Dee Bee Two','',null,'guardian',''"), "under 18", PUB_V1),
    ("a guardian with an 81-letter name for the minor", "P2", "perform " + aw(",'Dee Bee Two','',null,'guardian',repeat('n',81)"), "under 18", PUB_V1),
    ("the organizer, who has no player record", "ORG2", f"perform public.accept_waiver({WV},{WH},'Org Anizer')", "Register first", ""),
    ("an invited person who has not registered", "INV", f"perform public.accept_waiver({WV},{WH},'Nia Newcomer')", "Register first", ""),
    ("an unconfirmed email", "UNC", f"perform public.accept_waiver({WV},{WH},'Un Confirmed')", "Register first", ""),
    ("the service role", "SVC", f"perform public.accept_waiver({WV},{WH},'Serv Ice')", "permission denied", "")]:
    case(f"accept waiver refused: {label}", who, err(stmt, pat) + (rows(f"select 1 from public.waiver_acceptances where player_id={ID('P2')} and waiver_version='2026-09-v1'", 0) if who == "P2" else ""), setup)

def reg16(name, phone="'613'", mem="'regular'", pay="'will_pay'"): return f"public.register_me('{name}',{phone},'EC','','sig',{mem},{pay},{WV},{WH},'{name}')"
case("register as pending (L25, open registration): a signed-in person who was not invited", "STR", f" select {reg16('Stran Ger')} into vn; if (select approved from public.players where id=vn) then raise exception 'an uninvited sign-up was approved'; end if;" + rows("select 1 from public.waiver_acceptances where participant_name='Stran Ger'", 1))
case("register refused: an unconfirmed email", "UNC", err(f"perform {reg16('Un Confirmed')}", "Verified sign-in email required"))
case("register refused: an anonymous visitor", "anon", err(f"perform {reg16('Ann Onymous')}", "permission denied"))
case("register refused: the service role", "SVC", err(f"perform {reg16('Serv Ice')}", "permission denied"))
case("register refused: a phone number over 40 characters, and no acceptance is recorded", "INV",
     err(f"perform {reg16('Nia Newcomer', phone='repeat(chr(54),41)')}", "Invalid registration details") + rows("select 1 from public.waiver_acceptances where participant_name='Nia Newcomer'", 0))
case("the organizer can register without an invitation, and the acceptance is recorded", "ORG1",
     f" select {reg16('Org Anizer')} into vm;" + rows(f"select 1 from public.players where id=vm and email='{ACCOUNTS['ORG'][1]}'", 1) + rows("select 1 from public.waiver_acceptances where player_id=vm and action='registration'", 1))
case("a spare who registers again stays a spare and gets a new acceptance record", "S1",
     f" select {reg16('Dee Bee Spare', pay=chr(39) + 'per_session' + chr(39))} into vm; if vm<>{ID('S1')} then raise exception 'new record'; end if;" +
     rows(f"select 1 from public.players where id={ID('S1')} and membership_type='spare'", 1) + rows(f"select 1 from public.waiver_acceptances where player_id={ID('S1')} and action='registration'", 1))
for who in ["P2", "S1", "INV", "UNC"]:
    case(f"publish a waiver version refused for {who}", who, err("perform public.publish_waiver_version('2026-09-v1')", "Organizer verification required"))
case("publish a waiver version refused for the service role", "SVC", err("perform public.publish_waiver_version('2026-09-v1')", "permission denied"))

# Best of three is only for a court of two: four and five players keep every game.
def gd(n, a1, a2, b1, b2, sa, sb): return f'"c1_y1_g{n}":{{"a1":\'||{ID(a1)}||\',"a2":\'||{ID(a2)}||\',"b1":\'||{ID(b1)}||\',"b2":\'||{ID(b2)}||\',"sA":{sa},"sB":{sb},"w":"{"A" if sa > sb else "B"}"}}'
case("four players: the same pair winning Games 1 and 2 still plays Game 3", "ORG2",
     f" {save(gd(1, 'P1', 'P2', 'R3', 'R4', 21, 10), gd(2, 'P1', 'R3', 'P2', 'R4', 21, 12))}; {save(gd(3, 'P1', 'R4', 'P2', 'R3', 21, 15))};" + stored(3), sess(["P1", "P2", "R3", "R4"]))
case("five players: all five games to 15 are kept", "ORG2",
     f" {save(gd(1, 'P2', 'R5', 'R3', 'R4', 15, 10), gd(2, 'R3', 'P1', 'R4', 'R5', 15, 11), gd(3, 'R4', 'P2', 'R5', 'P1', 15, 12), gd(4, 'R5', 'R3', 'P1', 'P2', 15, 13), gd(5, 'P1', 'R4', 'P2', 'R3', 15, 9))};" + stored(5), sess(["P1", "P2", "R3", "R4", "R5"]))
case("best of three: a 2–0 for the second player, then Game 3, is refused", "ORG2", f" {save(L1_, L2_)};" + err(save(G3), "Best of three") + stored(2), sess(["P1", "P2"]))
case("best of three: Game 2 then Game 1 saved separately make a 2–0, and Game 3 is refused", "ORG2", f" {save(W2)}; {save(W1)};" + err(save(G3), "Best of three") + stored(2), sess(["P1", "P2"]))

# All generated calls exercise the current contract: explicit match identity and unique payment request IDs.
# These adapters add test-fixture metadata only; the refusal/score/ledger expectations above remain independent.
import re
NEXT_CONFIG=json.dumps({"season":"dbt-next-season","registration_start":"2030-09-01","start_time_local":"20:00","end_time_local":"22:00","time_zone":"America/Toronto","regular_capacity":26,"approved_dates":["2030-09-17","2030-09-24"],"cancelled_dates":[],"fees":{"regular_season":400,"spare_session":20,"absence_refund":14,"absence_notice_hours":72,"vote_deadline_hours":46,"spare_ask_hours":72}})
def rewrite_calls(sql, name, convert):
    needle='public.'+name+'(';offset=0
    while True:
        a=sql.find(needle,offset)
        if a<0:return sql
        start=a+len(needle);i=start;depth=0;quoted=False;args=[];last=start
        while i<len(sql):
            ch=sql[i]
            if ch=="'":
                if quoted and i+1<len(sql) and sql[i+1]=="'":i+=2;continue
                quoted=not quoted
            if not quoted:
                if ch=='(':depth+=1
                elif ch==')':
                    if depth==0:args.append(sql[last:i]);break
                    depth-=1
                elif ch==',' and depth==0:args.append(sql[last:i]);last=i+1
            i+=1
        replacement=needle+','.join(convert(args))+')';sql=sql[:a]+replacement+sql[i+1:];offset=a+len(replacement)
def score_args(a):
    if len(a)!=4:return a
    if a[3].strip()=='null':a[3]="(select version from public.app_state where key='current_session')"
    return a+["(select value::jsonb->>'id' from public.app_state where key='current_session')",f"(select coalesce(value::jsonb->'assignments'->({a[0]})::text,'[]'::jsonb) from public.app_state where key='current_session')"]
def payment_args(a):
    if len(a)==3:a+=['1' if a[1].strip() in ("'spare'","'refund'") else 'null','current_date',"''"]
    return a+['gen_random_uuid()'] if len(a)==6 else a
def latest(sql):
    sql=sql.replace('"number":', '"id":"dbt","number":')
    # Session fixtures already explicitly naming an ID retain it (duplicate JSON keys have the same dbt value).
    sql=rewrite_calls(sql,'save_court_scores',score_args)
    sql=rewrite_calls(sql,'record_payment',payment_args)
    return rewrite_calls(sql,'start_new_season',lambda a:a+["'"+NEXT_CONFIG+"'::jsonb"] if len(a)==1 else a)
(HERE / "cases.sql").write_text("\n".join(latest(c) for c in cases) + "\n")
print(f"{len(cases)} database cases written to {HERE / 'cases.sql'}")
