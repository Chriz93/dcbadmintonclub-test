import { describe, expect, it } from "vitest";
import {
  activeCourts,
  allMatches,
  baseline,
  courtFor,
  currentRatings,
  finishDemo,
  makeDemo,
  nextCourts,
  players,
  publishMovement,
  rateRound,
  recordScore,
  scoreCurrentRound,
  scored,
  statsFor,
} from "../src/demo/model";

describe("populated game-day demonstration", () => {
  it("has 25 unique players, three full histories, and an unplayed active night", () => {
    const demo = makeDemo();
    expect(new Set(players.map((p) => p.id)).size).toBe(25);
    expect(demo.sessions.filter((s) => s.complete)).toHaveLength(3);
    expect(allMatches(demo).filter(scored)).toHaveLength(240);
    expect(demo.sessions[3].rounds[0].matches.every((m) => !scored(m))).toBe(
      true,
    );
    for (const p of players)
      expect(statsFor(allMatches(demo), p.id).games).toBeGreaterThanOrEqual(36);
  });
  it("conserves all players and accounts for every five-player rest in every round", () => {
    const demo = finishDemo(makeDemo());
    for (const s of demo.sessions)
      for (const r of s.rounds) {
        expect(r.courts.map((c) => c.length)).toEqual([4, 4, 4, 4, 4, 5]);
        expect(new Set(r.courts.flat()).size).toBe(25);
        expect(r.matches).toHaveLength(20);
        expect(
          r.matches
            .filter((m) => m.court === 6)
            .flatMap((m) => m.rest)
            .sort(),
        ).toEqual([...r.courts[5]].sort());
        expect(r.publishedNext?.flat().sort()).toEqual(
          players.map((p) => p.id).sort(),
        );
      }
    expect(allMatches(demo)).toHaveLength(320);
  });
  it("refuses movement from an incomplete round", () => {
    expect(() => publishMovement(makeDemo())).toThrow(/Finish every game/);
  });
  it("separates official ELO from provisional live results", () => {
    const start = makeDemo(),
      scoredRound = scoreCurrentRound(start);
    expect(currentRatings(scoredRound)).toEqual(currentRatings(start));
    const moved = publishMovement(scoredRound);
    expect(moved.sessions[3].rounds).toHaveLength(2);
    expect(currentRatings(moved)).toEqual(currentRatings(start));
    expect(currentRatings(finishDemo(moved))).not.toEqual(
      currentRatings(start),
    );
  });
  it("records final movement without inventing a fifth played round", () => {
    const state = finishDemo(makeDemo()),
      s = state.sessions[3];
    expect(s.rounds).toHaveLength(4);
    expect(s.finalCourts).toEqual(nextCourts(s.rounds[3]));
    expect(s.finalCourts).not.toEqual(s.rounds[3].courts);
    expect(activeCourts(state)).toEqual(s.finalCourts);
    expect(s.rounds.flatMap((r) => r.matches)).toHaveLength(80);
  });
  it("permits only a participant's first submission and rejects invalid scores", () => {
    const state = makeDemo(),
      m = state.sessions[3].rounds[0].matches[0];
    expect(() => recordScore(state, m.id, 21, 18, "player", "demo-25")).toThrow(
      /own matches/,
    );
    expect(() => recordScore(state, m.id, 21, 21, "player", m.a[0])).toThrow(
      /valid completed/,
    );
    const saved = recordScore(state, m.id, 21, 18, "player", m.a[0]);
    expect(() => recordScore(saved, m.id, 18, 21, "player", m.b[0])).toThrow(
      /already saved/,
    );
    expect(() => recordScore(saved, m.id, 18, 21, "admin", "demo-01")).toThrow(
      /reason/,
    );
    expect(state.sessions[3].rounds[0].matches[0].scoreA).toBeNull();
  });
  it("chronologically rebuilds ELO after correction and restores exactly on reversal", () => {
    const state = finishDemo(makeDemo()),
      m = state.sessions[0].rounds[0].matches[0];
    const changed = recordScore(
      state,
      m.id,
      m.scoreB!,
      m.scoreA!,
      "admin",
      "demo-01",
      "Correct winner after review",
    );
    expect(currentRatings(changed)).not.toEqual(currentRatings(state));
    expect(changed.sessions[3].before).not.toEqual(state.sessions[3].before);
    expect(changed.sessions.map((s) => s.rounds.map((r) => r.courts))).toEqual(
      state.sessions.map((s) => s.rounds.map((r) => r.courts)),
    );
    const restored = recordScore(
      changed,
      m.id,
      m.scoreA!,
      m.scoreB!,
      "admin",
      "demo-01",
      "Restore the original score",
    );
    expect(currentRatings(restored)).toEqual(currentRatings(state));
    expect(restored.audit[0]).toContain("Restore the original score");
  });
  it("matches the ELO expected-score oracle for a four-person equal-rating court", () => {
    const state = makeDemo(),
      m = { ...state.sessions[3].rounds[0].matches[0], scoreA: 21, scoreB: 10 };
    const equal = Object.fromEntries(players.map((p) => [p.id, 1000]));
    const rating = rateRound(equal, [m]);
    for (const id of m.a) expect(rating[id]).toBe(1016);
    for (const id of m.b) expect(rating[id]).toBe(984);
    expect(rating["demo-25"]).toBe(1000);
  });
  it("keeps statistics, rating snapshots and player histories consistent", () => {
    const state = finishDemo(makeDemo()),
      matches = allMatches(state);
    expect(players.reduce((n, p) => n + statsFor(matches, p.id).games, 0)).toBe(
      1280,
    );
    expect(players.reduce((n, p) => n + statsFor(matches, p.id).wins, 0)).toBe(
      640,
    );
    expect(
      Object.values(currentRatings(state)).reduce((a, b) => a + b, 0),
    ).toBeCloseTo(
      Object.values(baseline()).reduce((a, b) => a + b, 0),
      8,
    );
    for (let i = 1; i < state.sessions.length; i++)
      expect(state.sessions[i].before).toEqual(state.sessions[i - 1].after);
    expect(courtFor(activeCourts(state), "demo-13")).toBeGreaterThan(0);
  });
  it("makes finishing idempotent and never scores a phantom fifth round", () => {
    const state = finishDemo(makeDemo());
    expect(finishDemo(state)).toEqual(state);
    expect(() => publishMovement(state)).toThrow(/already complete/);
  });
});
