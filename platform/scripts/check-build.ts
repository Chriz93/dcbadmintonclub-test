import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
const files = readdirSync("dist/assets");
// Follow Vite's actual static imports so shared chunks cannot escape the budget or
// offline shell when Rollup renames them. Heavy dynamic PDF/demo routes stay lazy.
const manifest: Record<
  string,
  { file: string; css?: string[]; imports?: string[] }
> = JSON.parse(readFileSync("dist/.vite/manifest.json", "utf8"));
const startupFiles = new Set<string>(),
  visited = new Set<string>();
function include(key: string) {
  if (visited.has(key)) return;
  visited.add(key);
  const entry = manifest[key];
  if (!entry) throw new Error(`Missing build entry: ${key}`);
  startupFiles.add(entry.file.replace(/^assets\//, ""));
  for (const file of entry.css ?? [])
    startupFiles.add(file.replace(/^assets\//, ""));
  for (const dependency of entry.imports ?? []) include(dependency);
}
include("index.html");
include("src/App.tsx");
const startup = [...startupFiles].sort();
const gzip = startup.reduce(
  (n, f) => n + gzipSync(readFileSync("dist/assets/" + f)).length,
  0,
);
if (gzip > 220 * 1024)
  throw new Error(`Startup budget exceeded: ${gzip} bytes gzip`);
for (const f of files.filter((f) => f.endsWith(".js"))) {
  const text = readFileSync("dist/assets/" + f, "utf8");
  if (
    /sb_secret_[A-Za-z0-9]+|SUPABASE_SERVICE_ROLE_KEY|MAIL_API_KEY/.test(text)
  )
    throw new Error("Server secret marker in browser output");
}
let worker = readFileSync("dist/sw.js", "utf8");
worker = worker.replace(
  "new URL('manifest.webmanifest',BASE)",
  "new URL('manifest.webmanifest',BASE)," +
    startup.map((f) => `new URL('assets/${f}',BASE)`).join(","),
);
worker = worker.replace(
  "clubcourt-test-public-v1",
  "clubcourt-test-public-" +
    createHash("sha256").update(startup.join(",")).digest("hex").slice(0, 12),
);
writeFileSync("dist/sw.js", worker);
console.log(
  `Startup assets: ${(gzip / 1024).toFixed(1)} KiB gzip; public shell precache generated; no server secret markers.`,
);
