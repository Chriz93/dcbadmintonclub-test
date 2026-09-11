// The restore helper prints one table's rows back as idempotent SQL, keyed by that table's own key.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const dir = mkdtempSync(join(tmpdir(), "restore-"));
const file = join(dir, "backup.json");
writeFileSync(file, JSON.stringify({ exported_at: "2026-09-11T11:30:00Z", tables: {
  players: [{ id: 7, name: "O'Connor", paid: true, season_wins: 3, updated_at: "2026-09-10T00:00:00Z" }],
  invitations: [{ email: "a@example.invalid", membership_type: "regular", note: "", created_at: "2026-09-01T00:00:00Z" }],
  app_admins: [{ user_id: "b0000000-0000-0000-0000-000000000001", label: "organizer", added_at: "2026-09-01T00:00:00Z" }],
  season_dates: [{ session_number: 1, play_on: "2026-09-15", start_at: "2026-09-15T20:00:00-04:00" }],
  rsvps: [{ session_number: 1, player_id: 7, response: "coming", note: "", updated_at: "2026-09-13T00:00:00Z" }],
  payments_archive: [{ id: 3, season_label: "2026-27", kind: "season", amount: 400 }],
  audit_log: [{ id: 5, actor: null, action: "x", subject: null, detail: { a: 1 }, created_at: "2026-09-11T00:00:00Z" }],
} }));
const run = (table) => execFileSync(process.execPath, [new URL("./restore-backup.mjs", import.meta.url).pathname, file, table], { encoding: "utf8" });

test("each table is restored on its own key", () => {
  assert.match(run("players"), /on conflict\(id\) do update set name=excluded\.name/);
  assert.match(run("invitations"), /on conflict\(email\) do update/);
  assert.match(run("app_admins"), /on conflict\(user_id\) do update/);
  assert.match(run("season_dates"), /on conflict\(session_number\) do update/);
  assert.match(run("rsvps"), /on conflict\(session_number,player_id\) do update/);
});
test("only the league's own triggers pause; foreign keys stay checked", () => {
  for (const t of ["players", "rsvps", "invitations"]) {
    const sql = run(t);
    assert.match(sql, /disable trigger user;[\s\S]*enable trigger user;/);
    assert.doesNotMatch(sql, /trigger all/);
  }
});
test("values are quoted safely and the id counter is reset only where one exists", () => {
  const sql = run("players");
  assert.match(sql, /'O''Connor'/);
  assert.match(sql, /overriding system value values\(7,/);
  assert.match(sql, /select setval\(pg_get_serial_sequence\('public\.players','id'\),.*where pg_get_serial_sequence/);
  assert.match(run("audit_log"), /'\{"a":1\}'::jsonb/);
  assert.doesNotMatch(run("invitations"), /setval/);
});
