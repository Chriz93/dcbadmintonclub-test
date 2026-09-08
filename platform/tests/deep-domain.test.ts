import { describe, it, expect } from "vitest";
import {
  allocate,
  rotation,
  defaultRules,
  type Result,
} from "../src/domain/courts";
import { initialPlacement, nextRoundPlacement } from "../src/domain/placement";
import {
  ids,
  allocationCounts,
  overCapacity,
  invalidAllocations,
  rotations,
  invalidRotations,
  penaltyGroups,
  movementScenarios,
  brokenRounds,
  scoresFor,
} from "./fixtures/regression-matrix";

describe("300-case review: allocation boundaries (43)", () => {
  it.each(allocationCounts)(
    "%i attendees on six courts preserve identities and playable group sizes",
    (n) => {
      const people = Array.from({ length: n }, (_, i) => `player-${i}`);
      const original = [...people];
      const plan = allocate(people, 6);
      expect(plan).toHaveLength(6);
      expect(plan.flat().sort()).toEqual([...people].sort());
      expect(people).toEqual(original);
      expect(plan.every((c) => c.length <= 5)).toBe(true);
      if (n > 1) expect(plan.every((c) => c.length !== 1)).toBe(true);
      if (n >= 24)
        expect(plan.map((c) => c.length)).toEqual(
          Array.from({ length: 6 }, (_, c) => (c >= 30 - n ? 5 : 4)),
        );
    },
  );
  it.each(overCapacity)("%i attendees cannot overflow six courts", (n) =>
    expect(() =>
      allocate(
        Array.from({ length: n }, (_, i) => String(i)),
        6,
      ),
    ).toThrow("Capacity"),
  );
  it.each(invalidAllocations)("rejects $name", (c) =>
    expect(() => allocate(c.ids, c.courts, c.normal, c.max)).toThrow(),
  );
});
describe("300-case review: rotation fairness (30)", () => {
  it.each(rotations)("$name", ({ size, offset }) => {
    const people = ids.slice(0, size);
    const games = rotation(people, defaultRules, offset);
    expect(games).toHaveLength(size === 5 ? 5 : 3);
    const partners = new Map<string, number>();
    for (const game of games) {
      expect([...game.a, ...game.b, ...game.rest].sort()).toEqual([...people]);
      expect(new Set([...game.a, ...game.b, ...game.rest]).size).toBe(size);
      expect(game.a.length).toBe(game.b.length);
      expect(game.target).toBe(size === 5 ? 15 : 21);
      for (const team of [game.a, game.b])
        if (team.length === 2) {
          const key = [...team].sort().join("/");
          partners.set(key, (partners.get(key) ?? 0) + 1);
        }
    }
    for (const player of people) {
      expect(
        games.filter((g) => g.a.includes(player) || g.b.includes(player)),
      ).toHaveLength(size === 5 ? 4 : size === 3 ? 2 : 3);
      expect(games.filter((g) => g.rest.includes(player))).toHaveLength(
        size === 3 || size === 5 ? 1 : 0,
      );
    }
    if (size >= 4) {
      expect(partners.size).toBe((size * (size - 1)) / 2);
      expect([...partners.values()].every((n) => n === 1)).toBe(true);
    }
    if (size === 5) expect(games[0].rest).toEqual([people[offset]]);
  });
  it.each(invalidRotations)("rejects $name", (c) =>
    expect(() => rotation(c.players, c.rules, c.offset)).toThrow(),
  );
});
function checkPenalties(penalized: string[]) {
  const input = ids.map((id, i) => ({
    id,
    rating: 1360 - 15 * i,
    seed: i + 1,
    penalized: penalized.includes(id),
  }));
  const before = JSON.stringify(input),
    baseline = allocate(ids, 6);
  const result = initialPlacement(input, 6);
  expect(JSON.stringify(input)).toBe(before);
  expect(result.plan.map((c) => c.length)).toEqual([4, 4, 4, 4, 4, 5]);
  expect([...result.plan.flat()].sort()).toEqual([...ids]);
  expect([...result.applied, ...result.unresolved].sort()).toEqual(
    [...penalized].sort(),
  );
  for (const player of result.applied)
    expect(result.plan.findIndex((c) => c.includes(player))).toBe(
      baseline.findIndex((c) => c.includes(player)) + 1,
    );
  for (const player of result.unresolved)
    expect(result.plan.findIndex((c) => c.includes(player))).toBe(
      baseline.findIndex((c) => c.includes(player)),
    );
  expect(initialPlacement([...input].reverse(), 6)).toEqual(result);
}
describe("300-case review: no-show placement (40)", () => {
  it.each(ids)(
    "one-court penalty for %s, without changing ELO or duplicating players",
    (id) => checkPenalties([id]),
  );
  it.each(penaltyGroups)(
    "$name preserves simultaneous penalty outcomes",
    ({ penalized }) => checkPenalties(penalized),
  );
});
// Separate standings oracle: integer cross-products compare exact win/point ratios.
function orderedCourt(court: string[], results: Result[]) {
  const totals = court.map((id) => {
    const played = results.filter((r) =>
      [...r.game.a, ...r.game.b].includes(id),
    );
    return {
      id,
      games: played.length,
      wins: played.filter((r) =>
        r.game.a.includes(id) ? r.a > r.b : r.b > r.a,
      ).length,
      points: played.reduce(
        (n, r) => n + (r.game.a.includes(id) ? r.a : r.b),
        0,
      ),
      possible: played.reduce((n, r) => n + r.game.target, 0),
    };
  });
  return totals
    .sort(
      (a, b) =>
        b.wins * a.games - a.wins * b.games ||
        b.points * a.possible - a.points * b.possible ||
        a.id.localeCompare(b.id),
    )
    .map((r) => r.id);
}
describe("300-case review: movements and incomplete data (30)", () => {
  it.each(movementScenarios)(
    "$name follows results, with simultaneous adjacent exchanges",
    ({ seed }) => {
      const plan = allocate(ids, 6),
        results = scoresFor(plan, seed),
        before = JSON.stringify({ plan, results });
      const sorted = plan.map((c) => orderedCourt(c, results));
      const next = nextRoundPlacement(plan, results);
      expect(next.map((c) => c.length)).toEqual([4, 4, 4, 4, 4, 5]);
      expect(next.flat().sort()).toEqual([...ids]);
      for (let c = 0; c < 5; c++) {
        expect(next[c + 1]).toContain(sorted[c].at(-1));
        expect(next[c]).toContain(sorted[c + 1][0]);
      }
      expect(next[0]).toContain(sorted[0][0]);
      expect(next[5]).toContain(sorted[5].at(-1));
      expect(nextRoundPlacement(plan, [...results].reverse())).toEqual(next);
      expect(JSON.stringify({ plan, results })).toBe(before);
    },
  );
  it.each(brokenRounds)(
    "rejects $name before moving any players",
    ({ change }) => {
      const plan = allocate(ids, 6),
        original = JSON.stringify(plan);
      expect(() => nextRoundPlacement(plan, change(scoresFor(plan)))).toThrow();
      expect(JSON.stringify(plan)).toBe(original);
    },
  );
});
