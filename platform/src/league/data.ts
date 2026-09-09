import { z } from "zod";
import { type Game } from "../domain/courts";
import { courtMovements, roundStatus } from "../domain/round-status";
const assignment = z.object({
  session_id: z.string(),
  court_id: z.string(),
  round: z.number(),
  id: z.string(),
  ordinal: z.number().nullable(),
});
export const snapshotSchema = z.object({
  version: z.string(),
  unchanged: z.literal(false),
  season: z.object({
    id: z.string(),
    name: z.string(),
    rules: z.object({ normalTarget: z.number(), fiveTarget: z.number() }),
  }),
  players: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      seed: z.number().nullable(),
      initialRating: z.coerce.number(),
      rating: z.coerce.number(),
      played: z.number(),
    }),
  ),
  sessions: z.array(
    z.object({
      id: z.string(),
      venue_id: z.string(),
      starts_at: z.string(),
      ends_at: z.string(),
      status: z.string(),
      revision: z.number(),
    }),
  ),
  courts: z.array(
    z.object({ id: z.string(), number: z.number(), venue_id: z.string() }),
  ),
  matches: z.array(
    z.object({
      id: z.string(),
      session_id: z.string(),
      court_id: z.string(),
      round: z.number(),
      game: z.number(),
      target: z.number(),
      a: z.array(z.string()),
      b: z.array(z.string()),
      scoreA: z.number().nullable(),
      scoreB: z.number().nullable(),
      revision: z.number(),
    }),
  ),
  assignments: z.array(assignment),
  finals: z.array(assignment),
  history: z.array(
    z.object({
      session_id: z.string(),
      id: z.string(),
      round: z.number(),
      before: z.coerce.number(),
      after: z.coerce.number(),
      games: z.number(),
    }),
  ),
  reviews: z.array(
    z.object({
      id: z.string(),
      match_id: z.string(),
      user_id: z.string(),
      a: z.number(),
      b: z.number(),
      message: z.string(),
      status: z.string(),
      resolution: z.string().nullable(),
      revision: z.number(),
    }),
  ),
  questions: z.array(
    z.object({
      id: z.string(),
      question: z.string(),
      answer: z.string().nullable(),
      revision: z.number(),
      mine: z.boolean(),
    }),
  ),
});
export type LeagueData = z.infer<typeof snapshotSchema>;
export type LeagueMatch = LeagueData["matches"][number];
export const completed = (m: LeagueMatch) =>
  m.scoreA !== null && m.scoreB !== null;
export const participant = (m: LeagueMatch, id: string) =>
  [...m.a, ...m.b].includes(id);
export const nameOf = (data: LeagueData, id: string) =>
  data.players.find((p) => p.id === id)?.name ?? "Former player";
