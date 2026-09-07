import { it, expect } from "vitest";
import { initialPlacement } from "../src/domain/placement";
it("sorts ELO and applies a one-court penalty without losing anyone", () => {
  const players = Array.from({ length: 25 }, (_, i) => ({
    id: `p${i}`,
    rating: 1500 - i * 10,
    seed: i,
    penalized: i === 0,
  }));
  const result = initialPlacement(players, 6);
  expect(result.plan.map((c) => c.length)).toEqual([4, 4, 4, 4, 4, 5]);
  expect(result.plan[1]).toContain("p0");
  expect(new Set(result.plan.flat()).size).toBe(25);
  expect(result.applied).toEqual(["p0"]);
});
it("flags a bottom-court penalty rather than creating an invalid court", () => {
  const result = initialPlacement(
    Array.from({ length: 8 }, (_, i) => ({
      id: `p${i}`,
      rating: 1000 - i,
      seed: i,
      penalized: i === 7,
    })),
    2,
  );
  expect(result.unresolved).toEqual(["p7"]);
  expect(result.plan.flat()).toHaveLength(8);
});
