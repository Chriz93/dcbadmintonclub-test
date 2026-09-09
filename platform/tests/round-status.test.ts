import { expect, it } from "vitest";
import {
  courtMovements,
  movementText,
  roundStatus,
} from "../src/domain/round-status";
import { allocate } from "../src/domain/courts";
import { baseline, fillRound, makeRound, rateRound } from "../src/demo/model";

it.each([2, 3, 4, 5, 6, 7, 8, 9, 10, 24, 25, 26, 30])(
  "%i attendees have assignment-derived totals and complete legal rotations",
  (count) => {
    const courts = allocate(
      Array.from({ length: count }, (_, i) => `p${i}`),
      6,
    );
    const round = makeRound(1, 1, courts);
    const expected = courts.reduce(
      (n, c) => n + (c.length === 5 ? 5 : c.length ? 3 : 0),
      0,
    );
    expect(roundStatus(courts, round.matches)).toMatchObject({
      state: "not_started",
      expected,
      completed: 0,
    });
    const filled = fillRound(round);
    expect(roundStatus(courts, filled.matches)).toMatchObject({
      state: "ready",
      expected,
      completed: expected,
    });
  },
);
it("joining and sitting out are not described as promotions or penalties", () => {
  const changes = courtMovements(
    [
      ["a", "b"],
      ["c", "d"],
    ],
    [
      ["a", "new"],
      ["b", "d"],
    ],
  );
  expect(changes.find((m) => m.id === "c")).toEqual({
    id: "c",
    from: 2,
    to: null,
    direction: "sat_out",
  });
  expect(movementText(changes.find((m) => m.id === "new")!)).toBe("Joined C1");
  expect(movementText(changes.find((m) => m.id === "c")!)).toBe(
    "Sitting out · was C2",
  );
});
it("duplicate saved assignments cannot manufacture two court movements for a player", () => {
  expect(() => courtMovements([["a"], ["a"]], [["a"]])).toThrow(/one court/);
  expect(() => courtMovements([["a"]], [["a"], ["a"]])).toThrow(/one court/);
});
it("partially entered scores need repair before automatic fill or movement", () => {
  const r = makeRound(1, 1, [["a", "b", "c", "d"]]);
  r.matches[0].scoreA = 21;
  expect(roundStatus(r.courts, r.matches)).toMatchObject({
    state: "invalid",
    error: "Both scores are required.",
  });
});
it("a repeated game identity cannot count twice even with different teams", () => {
  const r = fillRound(makeRound(1, 1, [["a", "b", "c", "d"]]));
  r.matches[1].id = r.matches[0].id;
  expect(roundStatus(r.courts, r.matches).state).toBe("invalid");
});
it("empty or singleton courts cannot complete a round", () => {
  expect(roundStatus([[], []], []).state).toBe("invalid");
  expect(roundStatus([["alone"]], []).state).toBe("invalid");
});
it.each([NaN, Infinity, -Infinity])(
  "invalid ELO %s cannot contaminate the season",
  (rating) => {
    expect(() => rateRound({ ...baseline(), "demo-01": rating }, [])).toThrow(
      /finite/,
    );
  },
);
