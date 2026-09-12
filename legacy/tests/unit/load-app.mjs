// Loads pure functions straight out of index.html (the shipped code, not a copy) for unit tests. They are compiled in
// this same JavaScript realm, so the arrays and objects they return compare normally with node:assert/strict.
import { readFileSync } from "node:fs";

export const html = readFileSync(new URL("../../../index.html", import.meta.url), "utf8");

/** Source of one top-level `function name(...) {...}` (or `async function`) from the page script, by brace matching. */
export function fnSource(name) {
  const at = html.search(new RegExp(`\\n(?:async )?function ${name}\\(`));
  if (at < 0) throw new Error(`function ${name} not found in index.html`);
  const open = html.indexOf("{", html.indexOf(")", at));
  let depth = 0, i = open;
  for (; i < html.length; i++) { const ch = html[i]; if (ch === "{") depth++; else if (ch === "}" && --depth === 0) break; }
  return html.slice(at + 1, i + 1);
}

/** The court adjustment engine block, exactly as shipped (between its markers). */
export function engineSource() {
  const a = html.indexOf("// ═══ COURT ADJUSTMENT ENGINE"), b = html.indexOf("// ═══ END COURT ADJUSTMENT ENGINE ═══");
  if (a < 0 || b < a) throw new Error("engine markers not found in index.html");
  return html.slice(a, b);
}

/** The engine plus the named page functions; `globals` supplies what they read (NC, S…), `S` can be replaced later. */
export function load(names = [], globals = {}) {
  const env = { NC: 6, SHUTTLES_PER_PLAYER: 2, MAXG: 5, S: { players: [], current: null }, ...globals };
  const keys = Object.keys(env);
  const body = `${engineSource()}\n${names.map(fnSource).join("\n")}\nreturn {adjustCourts,validateLineup,explainAdjust,adjFormat,adjCount,adjSame${names.map((n) => "," + n).join("")},setS:(v)=>{S=v;}};`;
  const api = new Function(...keys, body)(...keys.map((k) => env[k]));
  return { api };
}
