#!/usr/bin/env node
// Prints an idempotent restore statement for ONE table from a backup file. It never connects anywhere.
//   node restore-backup.mjs league-2026-09-16.json players > restore-players.sql
import { readFileSync } from "node:fs";
const [file, table] = process.argv.slice(2);
if (!file || !table) { console.error("usage: restore-backup.mjs <backup.json> <table>"); process.exit(2); }
const data = JSON.parse(readFileSync(file, "utf8"));
const rows = data.tables[table];
if (!rows) { console.error(`table ${table} not in backup (${Object.keys(data.tables).join(", ")})`); process.exit(2); }
if (!rows.length) { console.log(`-- ${table}: no rows in backup`); process.exit(0); }
const cols = Object.keys(rows[0]);
const lit = (v) => v === null || v === undefined ? "null" : typeof v === "number" ? String(v) : typeof v === "boolean" ? (v ? "true" : "false") : typeof v === "object" ? `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb` : `'${String(v).replace(/'/g, "''")}'`;
// Each table's own key (not every table has an id).
const KEYS = { app_state: ["key"], rsvps: ["session_number", "player_id"], invitations: ["email"], app_admins: ["user_id"], season_dates: ["session_number"] };
const key = KEYS[table] || ["id"];
const updates = cols.filter((c) => !key.includes(c)).map((c) => `${c}=excluded.${c}`).join(",");
console.log(`-- restore ${table}: ${rows.length} rows from ${file} (exported ${data.exported_at})`);
console.log("begin;");
// Only the league's own triggers pause (no vote-log entries or asker rewrites for restored rows); foreign keys stay checked.
console.log(`alter table public.${table} disable trigger user;`);
for (const r of rows) console.log(`insert into public.${table}(${cols.join(",")}) ${cols.includes("id") ? "overriding system value " : ""}values(${cols.map((c) => lit(r[c])).join(",")}) on conflict(${key.join(",")}) do ${updates ? `update set ${updates}` : "nothing"};`);
console.log(`alter table public.${table} enable trigger user;`);
if (cols.includes("id")) console.log(`select setval(pg_get_serial_sequence('public.${table}','id'),(select max(id) from public.${table})) where pg_get_serial_sequence('public.${table}','id') is not null;`);
console.log("commit;");
