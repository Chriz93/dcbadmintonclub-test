import {
  allocate,
  moveCourts,
  rankings,
  defaultRules,
  type Rules,
  type Result,
} from "./courts";
export function initialPlacement(
  players: { id: string; rating: number; seed: number; penalized: boolean }[],
  courts: number,
) {
  if (
    players.some((p) => !Number.isFinite(p.rating) || !Number.isFinite(p.seed))
  )
    throw new Error("Invalid rating or seed");
  const sorted = [...players].sort(
    (a, b) =>
      b.rating - a.rating || a.seed - b.seed || a.id.localeCompare(b.id),
  );
  const plan = allocate(
    sorted.map((p) => p.id),
    courts,
  );
  const penalized = new Set(
    players.filter((p) => p.penalized).map((p) => p.id),
  );
  const applied: string[] = [],
    unresolved: string[] = [];
  for (const p of sorted.filter((p) => p.penalized)) {
    const original = allocate(
      sorted.map((x) => x.id),
      courts,
    ).findIndex((c) => c.includes(p.id));
    const from = plan.findIndex((c) => c.includes(p.id));
    const target = original + 1;
    if (target >= plan.length || !plan[target].length) {
      unresolved.push(p.id);
      continue;
    }
    const replacement = plan[target].find((id) => !penalized.has(id));
    if (!replacement) {
      unresolved.push(p.id);
      continue;
    }
    plan[from][plan[from].indexOf(p.id)] = replacement;
    plan[target][plan[target].indexOf(replacement)] = p.id;
    applied.push(p.id);
  }
  return { plan, applied, unresolved };
}
/**
 * On a five-player court the lineup position decides who rests first (position 1 rests game 1,
 * position 2 rests game 2, and so on). Rotating the lineup by one place each round moves that
 * first rest to a different player, so nobody keeps the same rest slot round after round.
 */
export function rotateRestOrder(courts: string[][]) {
  return courts.map((c) => (c.length === 5 ? [...c.slice(1), c[0]] : [...c]));
}
export function nextRoundPlacement(
  courts: string[][],
  results: Result[],
  rules: Pick<Rules, "normalTarget" | "fiveTarget"> = defaultRules,
) {
  if (!results.length) throw new Error("Complete the previous round first");
  // Validate a complete round before ranking. Counting wins alone silently accepted
  // missing games/courts, duplicated games and incomplete teams. Partner coverage is
  // independent of lineup order, including historical rows without saved ordinals.
  const assigned = courts.flat();
  if (
    new Set(assigned).size !== assigned.length ||
    assigned.some((id) => !id) ||
    results.some((r) => !assigned.includes(r.game.a[0]))
  )
    throw new Error("Invalid round participants");
  for (const ids of courts) {
    const games = results.filter((r) => ids.includes(r.game.a[0]));
    if (!ids.length && !games.length) continue;
    const size = ids.length,
      expected = size === 5 ? 5 : 3;
    if (size < 2 || size > 5 || games.length !== expected)
      throw new Error(
        "Complete every game on every court before moving players",
      );
    const partners = new Set<string>();
    const rests = new Map<string, number>();
    for (const { game } of games) {
      const all = [...game.a, ...game.b, ...game.rest];
      const teamSize = size < 4 ? 1 : 2;
      if (
        game.a.length !== teamSize ||
        game.b.length !== teamSize ||
        all.length !== size ||
        new Set(all).size !== size ||
        all.some((id) => !ids.includes(id)) ||
        game.target !== (size === 5 ? rules.fiveTarget : rules.normalTarget)
      )
        throw new Error(
          "Invalid teams, rest order or target in the previous round",
        );
      const pairs = size < 4 ? [[...game.a, ...game.b]] : [game.a, game.b];
      for (const pair of pairs) {
        const key = JSON.stringify([...pair].sort());
        if (size > 2 && partners.has(key))
          throw new Error("Duplicate pairing in the previous round");
        partners.add(key);
      }
      for (const id of game.rest) rests.set(id, (rests.get(id) ?? 0) + 1);
    }
    if ((size === 3 || size === 5) && ids.some((id) => rests.get(id) !== 1))
      throw new Error("Every player must rest once on this court");
  }
  const ordered = courts.map((ids) =>
    rankings(
      ids,
      results.filter((r) => r.game.a.some((id) => ids.includes(id))),
    ).map((r) => r.id),
  );
  return rotateRestOrder(moveCourts(courts, ordered));
}
