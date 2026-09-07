/** Disposable local PostgreSQL checks. Only a private Unix socket, never a remote database. */
import { spawn } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { randomBytes, createHash } from "node:crypto";
import {
  matchdayFixture,
  club,
  sessionId,
  admins,
  players,
  identity,
  fixtureId,
} from "./matchday-fixture.ts";
import { encryptBackup, decryptBackup } from "./backup-envelope.ts";
const bin = process.env.LOCAL_PG_BIN ?? "/opt/homebrew/opt/postgresql@17/bin";
const root = mkdtempSync("/tmp/maplewood-pg-"),
  data = join(root, "data"),
  socket = join(root, "socket");
mkdirSync(socket, { mode: 0o700 });
const env = {
  ...Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("PG")),
  ),
  PGHOST: socket,
  PGPORT: "55432",
  PGUSER: "rehearsal",
  PGDATABASE: "rehearsal",
};
function run(
  command: string,
  args: string[],
  input?: string | Buffer,
  allowFailure = false,
): Promise<{ code: number; out: Buffer; err: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(join(bin, command), args, {
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const out: Buffer[] = [],
      err: Buffer[] = [];
    child.stdout.on("data", (b) => out.push(b));
    child.stderr.on("data", (b) => err.push(b));
    child.on("error", reject);
    child.on("close", (code) => {
      const r = {
        code: code ?? 1,
        out: Buffer.concat(out),
        err: Buffer.concat(err).toString(),
      };
      if (r.code && !allowFailure)
        reject(new Error(command + " failed: " + r.err));
      else resolve(r);
    });
    child.stdin.end(input);
  });
}
const sql = (q: string, database = "rehearsal", allowFailure = false) =>
  run(
    "psql",
    ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-d", database],
    q,
    allowFailure,
  );
const scalar = async (q: string, database = "rehearsal") =>
  (await sql(q, database)).out.toString().trim();
