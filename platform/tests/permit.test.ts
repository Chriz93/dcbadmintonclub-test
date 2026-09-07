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
