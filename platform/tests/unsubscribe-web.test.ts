import { it, expect, vi } from "vitest";
import { signUnsubscribe } from "../scripts/unsubscribe-token";
import { verifyUnsubscribeWeb } from "../src/services/unsubscribe-token-web";
import { onRequestGet, onRequestPost } from "../functions/unsubscribe";
const value = {
    club: "10000000-0000-0000-0000-000000000001",
    user: "20000000-0000-0000-0000-000000000001",
    channel: "email" as const,
  },
  key = "synthetic-unsubscribe-key-with-32-bytes";
it("Web Crypto verification accepts the worker's token and rejects tampering", async () => {
  const token = signUnsubscribe(value, key);
  expect(await verifyUnsubscribeWeb(token, key)).toEqual(value);
  const forged =
    Buffer.from(JSON.stringify({ ...value, channel: "sms" })).toString(
      "base64url",
    ) +
    "." +
    token.split(".")[1];
  for (const bad of [forged, "", "a.b", token + "x", "x".repeat(1001)])
    await expect(verifyUnsubscribeWeb(bad, key)).rejects.toThrow();
  await expect(verifyUnsubscribeWeb(token, "short")).rejects.toThrow();
  await expect(verifyUnsubscribeWeb(token, key + "wrong")).rejects.toThrow();
});
it("Pages function shows a form on GET, disables one channel on POST and never leaks secrets", async () => {
  const token = signUnsubscribe(value, key);
  const env = {
    SUPABASE_URL: "https://wgolevihkvmosajumzvl.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "synthetic-service-key",
    UNSUBSCRIBE_SIGNING_KEY: key,
  };
  const fetcher = vi
    .fn()
    .mockResolvedValue(new Response("null", { status: 200 }));
  vi.stubGlobal("fetch", fetcher);
  try {
    const get = await onRequestGet({
      request: new Request(
        `https://example.invalid/unsubscribe?token=${token}`,
      ),
      env,
    });
    expect(get.status).toBe(200);
    expect(await get.text()).toContain('<form method="post">');
    expect(get.headers.get("Cache-Control")).toBe("no-store");
    const post = await onRequestPost({
      request: new Request(
        `https://example.invalid/unsubscribe?token=${token}`,
        { method: "POST", body: "List-Unsubscribe=One-Click" },
      ),
      env,
    });
    expect(post.status).toBe(200);
    expect(await post.text()).toContain("Unsubscribed");
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://wgolevihkvmosajumzvl.supabase.co/rest/v1/rpc/unsubscribe_channel",
    );
    expect(JSON.parse(String(init.body))).toEqual({
      c: value.club,
      u: value.user,
      channel_name: "email",
    });
    expect((init.headers as Record<string, string>)["Content-Profile"]).toBe(
      "club_app",
    );
    const bad = await onRequestPost({
      request: new Request("https://example.invalid/unsubscribe?token=nope", {
        method: "POST",
      }),
      env,
    });
    expect(bad.status).toBe(400);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const unconfigured = await onRequestPost({
      request: new Request(
        `https://example.invalid/unsubscribe?token=${token}`,
        { method: "POST" },
      ),
      env: { UNSUBSCRIBE_SIGNING_KEY: key },
    });
    expect(unconfigured.status).toBe(503);
    expect(await unconfigured.text()).not.toContain("synthetic-service-key");
  } finally {
    vi.unstubAllGlobals();
  }
});
