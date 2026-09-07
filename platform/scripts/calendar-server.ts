/** Local read-only staging subscription endpoint. Never uses a privileged key. */
import { createServer } from "node:http";
import { calendarResponse } from "../src/services/calendar-feed.ts";
import { readConfig } from "../src/services/config.ts";
const config = readConfig(process.env);
if (config.VITE_APP_ENV !== "test")
  throw new Error("Explicit test configuration required");
const server = createServer(async (req, res) => {
  try {
    const request = new Request(
      new URL(req.url ?? "/", "http://127.0.0.1:8787"),
      { method: req.method, headers: req.headers as Record<string, string> },
    );
    const response = await calendarResponse(request, async (slug) => {
      const url = new URL(
        "/rest/v1/rpc/public_schedule",
        config.VITE_SUPABASE_URL,
      );
      url.searchParams.set("club_slug", slug);
      const result = await fetch(url, {
        headers: {
          apikey: config.VITE_SUPABASE_PUBLISHABLE_KEY!,
          "Accept-Profile": "club_app",
        },
        signal: AbortSignal.timeout(10000),
      });
      if (!result.ok) throw new Error("Public schedule unavailable");
      return result.json();
    });
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(await response.text());
  } catch {
    res.writeHead(500, { "Cache-Control": "no-store" });
    res.end("Calendar unavailable");
  }
});
server.listen(8787, "127.0.0.1", () =>
  process.stdout.write(
    "Read-only test calendar: http://127.0.0.1:8787/calendar/dc-badminton.ics\n",
  ),
);
