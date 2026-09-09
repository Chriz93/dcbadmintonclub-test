import {
  allocate,
  rotation,
  validateScore,
  type Game,
  type Result,
} from "../domain/courts";
import { nextRoundPlacement } from "../domain/placement";
import { roundStatus } from "../domain/round-status";

export const players = [
  "Alex Morgan",
  "Priya Shah",
  "Daniel Brooks",
  "Sofia Chen",
  "Noah Patel",
  "Emma Wilson",
  "Liam Hassan",
  "Zoe Martin",
  "Lucas Kim",
  "Isabella Reed",
  "Ethan Roy",
  "Olivia Singh",
  "Maya Chen",
  "Benjamin Park",
  "Amelia Ross",
  "Leo Thomas",
  "Chloe Davis",
  "Arjun Mehta",
  "Grace Turner",
  "Oliver Scott",
  "Hannah Lee",
  "Samuel Wright",
  "Ava Nguyen",
  "Adam Clarke",
  "Nina Kapoor",
].map((name, index) => ({
  id: `demo-${String(index + 1).padStart(2, "0")}`,
  name,
  seed: index + 1,
  initialRating: 1000 + (24 - index) * 15,
}));
export const playerName = (id: string) =>
  players.find((p) => p.id === id)?.name ?? "Unknown demo player";
export type Ratings = Record<string, number>;
export interface Match extends Game {
  id: string;
  court: number;
  round: number;
  session: number;
  scoreA: number | null;
  scoreB: number | null;
  revision: number;
}
export interface Round {
  number: number;
  courts: string[][];
  matches: Match[];
  publishedNext: string[][] | null;
}
export interface DemoSession {
  number: number;
  date: string;
  rounds: Round[];
  complete: boolean;
  before: Ratings;
  after: Ratings;
  finalCourts: string[][] | null;
}
export interface DemoState {
  sessions: DemoSession[];
  audit: string[];
  reviews: {
    id: string;
    matchId: string;
    userId: string;
    matchRevision: number;
    a: number;
    b: number;
    message: string;
    status: "open" | "accepted" | "declined";
    resolution: string | null;
  }[];
}
export const baseline = (): Ratings =>
  Object.fromEntries(players.map((p) => [p.id, p.initialRating]));
export const scored = (m: Match) => m.scoreA !== null && m.scoreB !== null;
export const courtFor = (courts: string[][], id: string) =>
  courts.findIndex((c) => c.includes(id)) + 1;

