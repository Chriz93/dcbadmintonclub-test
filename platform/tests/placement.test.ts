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
it("rotates who rests first on a five-player court each round while keeping four-player courts fixed", async () => {
  const { rotateRestOrder, nextRoundPlacement } =
    await import("../src/domain/placement");
  expect(
    rotateRestOrder([
      ["a", "b", "c", "d", "e"],
      ["f", "g", "h", "i"],
    ]),
  ).toEqual([
    ["b", "c", "d", "e", "a"],
    ["f", "g", "h", "i"],
  ]);
  const courts = [
    ["a", "b", "c", "d"],
    ["e", "f", "g", "h", "i"],
  ];
  const { rotation } = await import("../src/domain/courts");
  const results = courts.flatMap((ids) =>
    rotation(ids).map((game) => ({
      game,
      a: game.target,
      b: game.target === 21 ? 5 : 3,
    })),
  );
  const next = nextRoundPlacement(courts, results);
  // Court 1 keeps its lineup order apart from the swap; court 2 rotates after the swap.
  expect(next[0]).toEqual(["a", "b", "c", "e"]);
  expect(next[1]).toHaveLength(5);
  expect(next[1][4]).toBe("d");
  expect(new Set(next.flat()).size).toBe(9);
});
