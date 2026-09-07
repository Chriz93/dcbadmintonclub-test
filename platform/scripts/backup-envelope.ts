import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from "node:crypto";
const aad = Buffer.from("maplewood-backup-v1");
export function encryptBackup(data: Uint8Array, key: Uint8Array) {
  if (key.byteLength !== 32)
    throw new Error("A 32-byte backup key is required");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aad);
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  return Buffer.from(
    JSON.stringify({
      version: 1,
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      ciphertext: encrypted.toString("base64"),
      plaintextSha256: createHash("sha256").update(data).digest("hex"),
    }),
  );
}
export function decryptBackup(envelope: Uint8Array, key: Uint8Array) {
  if (key.byteLength !== 32)
    throw new Error("A 32-byte backup key is required");
  const parsed = JSON.parse(Buffer.from(envelope).toString("utf8")) as {
    version: number;
    iv: string;
    tag: string;
    ciphertext: string;
    plaintextSha256: string;
  };
  if (parsed.version !== 1) throw new Error("Unsupported backup version");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(parsed.iv, "base64"),
  );
  decipher.setAAD(aad);
  decipher.setAuthTag(Buffer.from(parsed.tag, "base64"));
  const data = Buffer.concat([
    decipher.update(Buffer.from(parsed.ciphertext, "base64")),
    decipher.final(),
  ]);
  if (
    createHash("sha256").update(data).digest("hex") !== parsed.plaintextSha256
  )
    throw new Error("Backup digest mismatch");
  return data;
}