/** Same frozen-per-round, K=32 mean-delta method as rebuild_elo in migration 014. */
export function rateRound(before: Ratings, matches: Match[]): Ratings {
  if (Object.values(before).some((r) => !Number.isFinite(r)))
    throw new Error("Every ELO rating must be finite.");
  if (new Set(matches.map((m) => m.id)).size !== matches.length)
    throw new Error("Duplicate game cannot count twice toward ELO.");
  const changes: Record<string, number[]> = {};
  for (const m of matches.filter(scored)) {
    const ids = [...m.a, ...m.b, ...m.rest];
    if (
      !m.id ||
      m.a.length < 1 ||
      m.a.length > 2 ||
      m.a.length !== m.b.length ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !id || !Object.hasOwn(before, id))
    )
      throw new Error("ELO requires distinct known players on valid teams.");
    validateScore(m.scoreA!, m.scoreB!, m.target);
    const avg = (team: string[]) =>
      team.reduce((n, id) => n + before[id], 0) / team.length;
    const expected = 1 / (1 + 10 ** ((avg(m.b) - avg(m.a)) / 400));
    const result = Number(m.scoreA! > m.scoreB!);
    for (const [team, delta] of [
      [m.a, 32 * (result - expected)],
      [m.b, 32 * (expected - result)],
    ] as const)
      for (const id of team) (changes[id] ??= []).push(delta);
  }
  return Object.fromEntries(
    Object.entries(before).map(([id, rating]) => {
      const d = changes[id];
      return [id, rating + (d ? d.reduce((a, b) => a + b, 0) / d.length : 0)];
    }),
  );
}
export function makeRound(
  session: number,
  number: number,
  courts: string[][],
): Round {
  return {
    number,
    courts: courts.map((c) => [...c]),
    publishedNext: null,
    matches: courts.flatMap((ids, c) =>
      (ids.length ? rotation(ids) : []).map((g, i) => ({
        ...g,
        id: `s${session}-r${number}-c${c + 1}-g${i + 1}`,
        court: c + 1,
        round: number,
        session,
        scoreA: null,
        scoreB: null,
        revision: 0,
      })),
    ),
  };
}
export function sampleScore(m: Match): [number, number] {
  const n = Number(m.id.split("-g")[1]);
  // Session 1 / Court 6 produces a five-way tie, exercising the final stable tie-break.
  if (m.session === 1 && m.court === 6)
    return [m.target, Math.max(0, m.target - 5)];
  const winA = (m.session * 11 + m.round * 7 + m.court * 3 + n) % 5 < 3;
  const loser = Math.max(
    3,
    m.target - 1 - ((m.session + m.court + m.round * n) % 9),
  );
  return winA ? [m.target, loser] : [loser, m.target];
}
export function fillRound(round: Round): Round {
  return {
    ...round,
    matches: round.matches.map((m) =>
      scored(m)
        ? m
        : {
            ...m,
            scoreA: sampleScore(m)[0],
            scoreB: sampleScore(m)[1],
            revision: 1,
          },
    ),
  };
}
export function nextCourts(round: Round) {
  const status = roundStatus(round.courts, round.matches);
  if (status.state === "invalid") throw new Error(status.error!);
  if (status.state !== "ready")
    throw new Error("Finish every game before reviewing movement.");
  return nextRoundPlacement(
    round.courts,
    round.matches.map((m): Result => ({ game: m, a: m.scoreA!, b: m.scoreB! })),
  );
}
export function makeDemo(): DemoState {
  let rating = baseline();
  const sessions: DemoSession[] = [];
  const dates = ["2026-09-15", "2026-09-22", "2026-09-29", "2026-10-06"];
  for (let n = 1; n <= 4; n++) {
    const before = { ...rating };
    let courts = allocate(
      [...players]
        .sort((a, b) => rating[b.id] - rating[a.id] || a.seed - b.seed)
        .map((p) => p.id),
      6,
    );
    const rounds: Round[] = [];
    for (let r = 1; r <= (n === 4 ? 1 : 4); r++) {
      const round =
        n === 4 ? makeRound(n, r, courts) : fillRound(makeRound(n, r, courts));
      if (n < 4) {
        round.publishedNext = nextCourts(round);
        rating = rateRound(rating, round.matches);
        courts = round.publishedNext;
      }
      rounds.push(round);
    }
    sessions.push({
      number: n,
      date: dates[n - 1],
      before,
      after: { ...rating },
      complete: n < 4,
      rounds,
      finalCourts: n < 4 ? courts : null,
    });
  }
  return {
    sessions,
    reviews: [],
    audit: [
      "Demo loaded: three completed sessions; session four is ready to play. All identities and results are fictional.",
    ],
  };
}
export function rebuildRatings(state: DemoState): DemoState {
  let rating = baseline();
  return {
    ...state,
    sessions: state.sessions.map((s) => {
      const before = { ...rating };
      if (s.complete)
        for (const round of s.rounds) rating = rateRound(rating, round.matches);
      return { ...s, before, after: { ...rating } };
    }),
  };
}
export function recordScore(
  state: DemoState,
  matchId: string,
  a: number,
  b: number,
  actor: "player" | "admin",
  viewer: string,
  reason = "",
  expectedRevision?: number,
): DemoState {
  if (actor !== "admin" && actor !== "player")
    throw new Error("Unknown scoring role.");
  const copy = structuredClone(state);
  const m = copy.sessions
    .flatMap((s) => s.rounds.flatMap((r) => r.matches))
    .find((g) => g.id === matchId);
  if (!m) throw new Error("Match not found.");
  if (expectedRevision !== undefined && expectedRevision !== m.revision)
    throw new Error("This result changed. Reload before saving again.");
  if (actor === "player" && ![...m.a, ...m.b].includes(viewer))
    throw new Error("You can enter scores only for your own matches.");
  if (scored(m) && actor !== "admin")
    throw new Error(
      "This result is already saved. Ask Christy for a correction.",
    );
  if (scored(m) && reason.trim().length < 5)
    throw new Error("Enter a correction reason (at least 5 characters).");
  validateScore(a, b, m.target);
  const previous = scored(m) ? `${m.scoreA}–${m.scoreB}` : "unscored";
  m.scoreA = a;
  m.scoreB = b;
  m.revision++;
  copy.audit.unshift(
    `${actor === "admin" ? "Christy (demo)" : playerName(viewer)}: ${matchId}, ${previous} → ${a}–${b}${reason ? `. ${reason.trim()}` : ""}. Played court assignments preserved.`,
  );
  return rebuildRatings(copy);
}
export function scoreCurrentRound(state: DemoState): DemoState {
  const copy = structuredClone(state),
    s = copy.sessions[3];
  if (s.complete) return copy;
  const status = roundStatus(s.rounds.at(-1)!.courts, s.rounds.at(-1)!.matches);
  if (status.state === "invalid") throw new Error(status.error!);
  if (status.state === "ready") return copy;
  s.rounds[s.rounds.length - 1] = fillRound(s.rounds.at(-1)!);
  copy.audit.unshift(
    `Demo results filled: session 4, round ${s.rounds.length}, 20 of 20 games scored.`,
  );
  return copy;
}
export function requestDemoCorrection(
  state: DemoState,
  matchId: string,
  userId: string,
  a: number,
  b: number,
  message: string,
  expectedRevision: number,
): DemoState {
  const m = allMatches(state).find((m) => m.id === matchId);
  if (!m || !scored(m) || ![...m.a, ...m.b].includes(userId))
    throw new Error("Request a correction only for a saved game you played.");
  if (m.revision !== expectedRevision)
    throw new Error("This result changed. Review the latest score first.");
  validateScore(a, b, m.target);
  if (message.trim().length < 5 || message.trim().length > 500)
    throw new Error("Explain the correction in 5–500 characters.");
  if (
    state.reviews.some(
      (q) =>
        q.matchId === matchId && q.userId === userId && q.status === "open",
    )
  )
    throw new Error("Your correction request is already awaiting review.");
  const copy = structuredClone(state);
  copy.reviews.push({
    id: `demo-review-${copy.reviews.length + 1}`,
    matchId,
    userId,
    matchRevision: expectedRevision,
    a,
    b,
    message: message.trim(),
    status: "open",
    resolution: null,
  });
  return copy;
}
export function resolveDemoCorrection(
  state: DemoState,
  id: string,
  accept: boolean,
  reason: string,
  role: "player" | "admin",
): DemoState {
  if (role !== "admin") throw new Error("Only Christy can review corrections.");
  const req = state.reviews.find((q) => q.id === id);
  if (!req || req.status !== "open")
    throw new Error("This request was already reviewed.");
  if (reason.trim().length < 5 || reason.trim().length > 500)
    throw new Error("Explain the decision in 5–500 characters.");
  const copy = accept
    ? recordScore(
        state,
        req.matchId,
        req.a,
        req.b,
        "admin",
        req.userId,
        reason,
        req.matchRevision,
      )
    : structuredClone(state);
  const updated = copy.reviews.find((q) => q.id === id)!;
  updated.status = accept ? "accepted" : "declined";
  updated.resolution = reason.trim();
  copy.audit.unshift(
    `Christy (demo): correction ${id} ${updated.status}. ${reason.trim()}`,
  );
  return copy;
}
export const movementRevision = (round: Round) =>
  JSON.stringify([
    round.number,
    round.courts,
    round.matches.map((m) => [m.id, m.revision]),
  ]);
