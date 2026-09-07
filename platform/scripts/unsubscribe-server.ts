/** Run behind the approved HTTPS reverse proxy. Never log request URLs or tokens. */
import { createServer } from "node:http";
import { createClient } from "@supabase/supabase-js";
import { verifyUnsubscribe } from "./unsubscribe-token.ts";
const url = process.env.TEST_SUPABASE_URL,
  serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY,
  key = process.env.UNSUBSCRIBE_SIGNING_KEY;
if (
  url !== "https://wgolevihkvmosajumzvl.supabase.co" ||
  !serviceKey ||
  !key ||
  Buffer.byteLength(key) < 32
)
  throw new Error(
    "Approved TEST URL, server key and unsubscribe signing key required",
  );
const db = createClient(url, serviceKey, {
  db: { schema: "club_app" },
  auth: { persistSession: false },
});
const signingKey = key;
const server = createServer(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  );
  try {
    const request = new URL(req.url ?? "/", "http://localhost");
    if (request.pathname !== "/unsubscribe") {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const claim = verifyUnsubscribe(
      request.searchParams.get("token") ?? "",
      signingKey,
    );
    if (req.method === "GET") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(
        '<!doctype html><html lang="en"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Stop league reminders</title><main><h1>Stop league reminders</h1><p>This stops this notification channel for this club. Membership and session bookings stay in place.</p><form method="post"><button type="submit">Unsubscribe</button></form></main></html>',
      );
      return;
    }
    if (req.method !== "POST") {
      res.writeHead(405, { Allow: "GET, POST" });
      res.end();
      return;
    }
    let bytes = 0;
    for await (const chunk of req) {
      bytes += chunk.length;
      if (bytes > 2048) {
        res.writeHead(413);
        res.end();
        return;
      }
    }
    const { error } = await db.rpc("unsubscribe_channel", {
      c: claim.club,
      u: claim.user,
      channel_name: claim.channel,
    });
    if (error) throw new Error("Preference service unavailable");
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end(
      "Unsubscribed. Your membership and bookings have not changed. You can opt in again in Member hub.",
    );
  } catch {
    res.writeHead(400);
    res.end(
      "Unable to confirm this request. Use Member hub preferences or contact the organizer.",
    );
  }
});
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.listen(Number(process.env.UNSUBSCRIBE_PORT ?? 8788), "127.0.0.1", () =>
  console.log("Unsubscribe endpoint listening on loopback"),
);
