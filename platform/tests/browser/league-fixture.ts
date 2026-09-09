import type { Page } from "@playwright/test";
import { allocate, rotation } from "../../src/domain/courts";
import { nextRoundPlacement } from "../../src/domain/placement";
import type { LeagueData } from "../../src/league/data";
import { mockSignIn, mockUser, signIn } from "./auth-fixture";
export function leagueFixture(): LeagueData {
  const ids = Array.from({ length: 25 }, (_, i) =>
      i === 12 ? mockUser.id : `player-${i + 1}`,
    ),
    old = allocate(ids, 6);
  const data: LeagueData = {
    version: "v1",
    unchanged: false,
    season: {
      id: "season",
      name: "Synthetic 2026–27",
      rules: { normalTarget: 21, fiveTarget: 15 },
    },
    players: ids.map((id, i) => ({
      id,
      name: `TEST Player ${String(i + 1).padStart(2, "0")}`,
      seed: i + 1,
      initialRating: 1360 - i * 15,
      rating: 1360 - i * 15,
      played: 0,
    })),
    sessions: [
      {
        id: "session",
        venue_id: "venue",
        starts_at: "2026-09-16T00:15:00Z",
        ends_at: "2026-09-16T02:15:00Z",
        status: "active",
        revision: 2,
      },
    ],
    courts: Array.from({ length: 6 }, (_, i) => ({
      id: `court-${i + 1}`,
      number: i + 1,
      venue_id: "venue",
    })),
    matches: [],
    assignments: [],
    finals: [],
    history: [],
    reviews: [],
    questions: [],
  };
  const add = (plan: string[][], r: number, scored: boolean) => {
    data.assignments.push(
      ...plan.flatMap((ids, c) =>
        ids.map((id, i) => ({
          id,
          session_id: "session",
          court_id: data.courts[c].id,
          round: r,
          ordinal: i + 1,
        })),
      ),
    );
    data.matches.push(
      ...plan.flatMap((ids, c) =>
        rotation(ids).map((g, i) => ({
          id: `${r}-${c}-${i}`,
          session_id: "session",
          court_id: data.courts[c].id,
          round: r,
          game: i + 1,
          target: g.target,
          a: g.a,
          b: g.b,
          scoreA: scored ? g.target : null,
          scoreB: scored ? 10 : null,
          revision: scored ? 1 : 0,
        })),
      ),
    );
  };
  add(old, 1, true);
  const next = nextRoundPlacement(
    old,
    data.matches.map((m) => ({
      game: {
        a: m.a,
        b: m.b,
        rest: old[data.courts.findIndex((c) => c.id === m.court_id)].filter(
          (id) => ![...m.a, ...m.b].includes(id),
        ),
        target: m.target,
      },
      a: m.scoreA!,
      b: m.scoreB!,
    })),
  );
  add(next, 2, false);
  return data;
}
export async function openLeague(
  page: Page,
  admin = false,
  data = leagueFixture(),
) {
  const state = {
    data,
    reads: 0,
    saves: 0,
    fail: false,
    malformed: false,
    delay: 0,
  };
  await page.route(
    "https://wgolevihkvmosajumzvl.supabase.co/**",
    async (route) => {
      const path = new URL(route.request().url()).pathname;
      let payload: unknown = [];
      if (path.endsWith("/seasons"))
        payload = [{ id: "season", club_id: "club", name: data.season.name }];
      if (path.endsWith("/is_admin")) payload = admin;
      if (path.endsWith("/league_snapshot")) {
        state.reads++;
        if (state.delay)
          await new Promise((resolve) => setTimeout(resolve, state.delay));
        if (state.fail) {
          await route.fulfill({ status: 503, body: "{}" });
          return;
        }
        payload = state.malformed
          ? { version: "bad" }
          : route.request().postDataJSON().known_version === data.version
            ? { version: data.version, unchanged: true }
            : data;
      }
      if (path.endsWith("/submit_score") || path.endsWith("/correct_score")) {
        const body = route.request().postDataJSON(),
          m = data.matches.find((g) => g.id === body.m)!;
        if (m.revision !== body.expected_revision) {
          await route.fulfill({
            status: 409,
            contentType: "application/json",
            body: '{"code":"40001"}',
          });
          return;
        }
        m.scoreA = body.a;
        m.scoreB = body.b;
        m.revision++;
        data.version = "v" + (++state.saves + 1);
        payload = m.revision;
      }
      if (path.endsWith("/request_match_review")) {
        const body = route.request().postDataJSON();
        data.reviews.push({
          id: "review",
          match_id: body.m,
          user_id: mockUser.id,
          a: body.a,
          b: body.b,
          message: body.message,
          status: "open",
          resolution: null,
          revision: 1,
        });
        data.version += "r";
        payload = "review";
      }
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(payload),
      });
    },
  );
  await mockSignIn(page, admin ? "club_owner" : "member");
  await signIn(page);
  return state;
}