export function publishMovement(
  state: DemoState,
  expectedRevision?: string,
): DemoState {
  const copy = structuredClone(state),
    s = copy.sessions[3];
  if (s.complete) throw new Error("The session is already complete.");
  const round = s.rounds.at(-1)!;
  if (
    expectedRevision !== undefined &&
    expectedRevision !== movementRevision(round)
  )
    throw new Error(
      "The round changed. Review movement again before publishing.",
    );
  const courts = nextCourts(round);
  round.publishedNext = courts;
  if (round.number === 4) {
    s.complete = true;
    s.finalCourts = courts;
  } else s.rounds.push(makeRound(4, round.number + 1, courts));
  copy.audit.unshift(
    s.complete
      ? "Christy (demo): session completed. Final placements published and official ELO rebuilt."
      : `Christy (demo): movement reviewed; round ${round.number + 1} published.`,
  );
  return rebuildRatings(copy);
}
export function finishDemo(state: DemoState): DemoState {
  let copy = state;
  while (!copy.sessions[3].complete)
    copy = publishMovement(scoreCurrentRound(copy));
  return copy;
}
export function statsFor(matches: Match[], id: string) {
  const games = matches.filter(
    (m) => scored(m) && [...m.a, ...m.b].includes(id),
  );
  let wins = 0,
    points = 0,
    against = 0,
    possible = 0;
  for (const m of games) {
    const onA = m.a.includes(id);
    const own = onA ? m.scoreA! : m.scoreB!,
      other = onA ? m.scoreB! : m.scoreA!;
    wins += Number(own > other);
    points += own;
    against += other;
    possible += m.target;
  }
  return {
    games: games.length,
    wins,
    losses: games.length - wins,
    points,
    against,
    winRate: games.length ? wins / games.length : 0,
    pointRate: possible ? points / possible : 0,
  };
}
export const allMatches = (state: DemoState, officialOnly = false) =>
  state.sessions
    .filter((s) => !officialOnly || s.complete)
    .flatMap((s) => s.rounds.flatMap((r) => r.matches));
export const currentRatings = (state: DemoState) =>
  state.sessions.at(-1)!.after;
export const activeCourts = (state: DemoState) =>
  state.sessions.at(-1)!.finalCourts ??
  state.sessions.at(-1)!.rounds.at(-1)!.courts;
