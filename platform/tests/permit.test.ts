import { it, expect } from "vitest";
import { proposeBookings, validatePermitRows } from "../src/domain/permit";
it("extracts unambiguous permit rows and preserves cancellations", () => {
  const p = proposeBookings(
    "Permit 2026-07-21-0001\n2026-09-15 20:15 22:15 Approved\n2026-12-01 20:15 22:15 Cancelled\n2026-12-08 status unclear",
  );
  expect(p.permit).toBe("2026-07-21-0001");
  expect(p.proposals).toEqual([
    "2026-09-15 20:15 22:15 active",
    "2026-12-01 20:15 22:15 cancelled",
  ]);
  expect(p.unresolved).toHaveLength(1);
  expect(p.requiresManualReview).toBe(true);
});
it("deduplicates text without inventing missing times", () => {
  const p = proposeBookings(
    "2026-09-15 20:15 22:15 Approved\n2026-09-15 20:15 22:15 Approved\n2026-09-22 Approved",
  );
  expect(p.proposals).toHaveLength(1);
  expect(p.unresolved).toHaveLength(1);
});
it("manual corrections remain schema validated", () => {
  expect(
    validatePermitRows("2026-09-15 20:15 22:15 active", "P", "Gym", "A"),
  ).toHaveLength(1);
  expect(() => validatePermitRows("bad date", "P", "Gym", "A")).toThrow();
});

it("reads the actual OCDSB printed format without turning cancellations into bookings", () => {
  const result = proposeBookings(
    "Permit 2026-07-21-0001\nApproved Tue, Sep 15, 2026 8:15pm 10:15pm Maplewood Secondary School\nCancelled Tue, Apr 06, 2027 8:15pm 10:15pm Maplewood Secondary School\nTue, May 25, 2027 8:15pm 10:15pm",
  );
  expect(result.proposals).toEqual([
    "2026-09-15 20:15 22:15 active",
    "2027-04-06 20:15 22:15 cancelled",
  ]);
  expect(result.unresolved).toHaveLength(1);
});

it("matches all 34 original permit rows to the seeded dates and statuses", async () => {
  const { readFileSync } = await import("node:fs");
  const { season } = await import("../src/domain/schedule");
  const text = readFileSync("tests/fixtures/maplewood-permit-rows.txt", "utf8");
  const proposed = proposeBookings(text);
  expect(proposed.unresolved).toHaveLength(0);
  expect(proposed.proposals).toEqual(
    season.map((s) => `${s.date} ${s.start} ${s.end} ${s.status}`),
  );
});
