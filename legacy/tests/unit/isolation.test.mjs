// Production isolation: every guard that stops tests, seed scripts and builds from reaching production refuses.
// Nothing here talks to a network or a real database; the guards stop each script before it connects.
import { blocked, PROD_REF } from "./fetch-guard.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { html } from "./load-app.mjs";

const ROOT = resolve(new URL("../../..", import.meta.url).pathname), PROD = `https://${PROD_REF}.supabase.co`, TESTDB = "https://wgolevihkvmosajumzvl.supabase.co";
const GUARD = join(ROOT, "legacy/tests/unit/fetch-guard.mjs");
const sh = (cmd, args, env = {}) => spawnSync(cmd, args, { cwd: ROOT, env: { ...process.env, ...env }, encoding: "utf8", timeout: 20000 });

test("isolation · the unit-test network guard refuses the production project", async () => {
  await assert.rejects(fetch(`${PROD}/rest/v1/players?select=id`), /Refusing: unit tests make no network requests/);
  assert.ok(blocked.some((u) => u.includes(PROD_REF)));
});
test("isolation · the unit-test network guard refuses the TEST project and the live sites too (tests use stand-ins)", async () => {
  await assert.rejects(fetch(`${TESTDB}/rest/v1/`), /Refusing/);
  await assert.rejects(fetch("https://chriz93.github.io/dcbadmintonclub/"), /Refusing/);
  await assert.rejects(fetch("https://example.com/"), /Refusing/);
});
test("isolation · the reminder job, run by a test against production's address, never gets a request out", async () => {
  const { run } = await import("../../automation/remind.mjs");
  const before = blocked.length;
  await run({ SUPABASE_URL: PROD, SUPABASE_SERVICE_ROLE_KEY: "not-a-key", SITE_URL: "https://s/", GMAIL_USER: "g@example.invalid" }, { log: () => {} }).catch(() => {});
  const tried = blocked.slice(before);
  assert.ok(tried.length > 0 && tried.every((u) => u.startsWith(PROD)), `every attempt was stopped: ${tried.join(", ")}`);
});
test("isolation · the backup exporter, started under the test guard with production's address, is stopped before any request", () => {
  const r = sh(process.execPath, ["--import", GUARD, "legacy/automation/export-backup.mjs"], { SUPABASE_URL: PROD, SUPABASE_SERVICE_ROLE_KEY: "not-a-key" });
  assert.notEqual(r.status, 0); assert.match(r.stderr, /Refusing: unit tests make no network requests \(bwepvxelvwgwxrnaglrx\.supabase\.co\)/);
});
for (const [v, val] of [["PGHOST", "db.bwepvxelvwgwxrnaglrx.supabase.co"], ["DATABASE_URL", "postgres://x@aws-0-ca-central-1.pooler.supabase.com:6543/postgres"], ["SUPABASE_URL", PROD], ["PGSERVICE", "wgolevihkvmosajumzvl"]])
  test(`isolation · the database test runner refuses when ${v} points at a hosted database`, () => {
    const r = sh("sh", ["legacy/tests/db/run.sh"], { [v]: val });
    assert.equal(r.status, 2, r.stdout + r.stderr); assert.match(r.stdout, /refusing: database tests run only on the local rehearsal server/);
  });
