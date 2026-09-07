import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
const claims = z.object({
  club: z
    .string()
    .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
  user: z
    .string()
    .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
  channel: z.enum(["email", "sms"]),
});
export function signUnsubscribe(value: z.infer<typeof claims>, key: string) {
  if (Buffer.byteLength(key) < 32)
    throw new Error("Unsubscribe key must contain at least 32 bytes");
  const payload = Buffer.from(JSON.stringify(claims.parse(value))).toString(
    "base64url",
  );
  return `${payload}.${createHmac("sha256", key).update(payload).digest("base64url")}`;
}
export function verifyUnsubscribe(token: string, key: string) {
  if (token.length > 1000 || Buffer.byteLength(key) < 32)
    throw new Error("Invalid unsubscribe request");
  const parts = token.split(".");
  if (parts.length !== 2) throw new Error("Invalid unsubscribe request");
  const expected = createHmac("sha256", key).update(parts[0]).digest();
  const signature = Buffer.from(parts[1], "base64url");
  if (
    expected.length !== signature.length ||
    !timingSafeEqual(expected, signature)
  )
    throw new Error("Invalid unsubscribe request");
  return claims.parse(
    JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")),
  );
}
