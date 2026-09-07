import { allocate, moveCourts, rankings, type Result } from "./courts";
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
export function nextRoundPlacement(courts: string[][], results: Result[]) {
  if (!results.length) throw new Error("Complete the previous round first");
  const ordered = courts.map((ids) =>
    rankings(
      ids,
      results.filter((r) => r.game.a.some((id) => ids.includes(id))),
    ).map((r) => r.id),
  );
  return moveCourts(courts, ordered);
}
