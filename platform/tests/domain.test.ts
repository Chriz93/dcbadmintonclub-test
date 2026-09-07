import { describe, it, expect } from "vitest";
import {
  allocate,
  rotation,
  validateScore,
  rankings,
  moveCourts,
} from "../src/domain/courts";
import {
  season,
  validateSchedule,
  zonedUTC,
  calendar,
  parseScheduleText,
} from "../src/domain/schedule";
import { readConfig } from "../src/services/config";
import { retryDelay, deliver } from "../src/domain/notifications";
const ids = Array.from({ length: 25 }, (_, i) => String(i + 1));
describe("allocation and fairness", () => {
  it("allocates 25 across six with five on Court 6", () =>
    expect(allocate(ids, 6).map((c) => c.length)).toEqual([4, 4, 4, 4, 4, 5]));
  it.each([2, 3, 4, 5])("valid games with %i players", (n) => {
    for (const g of rotation(ids.slice(0, n))) {
      expect(new Set([...g.a, ...g.b, ...g.rest]).size).toBe(n);
      expect(g.a.length).toBe(g.b.length);
      expect(g.target).toBe(n === 5 ? 15 : 21);
    }
  });
  it("rests once, plays four times, every partnership once for five", () => {
    const games = rotation(ids.slice(0, 5));
    for (const id of ids.slice(0, 5)) {
      expect(games.filter((g) => g.rest.includes(id))).toHaveLength(1);
      expect(games.filter((g) => [...g.a, ...g.b].includes(id))).toHaveLength(
        4,
      );
    }
    const pairs = games.flatMap((g) =>
      [g.a, g.b].map((x) => x.slice().sort().join(",")),
    );
    expect(new Set(pairs).size).toBe(10);
  });
  it("rotates the first rest without altering fairness", () =>
    expect(rotation(ids.slice(0, 5), undefined, 1)[0].rest).toEqual(["2"]));
  it("rejects duplicates and capacity overflow", () => {
    expect(() => allocate(["a", "a"], 2)).toThrow();
    expect(() => allocate(ids, 4)).toThrow();
  });
  it("avoids singleton and supports different court counts", () => {
    expect(allocate(ids.slice(0, 5), 2).map((c) => c.length)).toEqual([3, 2]);
    expect(allocate(ids, 8).flat().sort()).toEqual([...ids].sort());
  });
  it("preserves populations and uniqueness through movement", () => {
    const c = allocate(ids, 6),
      next = moveCourts(c, c);
    expect(next.map((c) => c.length)).toEqual([4, 4, 4, 4, 4, 5]);
    expect(new Set(next.flat()).size).toBe(25);
    expect(next[4]).toContain(c[5][0]);
    expect(next[5]).toContain(c[4][3]);
  });
  it("rejects forged ranking identities", () =>
    expect(() => moveCourts([["a", "b"]], [["a", "c"]])).toThrow());
});
describe("scores and rankings", () => {
  it.each([
    [21, 0, 21],
    [15, 14, 15],
    [30, 29, 21],
  ])("valid terminal scores %i:%i", (a, b, t) =>
    expect(
      validateScore(a, b, t, t === 21 && a === 30 ? 2 : 1, a === 30 ? 30 : t),
    ).toBe("a"),
  );
  it.each([
    [20, 19, 21],
    [15, 15, 15],
    [-1, 21, 21],
    [22, 0, 21],
    [14.5, 15, 15],
  ])("rejects invalid score %i:%i", (a, b, t) =>
    expect(() => validateScore(a, b, t)).toThrow(),
  );
  it("normalizes unequal targets and games", () => {
    const r = rankings(
      ["a", "b"],
      [
        { game: { a: ["a"], b: ["b"], rest: [], target: 15 }, a: 15, b: 10 },
        { game: { a: ["a"], b: ["b"], rest: [], target: 21 }, a: 21, b: 14 },
      ],
    );
    expect(r[0].winRate).toBe(1);
    expect(r[0].pointRate).toBe(1);
    expect(r[1].pointRate).toBeCloseTo(2 / 3);
  });
});
describe("permit and calendar", () => {
  it("contains exactly 28 approved sessions, 56 hours and six cancellations", () => {
    const v = validateSchedule(season);
    expect(v.errors).toEqual([]);
    expect(v.active).toBe(28);
    expect(v.hours).toBe(56);
    expect(v.sessions.filter((s) => s.status === "cancelled")).toHaveLength(6);
  });
  it("all approved dates are Tuesdays", () =>
    season
      .filter((s) => s.status === "active")
      .forEach((s) =>
        expect(new Date(s.date + "T12:00Z").getUTCDay()).toBe(2),
      ));
  it("handles Toronto DST in autumn and spring", () => {
    expect(zonedUTC("2026-10-27", "20:15")).toBe("2026-10-28T00:15:00.000Z");
    expect(zonedUTC("2026-11-03", "20:15")).toBe("2026-11-04T01:15:00.000Z");
    expect(zonedUTC("2027-03-23", "20:15")).toBe("2027-03-24T00:15:00.000Z");
  });
  it("rejects impossible and ambiguous wall times", () => {
    expect(() => zonedUTC("2027-03-14", "02:30")).toThrow();
    expect(() => zonedUTC("2026-11-01", "01:30")).toThrow();
    expect(() => zonedUTC("2026-02-30", "12:00")).toThrow();
  });
  it("deduplicates identical dates and rejects status conflicts", () => {
    expect(validateSchedule([season[0], season[0]]).sessions).toHaveLength(1);
    expect(
      validateSchedule([season[0], { ...season[0], status: "cancelled" }])
        .errors,
    ).toHaveLength(1);
  });
  it("parses normalized text and rejects unsupported layouts", () => {
    expect(
      parseScheduleText("2026-09-15 20:15 22:15 active", "P", "V", "R"),
    ).toHaveLength(1);
    expect(() => parseScheduleText("Sept 15 maybe", "P", "V", "R")).toThrow();
  });
  it("keeps event IDs stable for cancellation updates", () => {
    const original = calendar([season[0]]),
      changed = calendar([
        { ...season[0], status: "cancelled", date: "2026-09-16", revision: 1 },
      ]);
    expect(original.match(/UID:.+/)?.[0]).toBe(changed.match(/UID:.+/)?.[0]);
    expect(changed).toContain("STATUS:CANCELLED");
    expect(changed).toContain("SEQUENCE:1");
  });
  it("escapes and folds ICS fields", () => {
    const ics = calendar([
      { ...season[0], venue: "x\nBEGIN:VEVENT," + "é".repeat(80) },
    ]);
    expect(ics).toContain("x\\nBEGIN:VEVENT\\,");
    ics
      .split("\r\n")
      .forEach((l) =>
        expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75),
      );
  });
});
describe("environment isolation and jobs", () => {
  it("defaults to disconnected preview", () =>
    expect(readConfig({}).VITE_APP_ENV).toBe("demo"));
  it("rejects production even when allowlisted", () =>
    expect(() =>
      readConfig({
        VITE_APP_ENV: "test",
        VITE_SUPABASE_URL: "https://bwepvxelvwgwxrnaglrx.supabase.co",
        VITE_TEST_PROJECT_REF: "bwepvxelvwgwxrnaglrx",
        VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
      }),
    ).toThrow());
  it("rejects missing env, privileged keys and mismatched hosts", () => {
    expect(() => readConfig({ VITE_APP_ENV: "test" })).toThrow();
    expect(() =>
      readConfig({
        VITE_APP_ENV: "test",
        VITE_SUPABASE_URL: "https://test.supabase.co",
        VITE_TEST_PROJECT_REF: "test",
        VITE_SUPABASE_PUBLISHABLE_KEY: "sb_secret_bad",
      }),
    ).toThrow();
  });
  it("bounds exponential retry", () => {
    expect(retryDelay(1)).toBe(30);
    expect(retryDelay(2)).toBe(60);
    expect(retryDelay(20)).toBe(86400);
  });
  it("does not call a provider without consent", async () => {
    const r = await deliver(
      {
        id: "1",
        idempotencyKey: "1",
        attempts: 1,
        template: "rsvp",
        payload: {},
      },
      {
        send: async () => {
          throw new Error("must not call");
        },
      },
      false,
    );
    expect(r.status).toBe("suppressed");
  });
  it("keeps outage recoverable and retains provider IDs", async () => {
    const job = {
      id: "1",
      idempotencyKey: "1",
      attempts: 1,
      template: "rsvp",
      payload: {},
    };
    expect(
      (
        await deliver(
          job,
          {
            send: async () => {
              throw new Error("outage");
            },
          },
          true,
        )
      ).status,
    ).toBe("pending");
    expect(
      await deliver(
        job,
        { send: async () => ({ messageId: "receipt" }) },
        true,
      ),
    ).toEqual({ status: "delivered", providerMessageId: "receipt" });
  });
});