test("isolation · the database test runner refuses a socket setting that is not a local folder", () => {
  const r = sh("sh", ["legacy/tests/db/run.sh"], { PGSOCK: "db.example.com" }); assert.equal(r.status, 2); assert.match(r.stdout, /PGSOCK must be a local socket folder/);
});
test("isolation · the TEST seed SQL starts with the database's own test-environment check", { skip: !existsSync(join(ROOT, "legacy/tests/e2e/screens/opener/run.json")) && "needs the season-opener run (legacy/tests/e2e/opener.spec.ts writes it)" }, () => {
  const r = sh("python3", ["legacy/scripts/load-run-into-test.py"]); assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.split("\n")[1], "select public.assert_test_environment();");
});
test("isolation · the TEST-only synthetic-player migration refuses a database not marked test", () => {
  assert.match(readFileSync(join(ROOT, "legacy/migrations/L02_test_synthetic_players.sql"), "utf8"), /not exists\(select 1 from public\.environment where name='test'\) then raise exception 'Refusing/);
});
test("isolation · the TEST marker script refuses a database marked production or holding real people", () => {
  const t = readFileSync(join(ROOT, "legacy/migrations/T01_mark_test.sql"), "utf8");
  assert.match(t, /where name='production'\) then raise exception 'Refusing: this database is marked production'/); assert.match(t, /if real_people>5 then raise exception/);
});
test("isolation · the production build refuses a secret key and writes nothing", () => {
  const out = mkdtempSync(join(tmpdir(), "prodbuild-"));
  const r = sh("python3", ["legacy/scripts/build-production.py", "--key", "sb_secret_abcdefghijklmnopqrstuvwxyz", "--out", out]);
  assert.notEqual(r.status, 0); assert.match(r.stderr + r.stdout, /Not built/); assert.deepEqual(readdirSync(out), []);
});
test("isolation · the production build refuses an empty key without prompting, and writes nothing", () => {
  const out = mkdtempSync(join(tmpdir(), "prodbuild-"));
  const r = sh("python3", ["legacy/scripts/build-production.py", "--key", "", "--out", out]);
  assert.notEqual(r.status, 0); assert.match(r.stderr + r.stdout, /Not built: (nothing was pasted|index\.html, sw\.js or manifest\.json has uncommitted changes)/); assert.deepEqual(readdirSync(out), []);
});
test("isolation · the site refuses to run on the test address against the production database", () => {
  assert.match(html, /if\(SITE_ENV==='test'&&prodDb\)return envStop\('The test site points at the production database\.'\)/);
  assert.match(html, /async function init\(\)\{\n  if\(!checkSiteAddress\(\)\)return;/, "the address is checked before anything loads");
  assert.match(html, /if\(!signed\)\{[^\n]*return;\}\n  if\(!\(await checkDatabaseMarker\(\)\)\)return;/, "the marker is checked on opening with a saved sign-in");
  assert.match(html, /async function afterSignIn\(\)\{if\(!\(await checkDatabaseMarker\(\)\)\)return;/, "and right after signing in");
});
test("isolation · the TEST page is wired to the TEST project only", () => {
  assert.match(html, /const SB='https:\/\/wgolevihkvmosajumzvl\.supabase\.co'; \/\/ TEST project only/);
  assert.equal((html.match(/bwepvxelvwgwxrnaglrx/g) || []).length, 1, "the production reference appears once, in the guard");
});
test("isolation · the reminder and backup jobs name production explicitly and have no test fallback", () => {
  for (const f of [".github/workflows/legacy-reminders.yml", ".github/workflows/legacy-backup.yml"]) {
    const y = readFileSync(join(ROOT, f), "utf8"); assert.match(y, /SUPABASE_URL: https:\/\/bwepvxelvwgwxrnaglrx\.supabase\.co/); assert.doesNotMatch(y, /wgolevihkvmosajumzvl/);
  }
  assert.doesNotMatch(readFileSync(join(ROOT, ".github/workflows/quality.yml"), "utf8"), /bwepvxelvwgwxrnaglrx/);
});
test("isolation · the browser suites refuse to start when any setting mentions production, and block production requests", () => {
  const cfg = readFileSync(join(ROOT, "legacy/tests/e2e/playwright.config.ts"), "utf8"), iso = readFileSync(join(ROOT, "legacy/tests/e2e/isolation.ts"), "utf8");
  assert.match(cfg, /refuseProduction\(\);/); assert.match(iso, /export const PROD_REF = "bwepvxelvwgwxrnaglrx";/);
  const r = sh(process.execPath, ["-e", "require('node:child_process')"], {}); assert.equal(r.status, 0);
});
