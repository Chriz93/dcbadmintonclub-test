import { it, expect } from "vitest";
import { calendarResponse } from "../src/services/calendar-feed";
const row = {
  calendar_uid: "30000000-0000-4000-8000-000000000001",
  club_name: "Club, A\nSTATUS:CANCELLED",
  venue_name: "Gym",
  starts_at: "2026-09-16T00:15:00+00:00",
  ends_at: "2026-09-16T02:15:00+00:00",
  status: "scheduled",
  revision: 0,
};
const request = () =>
  new Request("https://example.invalid/calendar/club-a.ics");
it("preserves event identity when cancellations or dates change and strips private fields", async () => {
  const first = await calendarResponse(request(), async () => [
    { ...row, email: "private@example.invalid" },
  ]);
  const initial = await first.text();
  expect(initial).toContain("DTSTART:20260916T001500Z");
  expect(initial).not.toContain("private@example.invalid");
  expect(initial).toContain("SUMMARY:Club\\, A\\nSTATUS:CANCELLED");
  const second = await calendarResponse(request(), async () => [
    {
      ...row,
      revision: 1,
      status: "cancelled",
      starts_at: "2026-09-16T00:30:00Z",
    },
  ]);
  const changed = await second.text();
  expect(changed.match(/UID:.*/)?.[0]).toBe(initial.match(/UID:.*/)?.[0]);
  expect(changed).toContain("SEQUENCE:1");
  expect(changed).toContain("\r\nSTATUS:CANCELLED\r\n");
  expect(second.headers.get("etag")).not.toBe(first.headers.get("etag"));
});
it("supports conditional subscriptions and rejects mutations", async () => {
  const first = await calendarResponse(request(), async () => [row]);
  const cached = await calendarResponse(
    new Request(request(), {
      headers: { "If-None-Match": first.headers.get("etag")! },
    }),
    async () => [row],
  );
  expect(cached.status).toBe(304);
  const head = await calendarResponse(
    new Request(request(), { method: "HEAD" }),
    async () => [row],
  );
  expect(await head.text()).toBe("");
  const write = await calendarResponse(
    new Request(request(), { method: "POST" }),
    async () => [row],
  );
  expect(write.status).toBe(405);
});
it("does not serve a stale calendar after a provider failure or malformed data", async () => {
  const failed = await calendarResponse(request(), async () => {
    throw new Error();
  });
  expect(failed.status).toBe(503);
  expect(failed.headers.get("cache-control")).toBe("no-store");
  expect(
    (
      await calendarResponse(request(), async () => [
        { ...row, status: "unknown" },
      ])
    ).status,
  ).toBe(503);
  expect(
    (
      await calendarResponse(
        new Request("https://example.invalid/private"),
        async () => [row],
      )
    ).status,
  ).toBe(404);
});
