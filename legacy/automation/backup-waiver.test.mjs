// The daily backup and the restore helper after the September 2026 release (L18–L21). The waiver wording, every
// acceptance record and the environment marker are backed up. A database the release has not reached yet (production,
// until it is migrated) is still backed up in full, with those tables noted as not there yet. A restore only ever adds
// missing waiver records and never rewrites one. No test reaches a database: fetch is replaced, and a real address is
// refused under `node --test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

process.env.SUPABASE_URL = "http://127.0.0.1:9";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
const { exportAll } = await import("./export-backup.mjs");
const NEW = ["waiver_versions", "waiver_acceptances", "environment"];
/** A stand-in database: `missing` tables answer as PostgREST does for a table it does not have; `failing` ones fail. */
function database(missing = [], failing = {}) {
  const asked = [];
  globalThis.fetch = async (url) => {
    const t = new URL(url).pathname.split("/").pop(); asked.push(t);
    if (failing[t]) return new Response(failing[t], { status: 500 });
    if (missing.includes(t)) return new Response(JSON.stringify({ code: "PGRST205", message: `Could not find the table 'public.${t}' in the schema cache` }), { status: 404 });
    return new Response(JSON.stringify(t === "environment" ? [{ id: true, name: "production", schema_version: "L21" }] : []), { status: 200 });
  };
  return asked;
}

test("backup · includes the waiver wording, every acceptance record and the environment marker", async () => {
  const asked = database(), out = await exportAll();
  for (const t of NEW) { assert.ok(asked.includes(t), t); assert.ok(t in out.tables, t); }
  assert.deepEqual(out.tables.environment, [{ id: true, name: "production", schema_version: "L21" }]);
  assert.deepEqual(out.absent, []);
});
test("backup · a database from before the release is still backed up in full, with the new tables noted as not there yet", async () => {
  database(NEW); const out = await exportAll();
  assert.deepEqual([...out.absent].sort(), [...NEW].sort());
  for (const t of ["players", "app_state", "announcements", "payments", "rsvps", "past_players", "app_admins"]) assert.ok(t in out.tables, t);
  for (const t of NEW) assert.ok(!(t in out.tables), t);
});
test("backup · a missing league table still fails the backup", async () => {
  database(["players"]);
  await assert.rejects(exportAll(), /players: 404/);
});
test("backup · a server error on a new table still fails the backup (only 'not there yet' is tolerated)", async () => {
  database([], { waiver_acceptances: "boom" });
  await assert.rejects(exportAll(), /waiver_acceptances: 500 boom/);
});
test("backup · refuses a real Supabase project when run under node --test", () => {
  const url = pathToFileURL(fileURLToPath(new URL("./export-backup.mjs", import.meta.url))).href;
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", `await import(${JSON.stringify(url)})`], { env: { ...process.env, NODE_TEST_CONTEXT: "child", SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co" }, encoding: "utf8" });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /Refusing: automated tests must not reach a real Supabase project/);
});
test("reminders · refuse a real Supabase project when run under node --test", async () => {
  const { run } = await import("./remind.mjs");
  await assert.rejects(run({ SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "k", SITE_URL: "https://example.invalid/", GMAIL_USER: "league@example.invalid", NODE_TEST_CONTEXT: "child" }, { log: () => {} }),
    /Refusing: automated tests must not reach a real Supabase project/);
});

// ── Restore ──────────────────────────────────────────────────────────────────────────────────────────────────────────
const dir = mkdtempSync(join(tmpdir(), "restore-waiver-"));
const file = join(dir, "backup.json");
writeFileSync(file, JSON.stringify({ exported_at: "2026-09-16T11:30:00Z", tables: {
  waiver_acceptances: [{ id: 4, player_id: 7, email: "a@example.invalid", participant_name: "Ann O'Hara", typed_signature: "Ann O'Hara", waiver_version: "2026-09-v1", waiver_sha256: "ab", action: "registration" }],
  waiver_versions: [{ version: "2026-09-v1", title: "Waiver", body: "text", sha256: "ab", is_current: true }],
  environment: [{ id: true, name: "production", schema_version: "L21" }],
  players: [{ id: 7, name: "Ann O'Hara" }],
} }));
const restore = (t) => execFileSync(process.execPath, [fileURLToPath(new URL("./restore-backup.mjs", import.meta.url)), file, t], { encoding: "utf8" });
for (const [t, key] of [["waiver_acceptances", "id"], ["waiver_versions", "version"], ["environment", "id"]])
  test(`restore · ${t}: adds missing rows, never rewrites one, and keeps its guards on`, () => {
    const sql = restore(t);
    assert.match(sql, new RegExp(`on conflict\\(${key}\\) do nothing;`));
    assert.doesNotMatch(sql, /do update/);
    assert.doesNotMatch(sql, /disable trigger/);
  });
test("restore · the environment marker (a true/false id) gets no id-counter reset", () => {
  const sql = restore("environment");
  assert.doesNotMatch(sql, /setval|overriding system value/);
});
test("restore · acceptance records keep their ids and the id counter follows them", () => {
  const sql = restore("waiver_acceptances");
  assert.match(sql, /overriding system value/); assert.match(sql, /setval\(pg_get_serial_sequence\('public\.waiver_acceptances','id'\)/);
  assert.match(sql, /'Ann O''Hara'/);
});
test("restore · an ordinary table still updates existing rows and pauses the league's triggers", () => {
  const sql = restore("players");
  assert.match(sql, /do update set name=excluded\.name/); assert.match(sql, /disable trigger user/);
});
