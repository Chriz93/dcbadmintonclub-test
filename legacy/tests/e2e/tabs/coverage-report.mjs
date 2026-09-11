// Merge Chrome coverage saved by the tab suites (COVERAGE_DIR) and report which of index.html's code never ran.
// Usage: node coverage-report.mjs <COVERAGE_DIR> <path to index.html>
import fs from "node:fs";
const [dir, htmlPath] = process.argv.slice(2);
const src = fs.readFileSync(`${dir}/source.js`, "utf8"), html = fs.readFileSync(htmlPath, "utf8");
const baseLine = html.slice(0, html.indexOf(src)).split("\n").length - 1;   // script's first line in index.html
const hit = new Uint8Array(src.length), fnHit = new Map();
for (const f of fs.readdirSync(dir).filter((x) => x.startsWith("cov-"))) {
  for (const functions of JSON.parse(fs.readFileSync(`${dir}/${f}`, "utf8"))) {
    const ranges = functions.flatMap((fn) => fn.ranges).sort((a, b) => a.startOffset - b.startOffset || b.endOffset - a.endOffset);
    const run = new Uint8Array(src.length);
    for (const r of ranges) run.fill(r.count > 0 ? 1 : 0, r.startOffset, r.endOffset);
    for (let i = 0; i < src.length; i++) if (run[i]) hit[i] = 1;
    for (const fn of functions) { const r = fn.ranges[0]; const k = r.startOffset; fnHit.set(k, { name: fn.functionName, start: k, end: r.endOffset, ran: (fnHit.get(k)?.ran || 0) + (r.count > 0 ? 1 : 0) }); }
  }
}
const lineOf = (off) => baseLine + src.slice(0, off).split("\n").length;
let lines = 0, covered = 0, off = 0;
const missLines = [];
for (const line of src.split("\n")) {
  const i = line.search(/\S/);
  if (i >= 0 && !/^\s*(\/\/|\*|\/\*)/.test(line)) { lines++; if (hit[off + i]) covered++; else missLines.push(lineOf(off + i)); }
  off += line.length + 1;
}
const fns = [...fnHit.values()].filter((f) => f.name);
const never = fns.filter((f) => !f.ran).map((f) => ({ name: f.name, line: lineOf(f.start), size: src.slice(f.start, f.end).split("\n").length }));
console.log(JSON.stringify({ lines, covered, pct: +(100 * covered / lines).toFixed(1), functions: fns.length, functionsRun: fns.length - never.length, never: never.sort((a, b) => b.size - a.size), missLines }, null, 0));
