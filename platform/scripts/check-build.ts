import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
const files = readdirSync("dist/assets");
const startup = files.filter(
  (f) =>
    /^(index|App|placement)-/.test(f) &&
    (f.endsWith(".js") || f.endsWith(".css")),
);
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
