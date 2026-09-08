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
it("unsubscribe handles unavailable services without exposing errors or claiming success", async () => {
  const token = signUnsubscribe(value, key);
  const request = new Request(
    `https://example.invalid/unsubscribe?token=${token}`,
    { method: "POST" },
  );
  const env = {
    UNSUBSCRIBE_SIGNING_KEY: key,
    SUPABASE_SERVICE_ROLE_KEY: "private-test-secret",
    SUPABASE_URL: "https://wgolevihkvmosajumzvl.supabase.co",
  };
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  try {
    for (const address of [
      "not a URL",
      "https://user:password@project.supabase.co",
      "https://project.supabase.co/other",
      "https://project.supabase.co?key=secret",
    ]) {
      const result = await onRequestPost({
        request,
        env: { ...env, SUPABASE_URL: address },
      });
      expect(result.status).toBe(503);
    }
    expect(fetcher).not.toHaveBeenCalled();
    for (const error of [
      new Error("private-test-secret"),
      new DOMException("timed out", "TimeoutError"),
    ]) {
      fetcher.mockRejectedValueOnce(error);
      const result = await onRequestPost({ request, env });
      expect(result.status).toBe(502);
      const body = await result.text();
      expect(body).not.toContain("private-test-secret");
      expect(body).not.toContain("<h1>Unsubscribed</h1>");
    }
    const [, options] = fetcher.mock.calls[0];
    expect(options.redirect).toBe("error");
    expect(options.signal).toBeInstanceOf(AbortSignal);
  } finally {
    vi.unstubAllGlobals();
  }
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
