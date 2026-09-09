import { defaultRules, validateScore, type Game, type Rules } from "./courts";
import { nextRoundPlacement } from "./placement";

export interface RoundGame extends Game {
  id: string;
  court: number;
  scoreA: number | null;
  scoreB: number | null;
}

/** Assignment-derived totals: a deleted game must never make a round look finished. */
export function roundStatus(
  courts: string[][],
  matches: RoundGame[],
  rules: Pick<Rules, "normalTarget" | "fiveTarget"> = defaultRules,
) {
  const progress = courts.map((ids, index) => ({
    court: index + 1,
    expected: ids.length === 0 ? 0 : ids.length === 5 ? 5 : 3,
    completed: matches.filter(
      (m) => m.court === index + 1 && m.scoreA !== null && m.scoreB !== null,
    ).length,
  }));
  const expected = progress.reduce((n, c) => n + c.expected, 0);
  const completed = progress.reduce((n, c) => n + c.completed, 0);
  try {
    if (!expected) throw new Error("No playable courts assigned.");
    if (
      new Set(matches.map((m) => m.id)).size !== matches.length ||
      matches.some((m) => !m.id)
    )
      throw new Error("Duplicate or missing game identity.");
    for (const m of matches) {
      const ids = courts[m.court - 1];
      if (
        !Number.isInteger(m.court) ||
        !ids ||
        [...m.a, ...m.b, ...m.rest].some((id) => !ids.includes(id))
      )
        throw new Error("Game does not belong to its assigned court.");
      if ((m.scoreA === null) !== (m.scoreB === null))
        throw new Error("Both scores are required.");
      if (m.scoreA !== null && m.scoreB !== null)
        validateScore(m.scoreA, m.scoreB, m.target);
    }
    // Validate the entire schedule, including unscored games, before trusting the counters.
    nextRoundPlacement(
      courts,
      matches.map((m) => ({
        game: m,
        a: m.scoreA ?? m.target,
        b: m.scoreB ?? 0,
      })),
      rules,
    );
    return {
      state:
        completed === expected
          ? ("ready" as const)
          : completed
            ? ("playing" as const)
            : ("not_started" as const),
      expected,
      completed,
      courts: progress,
      error: null,
    };
  } catch (error) {
    return {
      state: "invalid" as const,
      expected,
      completed,
      courts: progress,
      error: (error as Error).message,
    };
  }
}

export interface CourtMovement {
  id: string;
  from: number | null;
  to: number | null;
  direction: "up" | "down" | "stayed" | "joined" | "sat_out";
}

/** Use saved assignments, never today's recalculated rankings, for published history. */
export function courtMovements(
  before: string[][],
  after: string[][],
): CourtMovement[] {
  for (const courts of [before, after]) {
    const ids = courts.flat();
    if (ids.some((id) => !id) || new Set(ids).size !== ids.length)
      throw new Error("Each player must have one court.");
  }
  return [...new Set([...before.flat(), ...after.flat()])].map((id) => {
    const from = before.findIndex((ids) => ids.includes(id)) + 1 || null;
    const to = after.findIndex((ids) => ids.includes(id)) + 1 || null;
    return {
      id,
      from,
      to,
      direction:
        from === null
          ? "joined"
          : to === null
            ? "sat_out"
            : to < from
              ? "up"
              : to > from
                ? "down"
                : "stayed",
    };
  });
}

export function movementText(m: CourtMovement) {
  if (m.direction === "joined") return `Joined C${m.to}`;
  if (m.direction === "sat_out") return `Sitting out · was C${m.from}`;
  if (m.direction === "stayed") return `Stayed C${m.to}`;
  return `${m.direction === "up" ? "↑ Moved up" : "↓ Moved down"} C${m.from} → C${m.to}`;
}
