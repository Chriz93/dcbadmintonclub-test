export interface Game {
  a: string[];
  b: string[];
  rest: string[];
  target: number;
}
export interface Rules {
  normalTarget: number;
  fiveTarget: number;
  winBy: number;
  cap: number;
}
export const defaultRules: Rules = {
  normalTarget: 21,
  fiveTarget: 15,
  winBy: 1,
  cap: 21,
};
function unique(ids: string[]) {
  if (new Set(ids).size !== ids.length || ids.some((id) => !id))
    throw new Error("Each player must have one unique identity.");
}
export function allocate(
  ids: string[],
  courtCount: number,
  normalSize = 4,
  maxSize = 5,
): string[][] {
  unique(ids);
  if (
    !Number.isInteger(courtCount) ||
    courtCount < 1 ||
    !Number.isInteger(normalSize) ||
    normalSize < 2 ||
    normalSize > 5 ||
    !Number.isInteger(maxSize) ||
    maxSize < normalSize ||
    maxSize > 5
  )
    throw new Error("Invalid court configuration.");
  if (ids.length > courtCount * maxSize)
    throw new Error("Capacity exceeded; use the waitlist.");
  const courts = Array.from({ length: courtCount }, () => [] as string[]);
  let cursor = 0;
  for (const court of courts)
    while (court.length < normalSize && cursor < ids.length)
      court.push(ids[cursor++]);
  // Spread overflow from the lowest court: 25/6 => 4,4,4,4,4,5.
  for (
    let i = courtCount - 1;
    cursor < ids.length;
    i = (i - 1 + courtCount) % courtCount
  )
    if (courts[i].length < maxSize) courts[i].push(ids[cursor++]);
  // Avoid an unplayable singleton when capacity allows redistribution.
  for (let i = 0; i < courts.length; i++)
    if (courts[i].length === 1) {
      const donor = courts.findLast((c) => c.length > 2);
      if (donor) courts[i].unshift(donor.pop()!);
    }
  return courts;
}
export function rotation(
  ids: string[],
  rules: Rules = defaultRules,
  offset = 0,
): Game[] {
  unique(ids);
  if (ids.length < 2 || ids.length > 5)
    throw new Error("A playable court needs 2–5 players.");
  if (!Number.isInteger(offset) || offset < 0)
    throw new Error("Invalid rotation offset.");
  if (
    ![rules.normalTarget, rules.fiveTarget, rules.winBy, rules.cap].every(
      (value) => Number.isInteger(value) && value > 0,
    ) ||
    rules.cap < Math.max(rules.normalTarget, rules.fiveTarget)
  )
    throw new Error("Invalid rotation rules.");
  const game = (a: number[], b: number[], rest: number[] = []) => ({
    a: a.map((i) => ids[i]),
    b: b.map((i) => ids[i]),
    rest: rest.map((i) => ids[i]),
    target: ids.length === 5 ? rules.fiveTarget : rules.normalTarget,
  });
  if (ids.length === 2) return [game([0], [1]), game([0], [1]), game([0], [1])];
  if (ids.length === 3)
    return [game([0], [1], [2]), game([0], [2], [1]), game([1], [2], [0])];
  if (ids.length === 4)
    return [game([0, 1], [2, 3]), game([0, 2], [1, 3]), game([0, 3], [1, 2])];
  // K5 edge decomposition: every pair partners exactly once; every player rests once.
  const rounds = [
    game([1, 4], [2, 3], [0]),
    game([2, 0], [3, 4], [1]),
    game([3, 1], [4, 0], [2]),
    game([4, 2], [0, 1], [3]),
    game([0, 3], [1, 2], [4]),
  ];
  return rounds.slice(offset % 5).concat(rounds.slice(0, offset % 5));
}
export function validateScore(
  a: number,
  b: number,
  target: number,
  winBy = 1,
  cap = target,
) {
  if (
    ![a, b, target, winBy, cap].every(Number.isInteger) ||
    a < 0 ||
    b < 0 ||
    target < 1 ||
    winBy < 1 ||
    cap < target
  )
    throw new Error("Invalid score or rules.");
  const hi = Math.max(a, b),
    lo = Math.min(a, b);
  if (
    hi > cap ||
    hi < target ||
    a === b ||
    (hi < cap && hi - lo < winBy) ||
    (hi > target && hi - lo > winBy)
  )
    throw new Error("Score is not a valid completed game.");
  return a > b ? "a" : "b";
}
export interface Result {
  game: Game;
  a: number;
  b: number;
}
export function rankings(ids: string[], results: Result[]) {
  unique(ids);
  const rows = ids.map((id) => ({
    id,
    played: 0,
    wins: 0,
    points: 0,
    possible: 0,
  }));
  for (const r of results) {
    validateScore(r.a, r.b, r.game.target);
    unique([...r.game.a, ...r.game.b, ...r.game.rest]);
    if (
      r.game.a.length < 1 ||
      r.game.a.length > 2 ||
      r.game.a.length !== r.game.b.length ||
      r.game.rest.some((id) => !ids.includes(id))
    )
      throw new Error("Invalid teams or resting player in result.");
    for (const id of [...r.game.a, ...r.game.b]) {
      const p = rows.find((p) => p.id === id);
      if (!p) throw new Error("Unknown player in result.");
      const onA = r.game.a.includes(id);
      p.played++;
      p.wins += Number(onA ? r.a > r.b : r.b > r.a);
      p.points += onA ? r.a : r.b;
      p.possible += r.game.target;
    }
  }
  return rows
    .map((p) => ({
      ...p,
      winRate: p.played ? p.wins / p.played : 0,
      pointRate: p.possible ? p.points / p.possible : 0,
    }))
    .sort(
      (a, b) =>
        b.winRate - a.winRate ||
        b.pointRate - a.pointRate ||
        a.id.localeCompare(b.id),
    );
}
export function moveCourts(courts: string[][], ordered: string[][]) {
  unique(courts.flat());
  if (courts.length !== ordered.length) throw new Error("Missing rankings.");
  ordered.forEach((r, i) => {
    unique(r);
    if (
      r.length !== courts[i].length ||
      r.some((id) => !courts[i].includes(id))
    )
      throw new Error("Rankings must include each assigned player once.");
  });
  // Adjacent simultaneous swaps preserve court sizes, including the five-player court.
  const next = courts.map((c) => [...c]);
  for (let i = 0; i < courts.length - 1; i++) {
    if (ordered[i].length < 2 || ordered[i + 1].length < 2) continue;
    const down = ordered[i].at(-1)!,
      up = ordered[i + 1][0];
    next[i][next[i].indexOf(down)] = up;
    next[i + 1][next[i + 1].indexOf(up)] = down;
  }
  unique(next.flat());
  return next;
}
