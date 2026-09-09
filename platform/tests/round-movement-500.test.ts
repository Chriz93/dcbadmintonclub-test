import { describe, expect, it } from "vitest";
import {
  courtMovements,
  movementText,
  roundStatus,
} from "../src/domain/round-status";
import {
  baseline,
  finishDemo,
  makeDemo,
  movementRevision,
  nextCourts,
  players,
  publishMovement,
  rateRound,
  recordScore,
  scoreCurrentRound,
} from "../src/demo/model";

const full = finishDemo(makeDemo());
const rounds = full.sessions[3].rounds;
const games = rounds.flatMap((r) =>
  r.matches.map((m) => ({ round: r.number, game: m.id, m })),
);
const members = rounds.flatMap((r) =>
  players.map((p) => ({ round: r.number, player: p.id })),
);
const seeded = scoreCurrentRound(makeDemo());

describe("500 additional game-day regressions", () => {
  describe("80 individual unfinished games block movement", () => {
    it.each(games)("R$round $game waits for its result", ({ round, game }) => {
      const r = structuredClone(rounds[round - 1]);
      Object.assign(
        r.matches.find((m) => m.id === game)!,
        { scoreA: null, scoreB: null },
      );
      const status = roundStatus(r.courts, r.matches);
      expect(status.state).toBe("playing");
      expect(status.completed).toBe(19);
      expect(status.expected).toBe(20);
      expect(
        status.courts.filter((c) => c.completed < c.expected),
      ).toHaveLength(1);
      expect(() => nextCourts(r)).toThrow(/Finish every game/);
    });
  });
  describe("80 deleted games cannot lower the completion target", () => {
    it.each(games)(
      "R$round missing $game cannot publish",
      ({ round, game }) => {
        const r = structuredClone(rounds[round - 1]);
        r.matches = r.matches.filter((m) => m.id !== game);
        expect(roundStatus(r.courts, r.matches)).toMatchObject({
          state: "invalid",
          expected: 20,
          completed: 19,
        });
        expect(() => nextCourts(r)).toThrow(/every game/);
      },
    );
  });
  describe("80 wrong-court results cannot count on another court", () => {
    it.each(games)(
      "R$round $game validates assignment ownership",
      ({ round, game }) => {
        const r = structuredClone(rounds[round - 1]);
        const m = r.matches.find((m) => m.id === game)!;
        m.court = (m.court % 6) + 1;
        expect(roundStatus(r.courts, r.matches)).toMatchObject({
          state: "invalid",
          error: "Game does not belong to its assigned court.",
        });
        expect(() => nextCourts(r)).toThrow(/assigned court/);
      },
    );
  });
  describe("100 published player movements match independently ranked results", () => {
    it.each(members)(
      "R$round $player has an explicit stable movement",
      ({ round, player }) => {
        const r = rounds[round - 1],
          from = r.courts.findIndex((c) => c.includes(player)) + 1;
        // Independent integer cross-product ranking, not the implementation's ranking helper.
        const rows = r.courts[from - 1]
          .map((id) => {
            let wins = 0,
              points = 0,
              played = 0,
              possible = 0;
            for (const m of r.matches) {
              if (![...m.a, ...m.b].includes(id)) continue;
              const own = m.a.includes(id) ? m.scoreA! : m.scoreB!,
                other = m.a.includes(id) ? m.scoreB! : m.scoreA!;
              wins += Number(own > other);
              points += own;
              played++;
              possible += m.target;
            }
            return { id, wins, points, played, possible };
          })
          .sort(
            (a, b) =>
              b.wins * a.played - a.wins * b.played ||
              b.points * a.possible - a.points * b.possible ||
              a.id.localeCompare(b.id),
          );
        const to =
          rows[0].id === player && from > 1
            ? from - 1
            : rows.at(-1)!.id === player && from < 6
              ? from + 1
              : from;
        const movement = courtMovements(r.courts, r.publishedNext!).find(
          (m) => m.id === player,
        )!;
        expect(movement).toEqual({
          id: player,
          from,
          to,
          direction: to < from ? "up" : to > from ? "down" : "stayed",
        });
        expect(movementText(movement)).toBe(
          to === from
            ? `Stayed C${to}`
            : `${to < from ? "↑ Moved up" : "↓ Moved down"} C${from} → C${to}`,
        );
        expect(r.publishedNext!.map((c) => c.length)).toEqual([
          4, 4, 4, 4, 4, 5,
        ]);
      },
    );
  });
  describe("80 corrections preserve court history and replay official ELO reversibly", () => {
    it.each(games)(
      "R$round correction of $game preserves all played and published courts",
      ({ game, m }) => {
        const snapshot = full.sessions.map((s) =>
          s.rounds.map((r) => [r.courts, r.publishedNext]),
        );
        const changed = recordScore(
          full,
          game,
          m.scoreB!,
          m.scoreA!,
          "admin",
          "demo-01",
          "Winner correction reviewed",
          m.revision,
        );
        expect(changed.sessions[3].after).not.toEqual(full.sessions[3].after);
        expect(
          changed.sessions.map((s) =>
            s.rounds.map((r) => [r.courts, r.publishedNext]),
          ),
        ).toEqual(snapshot);
        const restored = recordScore(
          changed,
          game,
          m.scoreA!,
          m.scoreB!,
          "admin",
          "demo-01",
          "Reversal reviewed",
          m.revision + 1,
        );
        expect(restored.sessions.map((s) => s.after)).toEqual(
          full.sessions.map((s) => s.after),
        );
        expect(restored.audit[0]).toContain("Reversal reviewed");
      },
    );
  });
  describe("40 ELO data-integrity checks", () => {
    it.each(rounds[0].matches.map((m) => ({ game: m.id, m })))(
      "$game rejects unknown rated participant",
      ({ m }) => {
        const copy = structuredClone(m);
        copy.a[0] = "unregistered";
        expect(() => rateRound(baseline(), [copy])).toThrow(/known players/);
      },
    );
    it.each(rounds[0].matches.map((m) => ({ game: m.id, m })))(
      "$game rejects duplicate contribution",
      ({ m }) => {
        expect(() => rateRound(baseline(), [m, structuredClone(m)])).toThrow(
          /Duplicate game/,
        );
      },
    );
  });
  describe("20 stale score writes are rejected without modifying the saved game", () => {
    it.each(
      seeded.sessions[3].rounds[0].matches.map((m) => ({ game: m.id, m })),
    )("$game protects revision 1", ({ m }) => {
      const snapshot = JSON.stringify(seeded);
      expect(() =>
        recordScore(
          seeded,
          m.id,
          m.scoreB!,
          m.scoreA!,
          "admin",
          "demo-01",
          "Concurrent correction",
          0,
        ),
      ).toThrow(/changed/);
      expect(JSON.stringify(seeded)).toBe(snapshot);
    });
  });
  describe("20 changed scores invalidate an administrator movement preview", () => {
    it.each(
      seeded.sessions[3].rounds[0].matches.map((m) => ({ game: m.id, m })),
    )("$game needs movement re-review", ({ m }) => {
      const token = movementRevision(seeded.sessions[3].rounds[0]);
      const changed = recordScore(
        seeded,
        m.id,
        m.scoreB!,
        m.scoreA!,
        "admin",
        "demo-01",
        "Correct before publishing",
        1,
      );
      expect(() => publishMovement(changed, token)).toThrow(
        /Review movement again/,
      );
      const moved = publishMovement(
        changed,
        movementRevision(changed.sessions[3].rounds[0]),
      );
      expect(moved.sessions[3].rounds).toHaveLength(2);
      expect(moved.sessions[3].rounds[0].publishedNext!.flat().sort()).toEqual(
        players.map((p) => p.id).sort(),
      );
      expect(() => publishMovement(moved, token)).toThrow(
        /Review movement again/,
      );
    });
  });
});
