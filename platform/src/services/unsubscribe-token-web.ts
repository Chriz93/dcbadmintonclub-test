/** Web Crypto verification of the worker's signed unsubscribe token. Runs on Cloudflare Pages. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export interface UnsubscribeClaim {
  club: string;
  user: string;
  channel: "email" | "sms";
}
function fromBase64Url(value: string) {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) throw new Error("Invalid encoding");
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
}
export async function verifyUnsubscribeWeb(
  token: string,
  key: string,
): Promise<UnsubscribeClaim> {
  if (
    typeof token !== "string" ||
    token.length > 1000 ||
    new TextEncoder().encode(key).length < 32
  )
    throw new Error("Invalid unsubscribe request");
  const parts = token.split(".");
  if (parts.length !== 2) throw new Error("Invalid unsubscribe request");
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify(
    "HMAC",
    cryptoKey,
    fromBase64Url(parts[1]),
    new TextEncoder().encode(parts[0]),
  );
  if (!valid) throw new Error("Invalid unsubscribe request");
  const parsed: unknown = JSON.parse(
    new TextDecoder().decode(fromBase64Url(parts[0])),
  );
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !UUID.test(String((parsed as { club?: unknown }).club)) ||
    !UUID.test(String((parsed as { user?: unknown }).user)) ||
    !["email", "sms"].includes(
      String((parsed as { channel?: unknown }).channel),
    )
  )
    throw new Error("Invalid unsubscribe request");
  const claim = parsed as UnsubscribeClaim;
  return { club: claim.club, user: claim.user, channel: claim.channel };
}
