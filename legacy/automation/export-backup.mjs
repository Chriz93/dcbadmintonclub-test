#!/usr/bin/env node
// Weekly league backup: every row of the league tables as one JSON file, written to the path in BACKUP_DIR (or
// printed to stdout). Runs with the service-role key from GitHub Actions; the artifact is stored encrypted by GitHub
// (workflow artifacts) and can also be committed to a private repository. Restore = docs/21-backup-restore.md.
const need = (k) => { if (!process.env[k]) throw new Error(`${k} is required`); return process.env[k]; };
const base = need("SUPABASE_URL").replace(/\/$/, ""), key = need("SUPABASE_SERVICE_ROLE_KEY");
const h = { apikey: key, Authorization: `Bearer ${key}` };
const TABLES = ["players", "app_state", "announcements", "rsvps", "questions", "invitations", "app_admins", "reminder_log", "audit_log"];
export async function exportAll() {
  const out = { exported_at: new Date().toISOString(), project: base, tables: {} };
  for (const t of TABLES) {
    const rows = [];
    for (let from = 0; ; from += 1000) {
      const r = await fetch(`${base}/rest/v1/${t}?select=*&order=${t === "rsvps" ? "session_number,player_id" : "id"}&offset=${from}&limit=1000`, { headers: h });
      if (!r.ok) throw new Error(`${t}: ${r.status} ${await r.text()}`);
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
}
