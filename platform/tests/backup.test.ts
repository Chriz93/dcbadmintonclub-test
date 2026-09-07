import { it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { encryptBackup, decryptBackup } from "../scripts/backup-envelope";
it("encrypts with authenticated random nonces and detects altered backups", () => {
  const key = randomBytes(32),
    plain = Buffer.from("Synthetic member and signature archive");
  const a = encryptBackup(plain, key),
    b = encryptBackup(plain, key);
  expect(a.equals(b)).toBe(false);
  expect(a.toString()).not.toContain("Synthetic member");
  expect(decryptBackup(a, key)).toEqual(plain);
  const changed = JSON.parse(a.toString());
  changed.tag = Buffer.alloc(16).toString("base64");
  expect(() =>
    decryptBackup(Buffer.from(JSON.stringify(changed)), key),
  ).toThrow();
  expect(() => decryptBackup(a, randomBytes(32))).toThrow();
});
