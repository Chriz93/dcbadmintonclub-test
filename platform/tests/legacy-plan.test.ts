import { it, expect } from "vitest";
import { planLegacy } from "../scripts/legacy-plan";
const players = [
  {
    id: 1,
    name: "PRIVATE PLAYER",
    email: "private@example.invalid",
    medical: "PRIVATE MEDICAL",
    paid: true,
    waiver_signed: true,
  },
  { id: "2", name: "Second" },
];
const session = {
  id: 100,
  date: "2026-04-07",
  scores: {
    c1_y1_g1: { a1: 1, a2: null, b1: "2", b2: null, sA: 21, sB: 15, w: "A" },
  },
  movements: [{ opaque: "Preserved in source" }],
};
it("reads old downloaded S backups without importing consent, payment or seeding", () => {
  const p = planLegacy(
    JSON.stringify({ players, sessions: [session], current: null }),
  );
  expect(p).toMatchObject({
    playerCount: 2,
    sessionCount: 1,
    gameCount: 1,
    playerAppearances: 2,
    gamesRequiringReview: 0,
    importPerformed: false,
    carryForwardPayments: false,
    carryForwardSignatures: false,
    carryForwardSeeding: false,
  });
  expect(p.issues).toEqual([]);
  expect(p.sourceSha256).toHaveLength(64);
});
it("reads full snapshots and reports unknown state without exposing its contents", () => {
  const p = planLegacy(
    JSON.stringify({
      players,
      kv: {
        completed_sessions: [session],
        admin_pin: "SECRET PIN",
        unknown: { medical: "PRIVATE MEDICAL" },
      },
    }),
  );
  expect(p.unknownStateKeyCount).toBe(1);
  for (const value of [
    "PRIVATE PLAYER",
    "PRIVATE MEDICAL",
    "private@example.invalid",
    "SECRET PIN",
  ])
    expect(JSON.stringify(p)).not.toContain(value);
});
it("reads raw table exports and detects duplicate or broken JSON keys", () => {
  const p = planLegacy(
    JSON.stringify({
      players,
      app_state: [
        { key: "completed_sessions", value: JSON.stringify([session]) },
        { key: "completed_sessions", value: "[]" },
        { key: "other", value: "{bad" },
      ],
    }),
  );
  expect(p.gameCount).toBe(1);
  expect(p.issues.map((x) => x.code)).toEqual([
    "DUPLICATE_STATE_KEY",
    "INVALID_STATE_JSON",
  ]);
});
it("flags ambiguous identity links and numeric/string duplicate IDs", () => {
  const p = planLegacy(
    JSON.stringify({
      players: [...players, { id: "1", email: " PRIVATE@example.invalid " }],
      sessions: [],
    }),
  );
  expect(p.issues.map((x) => x.code)).toEqual([
    "DUPLICATE_PLAYER_ID",
    "AMBIGUOUS_EMAIL",
  ]);
});
it("does not count current/completed copies of the same session twice", () => {
  const p = planLegacy(
    JSON.stringify({ players, sessions: [session], current: session }),
  );
  expect(p.gameCount).toBe(1);
  expect(p.issues[0].code).toBe("DUPLICATE_SESSION_ID");
});
it("preserves legacy ties and unfinished scores for review instead of inventing valid results", () => {
  for (const [sA, sB] of [
    [15, 15],
    [20, 19],
    [-1, 21],
    [22, 21],
    [14.5, 21],
  ]) {
    const p = planLegacy(
      JSON.stringify({
        players,
        sessions: [
          {
            ...session,
            scores: { c1_y1_g1: { ...session.scores.c1_y1_g1, sA, sB } },
          },
        ],
      }),
    );
    expect(p.gamesRequiringReview).toBe(1);
    expect(
      p.issues.some((x) => x.code === "LEGACY_SCORE_REQUIRES_REVIEW"),
    ).toBe(true);
  }
});
it("rejects malformed teams, missing identities, ambiguous dates and winner mismatches", () => {
  const p = planLegacy(
    JSON.stringify({
      players,
      sessions: [
        {
          ...session,
          date: "2026-02-30",
          scores: {
            c1_y1_g1: { a1: 1, a2: 1, b1: 99, b2: 2, sA: 21, sB: 1, w: "B" },
          },
        },
      ],
    }),
  );
  expect(p.issues.map((x) => x.code)).toEqual([
    "DATE_REQUIRES_REVIEW",
    "INVALID_TEAMS",
    "UNRESOLVED_PLAYER",
    "WINNER_MISMATCH",
  ]);
});
it("fails closed on invalid root data", () => {
  for (const s of ["null", "[]", "{}", "not json"])
    expect(() => planLegacy(s)).toThrow();
});
it("still inventories games when a legacy session has no stable ID", () => {
  const p = planLegacy(
    JSON.stringify({
      players,
      sessions: [{ date: session.date, scores: session.scores }],
    }),
  );
  expect(p.sessionCount).toBe(1);
  expect(p.gameCount).toBe(1);
  expect(p.issues[0].code).toBe("MISSING_SESSION_ID");
});
it("preserves suspicious state-key counts without changing object prototypes", () => {
  const p = planLegacy(
    JSON.stringify({
      players,
      app_state: [
        { key: "__proto__", value: '{"completed_sessions":[]}' },
        { key: "completed_sessions", value: JSON.stringify([session]) },
      ],
    }),
  );
  expect(p.stateKeyCount).toBe(2);
  expect(p.unknownStateKeyCount).toBe(1);
  expect(p.gameCount).toBe(1);
});
it("audits SQL metadata while separating missing and duplicate session IDs", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { readFileSync } = await import("node:fs");
  const db = new PGlite();
  try {
    await db.exec(
      "create table public.players(id int);create table public.announcements(id int);create table public.app_state(key text,value text);insert into public.players values(1),(2);",
    );
    await db.query("insert into public.app_state values($1,$2)", [
      "completed_sessions",
      JSON.stringify([{ date: session.date, scores: session.scores }]),
    ]);
    const result = await db.exec(
      readFileSync("scripts/legacy-audit.sql", "utf8"),
    );
    expect(result.at(-1)?.rows).toEqual([
      {
        legacy_inventory: {
          players: 2,
          announcements: 0,
          state_rows: 1,
          invalid_state_json: 0,
          completed_sessions: 1,
          completed_games: 1,
          legacy_tied_games: 0,
          current_session_present: false,
          snapshots: 0,
          missing_completed_ids: 1,
          duplicate_completed_ids: 0,
          import_performed: false,
        },
      },
    ]);
  } finally {
    await db.close();
  }
}, 30000);
