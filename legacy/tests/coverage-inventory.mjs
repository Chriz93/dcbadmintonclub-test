#!/usr/bin/env node
// Coverage inventory and traceability matrix for the legacy site.
//   node legacy/tests/coverage-inventory.mjs            → writes docs/29-coverage-matrix.md and legacy/tests/coverage-inventory.json
// Lists what the site is made of — pages, tabs, every clickable handler, every form field, the rule sentences, the
// downloads, the database functions and tables — and, for each, the test files that exercise it (found by searching the
// test sources for the handler name, the element id or the sentence). An item no test mentions is listed as a gap.
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
// --check: report only (writes nothing) and fail when an item is not named by any test (coverage-gate.test.mjs).
const CHECK = process.argv.includes("--check");
import { join, relative, resolve } from "node:path";

const ROOT = resolve(new URL("../..", import.meta.url).pathname);
const html = readFileSync(join(ROOT, "index.html"), "utf8");
const walk = (d, out = []) => { for (const f of readdirSync(d)) { const p = join(d, f); if (f === "node_modules" || f.startsWith(".")) continue; statSync(p).isDirectory() ? walk(p, out) : out.push(p); } return out; };
const tests = [...walk(join(ROOT, "legacy/tests")), ...walk(join(ROOT, "legacy/automation"))].filter((f) => /\.(ts|mjs|py|sql|sh)$/.test(f) && !/cases\.sql|fixtures\.sql|coverage-inventory/.test(f) && (!f.includes("legacy/automation") || f.endsWith(".test.mjs")));
const src = Object.fromEntries(tests.map((f) => [relative(ROOT, f), readFileSync(f, "utf8")]));
const uniq = (a) => [...new Set(a)].sort();
const covered = (needles) => uniq(Object.entries(src).filter(([, t]) => needles.some((n) => t.includes(n))).map(([f]) => f.replace(/^legacy\/tests\//, "")));

const pages = uniq([...html.matchAll(/id="page-([a-z]+)"/g)].map((m) => m[1]));
const sections = uniq([...html.matchAll(/showSec\('([a-z]+)','([a-z-]+)'/g)].map((m) => `${m[1]} → ${m[2]}`));
const handlers = uniq([...html.matchAll(/on(?:click|change|input)="(?:[^"]*?[;(\s])?([A-Za-z_]\w*)\(/g)].map((m) => m[1])).filter((h) => !["if", "return", "document", "event", "this", "String", "parseInt", "Math", "setTimeout", "confirm", "alert", "window", "JSON", "Number"].includes(h));
// Where each handler is attached: the element's id and the start of its visible label, so a test that clicks
// "💾 Save All Court 3 Scores" or fills #past-q counts for saveScores and renderPastPlayers.
const attach = {};
for (const m of html.matchAll(/<(button|input|select|textarea|span|div|a|label)\b([^>]*?)\bon(?:click|change|input)="([^"]*)"([^>]*)>([^<]{0,80})/g)) {
  const attrs = m[2] + m[4], h = (m[3].match(/([A-Za-z_]\w*)\(/) || [])[1]; if (!h) continue;
  const id = (attrs.match(/\bid="([^"$]+)/) || [])[1], label = m[5].split("${")[0].replace(/\s+/g, " ").trim();
  (attach[h] ??= new Set()); if (id) attach[h].add(`#${id}`), attach[h].add(`"${id}"`); if (label.length >= 5) attach[h].add(label);
}
const fields = uniq([...html.matchAll(/<(input|select|textarea)[^>]*\bid="([^"]+)"/g)].map((m) => m[2].replace(/\$\{[^}]*\}/g, "*")));
const RULES = {
  "Late rule": "Players arriving more than 5 minutes late move down one court.",
  "Late player on the bottom court stays": "so a late player stays there",
  "Two shuttlecocks per player (Home)": "Shuttlecocks: two per player on each court",
  "Two shuttlecocks per player (registration)": "Each court gets two shuttlecocks per player",
  "The app can make mistakes": "The app can make mistakes. Please keep a note of your court's score",
  "Waitlist sentence removed": "Repeated unexcused absences",
  "Payment acknowledgement only on step 1": "#w5",
  "Fees only where they apply": "#rules-fee",
  "Best of three on a court of two": "best of three",
  "Five players: five games to 15, each sits out once": "sits out",
  "25–27 players: fifth players on Courts 6, 5, 4": "25 to 27 players",
  "Nobody plays alone": "nobody plays alone",
  "Refuse 31 players / 1 player at session start": "seatingProblem",
};
const DOWNLOADS = { "Waiver acceptance record": "downloadWaiverRecord", "All acceptances (CSV)": "downloadWaiverCsv", "Waiver wording": "⬇ Wording", "Season PDF": "generateSeasonPDF", "Player export (now the record)": "exportWaiver", "Backup export (job)": "export-backup", "Restore statement (job)": "restore-backup" };
const sqlSrc = walk(join(ROOT, "legacy/migrations")).filter((f) => /L\d+.*\.sql$/.test(f)).map((f) => readFileSync(f, "utf8")).join("\n");
const dbFns = uniq([...sqlSrc.matchAll(/create or replace function public\.([a-z_]+)\(/g)].map((m) => m[1]));
const dbTables = uniq([...sqlSrc.matchAll(/create table if not exists public\.([a-z_]+)/g)].map((m) => m[1]));
const ISOLATION = { "Browser runs refuse production settings": "refuseProduction", "Browser requests to production blocked": "isForbidden", "Unit tests make no network requests": "fetch-guard", "DB runner refuses hosted databases": "refusing: database tests run only", "Seed SQL checks the TEST marker": "assert_test_environment", "Site refuses a mismatched database": "env-stop", "Production build only from committed code": "uncommitted changes" };

// Controls the suites use by what they show rather than by name (checked by hand when this list was written).
const ALSO = { liveW: ["live check under the inputs"], renderAttendanceTab: ["📅 Past Attendance"], renderHistory: ["#sec-hist .card"], adjOverride: ["select.adj-ov"], adjToggleClosed: ["#adj-closed-"] };
const rows = (kind, items, needle) => items.map((it) => { const c = covered(needle(it)); return { kind, item: typeof it === "string" ? it : it[0], tests: c }; });
const all = [
  ...rows("Page", pages, (p) => [`page-${p}`, `nav("${p}")`, `nav('${p}')`]),
  ...rows("Tab", sections, (s) => { const [pg, sec] = s.split(" → "); return [`'${sec}'`, `"${sec}"`, `sec-${sec}`, `showSec("${pg}", "${sec}")`]; }),
  ...rows("Control handler", handlers, (h) => [`${h}(`, `"${h}"`, `'${h}'`, `· ${h}:`, `· ${h} `, ...(attach[h] || []), ...(ALSO[h] || [])]),
  ...rows("Form field", fields, (f) => { const base = f.replace(/\*/g, ""); return [`#${f.replace(/\*.*/, "")}`, `"${base}`, `'${base}`, `${base}\${`, ...(f === "adj-closed-*" ? ["#adj-closed-"] : [])]; }),
  ...Object.entries(RULES).map(([k, v]) => ({ kind: "Rule / wording", item: k, tests: covered([v]) })),
  ...Object.entries(DOWNLOADS).map(([k, v]) => ({ kind: "Download / export", item: k, tests: covered([v]) })),
  ...rows("Database function", dbFns, (f) => [`public.${f}(`, `"${f}"`, `'${f}'`, `rpc/${f}`, `${f}(`, `-- ${f}`]),
  ...rows("Database table", dbTables, (t) => [`public.${t}`, `"${t}"`, `'${t}'`, `/${t}`]),
  ...Object.entries(ISOLATION).map(([k, v]) => ({ kind: "Production isolation", item: k, tests: covered([v]) })),
];
const gaps = all.filter((r) => !r.tests.length);
const byKind = uniq(all.map((r) => r.kind)).map((k) => ({ k, n: all.filter((r) => r.kind === k).length, g: all.filter((r) => r.kind === k && !r.tests.length).length }));
if (!CHECK) writeFileSync(join(ROOT, "legacy/tests/coverage-inventory.json"), JSON.stringify({ generated: new Date().toISOString(), summary: byKind, items: all }, null, 1));
const md = [`# 29 — Coverage inventory and traceability matrix`, "", `Generated by \`node legacy/tests/coverage-inventory.mjs\` from index.html, the migrations and the test sources. An item is covered when a test file names it (its handler, element id, sentence, function or table). Being named is not proof of a thorough test; the suites and their assertions are described in docs/28.`, "",
  "| Kind | Items | Not named by any test |", "|---|---:|---:|", ...byKind.map((x) => `| ${x.k} | ${x.n} | ${x.g} |`), "",
  "## Gaps", "", gaps.length ? gaps.map((g) => `- ${g.kind}: \`${g.item}\``).join("\n") : "None.", "",
  "## Matrix", "", "| Kind | Item | Test files |", "|---|---|---|", ...all.map((r) => `| ${r.kind} | \`${r.item}\` | ${r.tests.join(", ") || "**gap**"} |`), ""].join("\n");
if (!CHECK) writeFileSync(join(ROOT, "docs/29-coverage-matrix.md"), md);
console.log(byKind.map((x) => `${x.k}: ${x.n} items, ${x.g} not named by a test`).join("\n"));
console.log(gaps.length ? `gaps: ${gaps.map((g) => g.item).join(", ")}` : "no gaps");
if (CHECK && gaps.length) process.exit(1);
