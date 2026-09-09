import { describe, it, expect } from "vitest";
import {
  makeDemo,
  allMatches,
  requestDemoCorrection,
  resolveDemoCorrection,
  recordScore,
  currentRatings,
} from "../src/demo/model";
const fixture = () => {
  const state = makeDemo(),
    match = allMatches(state).find(
      (m) => m.scoreA !== null && m.scoreB !== null,
    )!;
  return { state, match, user: match.a[0] };
};
function request() {
  const { state, match, user } = fixture();
  return {
    state: requestDemoCorrection(
      state,
      match.id,
      user,
      match.scoreB!,
      match.scoreA!,
      "Wrong winning team",
      match.revision,
    ),
    match,
    user,
  };
}
describe("demo correction lifecycle", () => {
  it("keeps a request pending without changing official results or ELO", () => {
    const before = makeDemo(),
      { state } = request();
    expect(allMatches(state)).toEqual(allMatches(before));
    expect(currentRatings(state)).toEqual(currentRatings(before));
    expect(state.reviews[0].status).toBe("open");
    expect(before.reviews).toEqual([]);
  });
  it("accepts once, rebuilds later ELO, and preserves played and published courts", () => {
    const { state, match } = request(),
      accepted = resolveDemoCorrection(
        state,
        state.reviews[0].id,
        true,
        "Confirmed with teams",
        "admin",
      );
    expect(accepted.reviews[0].status).toBe("accepted");
    expect(allMatches(accepted).find((m) => m.id === match.id)).toMatchObject({
      scoreA: match.scoreB,
      scoreB: match.scoreA,
      revision: match.revision + 1,
    });
    expect(currentRatings(accepted)).not.toEqual(currentRatings(state));
    for (let i = 0; i < 4; i++) {
      expect(
        accepted.sessions[i].rounds.map((r) => [r.courts, r.publishedNext]),
      ).toEqual(
        state.sessions[i].rounds.map((r) => [r.courts, r.publishedNext]),
      );
      expect(accepted.sessions[i].finalCourts).toEqual(
        state.sessions[i].finalCourts,
      );
    }
    expect(() =>
      resolveDemoCorrection(
        accepted,
        accepted.reviews[0].id,
        true,
        "Try a second time",
        "admin",
      ),
    ).toThrow(/already reviewed/);
  });
  it("declines without touching results, ratings, or the original state", () => {
    const { state } = request(),
      after = resolveDemoCorrection(
        state,
        state.reviews[0].id,
        false,
        "Original score confirmed",
        "admin",
      );
    expect(after.reviews[0].status).toBe("declined");
    expect(allMatches(after)).toEqual(allMatches(state));
    expect(currentRatings(after)).toEqual(currentRatings(state));
    expect(state.reviews[0].status).toBe("open");
  });
  it("rejects duplicate requests", () => {
    const { state, match, user } = request();
    expect(() =>
      requestDemoCorrection(
        state,
        match.id,
        user,
        match.scoreB!,
        match.scoreA!,
        "Second attempt",
        match.revision,
      ),
    ).toThrow(/already awaiting/);
  });
  it("rejects a nonparticipant", () => {
    const { state, match } = fixture();
    expect(() =>
      requestDemoCorrection(
        state,
        match.id,
        "outsider",
        match.scoreB!,
        match.scoreA!,
        "Not my match",
        match.revision,
      ),
    ).toThrow(/game you played/);
  });
  it("rejects a request for an unscored game", () => {
    const { state } = fixture(),
      m = allMatches(state).find((m) => m.scoreA === null)!;
    expect(() =>
      requestDemoCorrection(
        state,
        m.id,
        m.a[0],
        m.target,
        0,
        "No score exists",
        m.revision,
      ),
    ).toThrow(/saved game/);
  });
  it("rejects a player resolving their own request", () => {
    const { state } = request();
    expect(() =>
      resolveDemoCorrection(
        state,
        state.reviews[0].id,
        true,
        "Self approved",
        "player",
      ),
    ).toThrow(/Only Christy/);
  });
  it("rejects stale submission and approval without overwriting a newer score", () => {
    const { state, match, user } = request();
    expect(() =>
      requestDemoCorrection(
        state,
        match.id,
        user,
        match.scoreB!,
        match.scoreA!,
        "Stale request",
        match.revision - 1,
      ),
    ).toThrow(/result changed/);
    const changed = recordScore(
      state,
      match.id,
      match.target,
      0,
      "admin",
      user,
      "Independent correction",
      match.revision,
    );
    expect(() =>
      resolveDemoCorrection(
        changed,
        state.reviews[0].id,
        true,
        "Late approval",
        "admin",
      ),
    ).toThrow(/result changed/);
    expect(changed.reviews[0].status).toBe("open");
    expect(
      resolveDemoCorrection(
        changed,
        state.reviews[0].id,
        false,
        "Already corrected",
        "admin",
      ).reviews[0].status,
    ).toBe("declined");
  });
  it.each(["", "abcd", "x".repeat(501)])(
    "requires a bounded reason (%s)",
    (reason) => {
      const { state, match, user } = fixture();
      expect(() =>
        requestDemoCorrection(
          state,
          match.id,
          user,
          match.scoreB!,
          match.scoreA!,
          reason,
          match.revision,
        ),
      ).toThrow(/5–500/);
      const requested = request().state;
      expect(() =>
        resolveDemoCorrection(
          requested,
          requested.reviews[0].id,
          true,
          reason,
          "admin",
        ),
      ).toThrow(/5–500/);
    },
  );
  it("rejects a tied proposed score", () => {
    const { state, match, user } = fixture();
    expect(() =>
      requestDemoCorrection(
        state,
        match.id,
        user,
        match.target,
        match.target,
        "Tied game request",
        match.revision,
      ),
    ).toThrow(/valid completed/);
  });
});
