/** Server/operator CLI. Never log credentials or plaintext data. */
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { encryptBackup, decryptBackup } from "./backup-envelope.ts";
const connection = process.env.TEST_DATABASE_URL,
  keyPath = process.env.BACKUP_KEY_FILE,
  output = process.env.BACKUP_OUTPUT;
if (!connection || !keyPath || !output)
  throw new Error(
    "Set TEST_DATABASE_URL, BACKUP_KEY_FILE and BACKUP_OUTPUT privately on the operator machine",
  );
const url = new URL(connection);
if (
  url.protocol !== "postgresql:" ||
  url.hostname !== "db.wgolevihkvmosajumzvl.supabase.co" ||
  url.pathname !== "/postgres"
)
  throw new Error(
    "Only the approved TEST database can be backed up by this command",
  );
if ((statSync(keyPath).mode & 0o077) !== 0)
  throw new Error("Backup key permissions must be 0600");
const key = readFileSync(keyPath);
if (key.length !== 32)
  throw new Error("Backup key must contain exactly 32 random bytes");
const chunks: Buffer[] = [];
let size = 0;
const child = spawn("pg_dump", ["--format=custom", "--no-owner"], {
  env: {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGDATABASE: "postgres",
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGSSLMODE: "require",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
child.stdout.on("data", (chunk: Buffer) => {
  size += chunk.length;
  if (size > 250 * 1024 * 1024) {
    child.kill();
    return;
  }
  chunks.push(chunk);
});
child.stderr.resume();
await new Promise<void>((resolve, reject) => {
  child.on("error", () => reject(new Error("pg_dump is unavailable")));
  child.on("close", (code) =>
    code === 0 && size <= 250 * 1024 * 1024
      ? resolve()
      : reject(new Error("Database dump failed; no backup was written")),
  );
});
const dump = Buffer.concat(chunks);
const envelope = encryptBackup(dump, key);
if (!decryptBackup(envelope, key).equals(dump))
  throw new Error("Backup round-trip failed");
writeFileSync(output, envelope, { mode: 0o600, flag: "wx" });
console.log(
  JSON.stringify({
    encryptedBytes: envelope.length,
    sha256: createHash("sha256").update(envelope).digest("hex"),
    restoredDatabaseVerified: false,
  }),
);