export const dateLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("en-CA", {
    timeZone: "America/Toronto",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
export const sessionCourts = (data: LeagueData, s: string) =>
  data.courts
    .filter(
      (c) => c.venue_id === data.sessions.find((x) => x.id === s)?.venue_id,
    )
    .sort((a, b) => a.number - b.number);
export function lineups(data: LeagueData, s: string, r: number, final = false) {
  return sessionCourts(data, s).map((c) =>
    (final ? data.finals : data.assignments)
      .filter(
        (a) =>
          a.session_id === s && a.court_id === c.id && (final || a.round === r),
      )
      .sort(
        (a, b) =>
          (a.ordinal ?? 1000) - (b.ordinal ?? 1000) || a.id.localeCompare(b.id),
      )
      .map((a) => a.id),
  );
}
export const roundsFor = (data: LeagueData, s: string) =>
  [
    ...new Set(
      data.assignments.filter((a) => a.session_id === s).map((a) => a.round),
    ),
  ].sort((a, b) => a - b);
export function gameDetails(data: LeagueData, m: LeagueMatch): Game {
  return {
    a: m.a,
    b: m.b,
    target: m.target,
    rest: data.assignments
      .filter(
        (a) =>
          a.session_id === m.session_id &&
          a.round === m.round &&
          a.court_id === m.court_id &&
          !participant(m, a.id),
      )
      .map((a) => a.id),
  };
}
export function roundProgress(data: LeagueData, s: string, r: number) {
  const courts = sessionCourts(data, s);
  return roundStatus(
    lineups(data, s, r),
    data.matches
      .filter((m) => m.session_id === s && m.round === r)
      .map((m) => ({
        ...m,
        ...gameDetails(data, m),
        court: courts.findIndex((c) => c.id === m.court_id) + 1,
      })),
    data.season.rules,
  );
}
export function savedMovements(data: LeagueData, s: string, r: number) {
  const hasNext = roundsFor(data, s).includes(r + 1),
    isFinal =
      data.sessions.find((x) => x.id === s)?.status === "completed" &&
      data.finals.some((f) => f.session_id === s && f.round === r);
  if (!hasNext && !isFinal) return [];
  const courts = sessionCourts(data, s);
  return courtMovements(
    lineups(data, s, r),
    lineups(data, s, r + 1, !hasNext && isFinal),
  ).map((m) => ({
    ...m,
    from: m.from === null ? null : courts[m.from - 1].number,
    to: m.to === null ? null : courts[m.to - 1].number,
  }));
}
export function stats(
  data: LeagueData,
  id: string,
  sessionId?: string,
  live = false,
) {
  const sessions = new Set(
    data.sessions
      .filter(
        (s) =>
          (!sessionId || s.id === sessionId) &&
          (live || s.status === "completed"),
      )
      .map((s) => s.id),
  );
  const matches = data.matches.filter(
    (m) => sessions.has(m.session_id) && completed(m) && participant(m, id),
  );
  let wins = 0,
    points = 0,
    against = 0,
    possible = 0,
    streak = 0,
    bestStreak = 0;
  for (const m of matches) {
    const a = m.a.includes(id) ? m.scoreA! : m.scoreB!,
      b = m.a.includes(id) ? m.scoreB! : m.scoreA!;
    wins += Number(a > b);
    points += a;
    against += b;
    possible += m.target;
    streak = a > b ? streak + 1 : 0;
    bestStreak = Math.max(bestStreak, streak);
  }
  return {
    played: matches.length,
    wins,
    losses: matches.length - wins,
    points,
    against,
    possible,
    winRate: matches.length ? wins / matches.length : 0,
    pointRate: possible ? points / possible : 0,
    streak,
    bestStreak,
    matches,
  };
}
export function partners(data: LeagueData, id: string) {
  const rows = new Map<string, { id: string; played: number; wins: number }>();
  for (const m of stats(data, id).matches)
    for (const other of (m.a.includes(id) ? m.a : m.b).filter(
      (p) => p !== id,
    )) {
      const row = rows.get(other) ?? { id: other, played: 0, wins: 0 };
      row.played++;
      row.wins += Number(
        m.a.includes(id) ? m.scoreA! > m.scoreB! : m.scoreB! > m.scoreA!,
      );
      rows.set(other, row);
    }
  return [...rows.values()].sort(
    (a, b) => b.played - a.played || a.id.localeCompare(b.id),
  );
}
export function initialSession(data: LeagueData, now = Date.now()) {
  return (
    data.sessions.find((s) => s.status === "active")?.id ??
    data.sessions.find(
      (s) => s.status === "scheduled" && Date.parse(s.ends_at) > now,
    )?.id ??
    [...data.sessions].reverse().find((s) => s.status === "completed")?.id ??
    data.sessions[0]?.id ??
    ""
  );
}
export function summaryText(data: LeagueData, s: string, r: number) {
  const session = data.sessions.find((x) => x.id === s);
  if (!session) return "";
  const movements = savedMovements(data, s, r);
  const current = lineups(data, s, r);
  return [
    data.season.name,
    `${dateLabel(session.starts_at)} · Round ${r}`,
    ...sessionCourts(data, s).map(
      (c, i) =>
        `Court ${c.number}: ${current[i]
          .map((id) => nameOf(data, id))
          .join(", ")}`,
    ),
    movements.length ? "Published movements:" : "Movement not published.",
    ...movements.map(
      (m) =>
        `${nameOf(data, m.id)}: ${m.from === m.to ? `stayed C${m.to}` : m.from === null ? `joined C${m.to}` : m.to === null ? `sitting out (was C${m.from})` : `C${m.from} → C${m.to}`}`,
    ),
  ].join("\n");
}

/** Completed league nights only; school cancellations never break this streak. */
export function seasonHighlights(data: LeagueData) {
  const sessions = data.sessions.filter((s) => s.status === "completed");
  const players = data.players.map((p) => {
    let streak = 0,
      best = 0,
      attended = 0;
    for (const s of sessions) {
      if (
        data.matches.some(
          (m) => m.session_id === s.id && completed(m) && participant(m, p.id),
        )
      ) {
        streak++;
        attended++;
        best = Math.max(best, streak);
      } else streak = 0;
    }
    return {
      id: p.id,
      change: p.rating - p.initialRating,
      attended,
      streak,
      best,
    };
  });
  return {
    sessions: sessions.length,
    players,
    improved: players
      .filter((p) => p.attended > 0 && p.change > 0)
      .sort((a, b) => b.change - a.change || a.id.localeCompare(b.id))
      .slice(0, 3),
  };
}