function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
const report: Record<string, unknown> = {
  remoteDatabaseUsed: false,
  syntheticOnly: true,
  independentConnections: true,
};
let started = false;
try {
  await run("initdb", [
    "-D",
    data,
    "-U",
    "rehearsal",
    "--auth-local=trust",
    "--auth-host=reject",
    "--no-locale",
    "-E",
    "UTF8",
  ]);
  await run("pg_ctl", [
    "-D",
    data,
    "-l",
    join(root, "server.log"),
    "-o",
    `-c listen_addresses='' -k ${socket} -p 55432`,
    "-w",
    "start",
  ]);
  started = true;
  await run("createdb", ["rehearsal"]);
  await run("createdb", ["restored"]);
  await sql(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;grant usage on schema auth to authenticated;grant execute on all functions in schema auth to authenticated;`,
  );
  for (const f of readdirSync("migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await sql(readFileSync("migrations/" + f, "utf8"));
  await sql("begin;" + matchdayFixture() + "commit;");
  const m = JSON.parse(
    await scalar(
      `select row_to_json(m) from (select id,score_a,score_b from club_app.matches order by id limit 1)m`,
    ),
  ) as { id: string; score_a: number; score_b: number };
  const first = sql(
    `begin;set application_name='maplewood-race-a';select id from club_app.sessions where id='${sessionId}' for update;select pg_sleep(2);set local role authenticated;${identity(admins[0])}select club_app.correct_score('${club}','${m.id}',${m.score_b},${m.score_a},1,'Concurrent first correction');commit;`,
    "rehearsal",
    true,
  );
  let barrier = false;
  for (let i = 0; i < 60; i++) {
    if (
      (await scalar(
        "select count(*) from pg_stat_activity where application_name='maplewood-race-a' and wait_event='PgSleep'",
      )) === "1"
    ) {
      barrier = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 25));
  }
  check(barrier, "Score race barrier failed");
  const second = sql(
    `begin;set local role authenticated;${identity(admins[1])}select club_app.correct_score('${club}','${m.id}',21,0,1,'Concurrent stale correction');commit;`,
    "rehearsal",
    true,
  );
  const scores = await Promise.all([first, second]);
  check(
    scores[0].code === 0 &&
      scores[1].code !== 0 &&
      scores[1].err.includes("Revision conflict"),
    "Score race failed",
  );
  report.scoreRace = "one success, one stale conflict";
  await sql(
    `begin;set local role authenticated;${identity(admins[0])}select club_app.correct_score('${club}','${m.id}',${m.score_a},${m.score_b},2,'Restore original synthetic score');commit;`,
  );
  const spareSession = fixtureId(3, 9),
    spareSeason = fixtureId(2, 9);
  await sql(
    `insert into club_app.seasons(id,club_id,name,regular_capacity,rules) values('${spareSeason}','${club}','Concurrent spare test',1,'{"operationsEnabled":true}');insert into club_app.sessions(id,club_id,season_id,venue_id,starts_at,ends_at,rsvp_deadline,capacity) values('${spareSession}','${club}','${spareSeason}','${fixtureId(4)}',now()+interval '5 days',now()+interval '5 days 2 hours',now()+interval '2 days',1);update club_app.memberships set kind='spare' where club_id='${club}' and user_id in ('${players[23]}','${players[24]}');insert into club_app.registrations(club_id,season_id,user_id,status) values('${club}','${spareSeason}','${players[23]}','approved'),('${club}','${spareSeason}','${players[24]}','approved');`,
  );
  for (const user of players.slice(23))
    await sql(
      `begin;set local role authenticated;${identity(user, "aal1")}select club_app.request_spare('${club}','${spareSession}','Synthetic payment reference',0);commit;`,
    );
  await Promise.all(
    players
      .slice(23)
      .map((user, i) =>
        sql(
          `begin;set local role authenticated;${identity(admins[i])}select club_app.verify_spare('${club}','${spareSession}','${user}',1,'Synthetic bank receipt checked');commit;`,
        ),
      ),
  );
  check(
    (await scalar(
      `select string_agg(status,',' order by status) from club_app.spare_requests where session_id='${spareSession}'`,
    )) === "confirmed,reconciliation",
    "Last place oversubscribed",
  );
  report.spareRace = "one confirmed, one payment reconciliation";
  await sql(
    `insert into club_app.notification_deliveries(club_id,user_id,idempotency_key,template,payload) select '${club}','${players[0]}','concurrent-email-'||n,'synthetic','{}' from generate_series(1,100)n;`,
  );
  const batches = await Promise.all(
    Array.from({ length: 6 }, () =>
      sql(
        "set role service_role;select id from club_app.claim_free_email_batch(20);",
      ),
    ),
  );
  const leased = batches.flatMap((r) =>
    r.out.toString().trim().split("\n").filter(Boolean),
  );
  check(
    leased.length === 90 && new Set(leased).size === 90,
    "Email lease race failed",
  );
  report.emailRace = "90 unique leases across six connections";
  const snapshot = async (database: string) => {
    const tables = JSON.parse(
      await scalar(
        "select json_agg(tablename order by tablename) from pg_tables where schemaname='club_app'",
        database,
      ),
    ) as string[];
    const rows: Record<string, string> = {};
    for (const t of tables)
      rows[t] = await scalar(
        `select md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]')) from club_app.${t} t`,
        database,
      );
    rows.auth = await scalar(
      "select md5(jsonb_agg(to_jsonb(u) order by id)::text) from auth.users u",
      database,
    );
    rows.policies = await scalar(
      "select md5(jsonb_agg(to_jsonb(p) order by tablename,policyname)::text) from pg_policies p where schemaname='club_app'",
      database,
    );
    rows.grants = await scalar(
      "select md5(jsonb_agg(to_jsonb(g)-'table_catalog' order by table_name,grantee,privilege_type)::text) from information_schema.table_privileges g where table_schema='club_app'",
      database,
    );
    rows.functions = await scalar(
      "select md5(jsonb_agg(jsonb_build_array(p.proname,pg_get_function_identity_arguments(p.oid),pg_get_functiondef(p.oid)) order by p.proname,pg_get_function_identity_arguments(p.oid))::text) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='club_app'",
      database,
    );
    return rows;
  };
  const before = await snapshot("rehearsal"),
    began = Date.now(),
    dump = (
      await run("pg_dump", [
        "--format=custom",
        "--no-owner",
        "--dbname=rehearsal",
      ])
    ).out;
  const key = randomBytes(32),
    encrypted = encryptBackup(dump, key);
  check(
    decryptBackup(encrypted, key).equals(dump),
    "Backup verification failed",
  );
  writeFileSync(join(root, "synthetic-backup.encrypted"), encrypted, {
    mode: 0o600,
  });
  writeFileSync(join(root, "synthetic-backup.key"), key, { mode: 0o600 });
  await run(
    "pg_restore",
    ["--exit-on-error", "--no-owner", "--dbname=restored"],
    decryptBackup(encrypted, key),
  );
  const after = await snapshot("restored");
  check(
    JSON.stringify(before) === JSON.stringify(after),
    "Restored checks differ: " +
      Object.keys(before)
        .filter((k) => before[k] !== after[k])
        .join(","),
  );
  const denied = await sql(
    "set role anon;select * from club_app.members;",
    "restored",
    true,
  );
  check(
    denied.code !== 0 && denied.err.includes("permission denied"),
    "Restored private access failed",
  );
  report.restore = {
    milliseconds: Date.now() - began,
    tableHashesCompared: Object.keys(before).length,
    privateReadDenied: true,
    encryptedBytes: encrypted.length,
    archiveSha256: createHash("sha256").update(encrypted).digest("hex"),
  };
  report.matchday = { players: 25, games: 80 };
  report.result = "PASS";
  report.artifactDirectory = root;
  writeFileSync(join(root, "report.json"), JSON.stringify(report, null, 2), {
    mode: 0o600,
  });
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (started) await run("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"]);
}
