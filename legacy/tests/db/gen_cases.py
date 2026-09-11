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
       "insert into public.announcements(content) values('db fixture notice');",
       f"insert into public.rsvps(session_number,player_id,response) values(25,{ID('P1')},'coming'),(25,{ID('P2')},'coming');",
       f"insert into public.reminder_log(session_number,player_id,kind) values(1,{ID('P2')},'vote');"]
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
          "vlog": "public.rsvp_log", "undo": "public.undo_journal", "dates": "public.season_dates",
          "state_member": "public.app_state where (key not like 'snapshot\\_%' and key not in ('admin_pin','pin','invite_code')) or key like 'archive\\_%'"}
TOTALS = "select " + ", ".join(f"set_config('dbt.{k}',(select count(*) from {v})::text,true)" for k, v in COUNTS.items()) + ";"

# ── 1. who can read, add, change, remove and empty each table ────────────────────────────────────────────────────────
TABLES = ["players", "players_public", "announcements", "app_state", "rsvps", "questions", "invitations", "app_admins", "audit_log",
          "payments", "payments_archive", "push_subscriptions", "reminder_log", "rsvp_log", "undo_journal", "season_dates"]
TOT = {"players": "players", "players_public": "players", "announcements": "ann", "app_state": "state", "rsvps": "rsvps", "questions": "q",
       "invitations": "inv", "app_admins": "admins", "audit_log": "audit", "payments": "pay", "payments_archive": "parch",
       "push_subscriptions": "push", "reminder_log": "rlog", "rsvp_log": "vlog", "undo_journal": "undo", "season_dates": "dates"}
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
    ("an announcement", "announcements", "insert into public.announcements(content) values('x')", {"ORG2"}),
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
]
for label, t, stmt, rule in INSERTS:
    for who in CALLERS:
        e = can_write("insert", t, who, rule)
        case(f"add {label} as {who}", who, err(stmt, e[1]) if e[0] == "err" else affected(stmt, e[1]), TOTALS)
UPDATES = [
    ("another player", "players", f"update public.players set admin_note=admin_note where id={ID('P2')}", lambda w: 1 if w == "ORG2" else 0),
    ("own player row", "players", "update public.players set season_wins=99 where id=public.my_player_id()", lambda w: 0),
    ("announcements", "announcements", "update public.announcements set content=content", ADMIN_ALL["announcements"]),
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
                                                      "rsvp_log", "undo_journal", "season_dates", "push_subscriptions", "reminder_log"]]
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
    # expected outcome, checked in the order the rules state them
    if ver != 5: want = "Stale state"
    elif p_cycle != cy: want = "round is over"
    elif completed: want = "scores are locked"
    elif not 1 <= p_court <= 6: want = "Invalid court"
    elif who != "ORG2" and not (who == "P1" and "P1" in on): want = "Only players on this court"
    elif len(on) < 2: want = "needs at least two players"
    elif key_c != p_court or key_cy != p_cycle: want = "is not on this court/round"
    elif g > (5 if len(on) == 5 else 3): want = "is not one of them"
    elif sA == sB or max(sA, sB) != T or min(sA, sB) < 0: want = "must finish at"
    elif w != ("A" if sA > sB else "B"): want = "Winner flag"
    elif not (len(ids) == need and a1 and b1 and len(set(ids)) == need and all(x in on for x in ids)): want = "different players from Court"
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
    if variant == "bad-kind": case(f"payment {k + 1} kind cash refused", who, err(f"perform public.record_payment({ID(target)},'cash',400)", "check constraint")); continue
    if variant == "negative": case(f"payment {k + 1} negative amount refused", who, err(f"perform public.record_payment({ID(target)},'season',-5)", "check constraint")); continue
    if variant == "unknown": case(f"payment {k + 1} unknown player refused", who, err("perform public.record_payment(99999999,'season',400)", "Unknown player")); continue
    ledger = [(R.choice(["season", "adjustment", "spare", "refund"]), R.choice([14, 20, 100, 200, 300, 400])) for _ in range(R.randint(1, 4))]
    is_paid = lambda L: any(kd == "spare" for kd, _ in L) if spare else sum(a for kd, a in L if kd in ("season", "adjustment")) >= 400
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
    call = f"public.register_me('{name}','{phone}','{emer}','{med}','sig','{mem}','{pay}')"
    if who == "UNC": want = "Verified sign-in email required"
    elif who == "STR": want = "Registration is closed"
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
                 f" if vn <> {rank} or vb is distinct from {str(rank <= declined).lower()} or vm <> {open_seats} then raise exception '{p}: rank %, confirmed %, open %', vn, vb, vm; end if;")
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
UNDO_SETUP = ("delete from public.undo_journal; insert into public.app_state(key,value,version) values('current_session','{\"number\":1,\"cycle\":1}',1) "
              "on conflict(key) do update set value=excluded.value,version=1;")
for k in range(30):
    variant = ["undo-change", "undo-change", "undo-change", "skip-unchanged", "nothing", "after-season", "player"][k % 7]
    setup = UNDO_SETUP
    if variant == "player": case(f"undo {k + 1} refused for a player", "P1", err("perform public.checkpoint('x')", "Organizer verification required"), setup); continue
    if variant == "nothing": case(f"undo {k + 1} with nothing saved", "ORG2", err("perform public.undo_last()", "Nothing to undo"), setup); continue
    body = f" perform public.checkpoint('step {k}');"
    if variant in ("undo-change", "after-season"):
        body += " select version into vn from public.app_state where key='current_session'; perform public.set_state('current_session','{\"number\":1,\"cycle\":2}',vn::int);"
    if variant == "after-season":
        body += err("perform public.undo_last()", "new season")
        setup += " insert into public.audit_log(action,subject,created_at) values('season.started','x',now()+interval '1 hour');"
    elif variant == "skip-unchanged":
        body += f" select public.undo_last() into vj; if vj->>'skipped' is distinct from 'step {k}' then raise exception 'not skipped: %', vj; end if;"
    else:
        body += (f" select public.undo_last() into vj; if vj->>'undone' is distinct from 'step {k}' then raise exception 'undo said %', vj; end if;"
                 " select value into vt from public.app_state where key='current_session'; if vt::jsonb->>'cycle' <> '1' then raise exception 'not restored: %', vt; end if;")
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

(HERE / "cases.sql").write_text("\n".join(cases) + "\n")
print(f"{len(cases)} database cases written to {HERE / 'cases.sql'}")
