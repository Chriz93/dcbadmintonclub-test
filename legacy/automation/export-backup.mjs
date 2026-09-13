#!/usr/bin/env node
// Weekly league backup: every row of the league tables as one JSON file, written to the path in BACKUP_DIR (or
// printed to stdout). Runs with the service-role key from GitHub Actions; the artifact is stored encrypted by GitHub
// (workflow artifacts) and can also be committed to a private repository. Restore = docs/21-backup-restore.md.
// Automated tests never reach a real database (the backup job itself runs outside `node --test`).
if (process.env.NODE_TEST_CONTEXT && /supabase\.(co|com)/i.test(process.env.SUPABASE_URL || "")) throw new Error("Refusing: automated tests must not reach a real Supabase project");
const need = (k) => { if (!process.env[k]) throw new Error(`${k} is required`); return process.env[k]; };
const base = need("SUPABASE_URL").replace(/\/$/, ""), key = need("SUPABASE_SERVICE_ROLE_KEY");
const h = key.startsWith("sb_secret_") ? { apikey: key } : { apikey: key, Authorization: `Bearer ${key}` };
// Every league table, with the column that gives each one a stable paging order (not all have an id).
const TABLES = {
  players: "id", app_state: "key", announcements: "id", questions: "id", audit_log: "id",
  reminder_log: "id", rsvp_log: "id", payments: "id", payments_archive: "id", past_players: "id", push_subscriptions: "id",
  waiver_versions: "version", waiver_acceptances: "id", environment: "id",
  rsvps: "session_number,player_id", invitations: "email", app_admins: "user_id", season_dates: "session_number",
};
// Tables from the September 2026 release (L18, L20). A database the release has not reached yet (production until it
// is migrated) does not have them: the backup notes them as absent instead of failing. Every other table must exist.
const NEW_TABLES = new Set(["waiver_versions", "waiver_acceptances", "environment"]);
export async function exportAll() {
  const out = { exported_at: new Date().toISOString(), project: base, tables: {}, absent: [] };
  tables: for (const [t, order] of Object.entries(TABLES)) {
    const rows = [];
    for (let from = 0; ; from += 1000) {
      const r = await fetch(`${base}/rest/v1/${t}?select=*&order=${order}&offset=${from}&limit=1000`, { headers: h });
      if (!r.ok) {
        const body = await r.text();
        if (NEW_TABLES.has(t) && r.status === 404 && /PGRST205|Could not find the table/.test(body)) { out.absent.push(t); continue tables; }
        throw new Error(`${t}: ${r.status} ${body}`);
      }
      const page = await r.json(); rows.push(...page); if (page.length < 1000) break;
    }
    out.tables[t] = rows;
  }
  return out;
}
if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  const { writeFileSync, mkdirSync } = await import("node:fs");
  const data = await exportAll();
  const summary = Object.fromEntries(Object.entries(data.tables).map(([t, rows]) => [t, rows.length]));
  if (process.env.BACKUP_DIR) {
    mkdirSync(process.env.BACKUP_DIR, { recursive: true });
    const file = `${process.env.BACKUP_DIR}/league-${data.exported_at.slice(0, 10)}.json`;
    writeFileSync(file, JSON.stringify(data));
    console.log(`wrote ${file}`, JSON.stringify(summary));
  } else console.log(JSON.stringify(summary));
  if (data.absent.length) console.log(`not in this database yet (September 2026 release): ${data.absent.join(", ")}`);
}
