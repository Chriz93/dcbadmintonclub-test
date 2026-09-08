import {
  defaultRules,
  rotation,
  type Result,
  type Rules,
} from "../../src/domain/courts";
export const ids = Array.from(
  { length: 25 },
  (_, i) => `P${String(i + 1).padStart(2, "0")}`,
);
export const terminalScores = [15, 21].flatMap((target) =>
  Array.from({ length: target }, (_, loser) => [
    {
      name: `${target}–${loser}, side A wins`,
      target,
      a: target,
      b: loser,
      winner: "a",
    },
    {
      name: `${loser}–${target}, side B wins`,
      target,
      a: loser,
      b: target,
      winner: "b",
    },
  ]).flat(),
); // 72 distinct possible completed scores under the league rules.
export const invalidScores = [15, 21].flatMap((target) => [
  { name: `target ${target}: no points`, target, a: 0, b: 0 },
  { name: `target ${target}: equal at target`, target, a: target, b: target },
  {
    name: `target ${target}: equal below target`,
    target,
    a: target - 1,
    b: target - 1,
  },
  { name: `target ${target}: side A unfinished`, target, a: target - 1, b: 0 },
  { name: `target ${target}: side B unfinished`, target, a: 0, b: target - 1 },
  {
    name: `target ${target}: side A over cap`,
    target,
    a: target + 1,
    b: target - 1,
  },
  {
    name: `target ${target}: side B over cap`,
    target,
    a: target - 1,
    b: target + 1,
  },
  { name: `target ${target}: negative A`, target, a: -1, b: target },
  { name: `target ${target}: negative B`, target, a: target, b: -1 },
  {
    name: `target ${target}: neither terminal after cap`,
    target,
    a: target + 2,
    b: target + 1,
  },
]); // 20
export const allocationCounts = Array.from({ length: 31 }, (_, n) => n); // 31
export const overCapacity = [31, 32, 33, 34, 35, 36]; // 6
export const invalidAllocations = [
  { name: "duplicate identity", ids: ["a", "a"], courts: 6, normal: 4, max: 5 },
  { name: "empty identity", ids: ["a", ""], courts: 6, normal: 4, max: 5 },
  { name: "zero courts", ids: ["a", "b"], courts: 0, normal: 4, max: 5 },
  {
    name: "fractional courts",
    ids: ["a", "b"],
    courts: 1.5,
    normal: 4,
    max: 5,
  },
  {
    name: "singleton normal size",
    ids: ["a", "b"],
    courts: 6,
    normal: 1,
    max: 5,
  },
  {
    name: "maximum below normal",
    ids: ["a", "b"],
    courts: 6,
    normal: 4,
    max: 3,
  },
]; // 6
export const rotations = [2, 3, 4, 5].flatMap((size) =>
  [0, 1, 2, 3, 4].map((offset) => ({
    name: `${size} players, rotation offset ${offset}`,
    size,
    offset,
  })),
); // 20
export const invalidRotations: {
  name: string;
  players: string[];
  offset: number;
  rules: Rules;
}[] = [
  { name: "empty court", players: [], offset: 0, rules: defaultRules },
  { name: "one player", players: ["a"], offset: 0, rules: defaultRules },
  {
    name: "six players",
    players: ids.slice(0, 6),
    offset: 0,
    rules: defaultRules,
  },
  {
    name: "duplicate player",
    players: ["a", "a"],
    offset: 0,
    rules: defaultRules,
  },
  { name: "blank player", players: ["a", ""], offset: 0, rules: defaultRules },
  {
    name: "negative offset",
    players: ids.slice(0, 5),
    offset: -1,
    rules: defaultRules,
  },
  {
    name: "fractional offset",
    players: ids.slice(0, 5),
    offset: 0.5,
    rules: defaultRules,
  },
  {
    name: "zero normal target",
    players: ids.slice(0, 4),
    offset: 0,
    rules: { ...defaultRules, normalTarget: 0 },
  },
  {
    name: "zero five-player target",
    players: ids.slice(0, 5),
    offset: 0,
    rules: { ...defaultRules, fiveTarget: 0 },
  },
  {
    name: "invalid cap",
    players: ids.slice(0, 4),
    offset: 0,
    rules: { ...defaultRules, cap: -1 },
  },
]; // 10
export const penaltyGroups = [
  [0, 1],
  [3, 4],
  [7, 8],
  [11, 12],
  [15, 16],
  [19, 20],
  [0, 4, 8, 12, 16, 20],
  [3, 7, 11, 15, 19, 24],
  [0, 1, 2, 3],
  [4, 5, 6, 7],
  [16, 17, 18, 19],
  [20, 21, 22, 23, 24],
  [0, 1, 2, 3, 4, 5, 6, 7],
  [16, 17, 18, 19, 20, 21, 22, 23, 24],
  Array.from({ length: 25 }, (_, i) => i),
].map((indices, i) => ({
  name: `group ${i + 1}: ${indices.map((j) => ids[j]).join(", ")}`,
  penalized: indices.map((j) => ids[j]),
})); // 15 + 25 single-player positions
export const movementScenarios = Array.from({ length: 20 }, (_, seed) => ({
  name: `complete 25-player round, score pattern ${seed + 1}`,
  seed,
}));
export function scoresFor(plan: string[][], seed = 0): Result[] {
  return plan.flatMap((court, c) =>
    court.length
      ? rotation(court).map((game, g) => {
          const loss = (seed * 7 + c * 3 + g * 5) % game.target;
          const winA = (seed + g + c) % 2 === 0;
          return {
            game,
            a: winA ? game.target : loss,
            b: winA ? loss : game.target,
          };
        })
      : [],
  );
}
export const brokenRounds: {
  name: string;
  change: (results: Result[]) => Result[];
}[] = [
  { name: "missing game", change: (r) => r.slice(1) },
  { name: "missing entire court", change: (r) => r.slice(3) },
  {
    name: "duplicated game replaces another",
    change: (r) => [r[0], r[0], ...r.slice(2)],
  },
  { name: "extra game", change: (r) => [...r, r[0]] },
  {
    name: "unknown participant",
    change: (r) => {
      r[0].game.a[0] = "outsider";
      return r;
    },
  },
  {
    name: "same player on both teams",
    change: (r) => {
      r[0].game.b[0] = r[0].game.a[0];
      return r;
    },
  },
  {
    name: "empty team",
    change: (r) => {
      r[0].game.a = [];
      return r;
    },
  },
  {
    name: "unequal team size",
    change: (r) => {
      r[0].game.b.pop();
      return r;
    },
  },
  {
    name: "unknown resting player",
    change: (r) => {
      r.at(-1)!.game.rest = ["outsider"];
      return r;
    },
  },
  {
    name: "wrong court target",
    change: (r) => {
      r[0].game.target = 15;
      r[0].a = 15;
      r[0].b = 0;
      return r;
    },
  },
];
export const matrixCount =
  terminalScores.length +
  invalidScores.length +
  allocationCounts.length +
  overCapacity.length +
  invalidAllocations.length +
  rotations.length +
  invalidRotations.length +
  ids.length +
  penaltyGroups.length +
  movementScenarios.length +
  brokenRounds.length +
  25 +
  40;
if (matrixCount !== 300)
  throw new Error(
    `Regression matrix must contain 300 distinct cases, found ${matrixCount}`,
  );
