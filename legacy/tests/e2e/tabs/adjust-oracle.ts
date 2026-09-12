// What Adjust courts should do to a stored session, worked out from the stored data the way the rules describe (not by
// asking the app) and answered by the independent reference model in legacy/tests/unit/adjust-reference.mjs.
import { reference } from "../../unit/adjust-reference.mjs";

export type AdjSession = {
  cycle: number; assignments: Record<string, number[]>; scores: Record<string, unknown>; attendance?: Record<string, string>;
  absentFrom?: Record<string, number>; latePlayers?: { playerId: number; pending?: boolean }[]; closedCourts?: number[];
};
export type RefResult = { ok: boolean; why?: string; lineup: Record<string, number[]>; moves: { id: number; from: number; to: number }[]; removed: { id: number; from: number }[]; seated: { id: number; to: number }[]; skippedLate: { id: number; c: number; why: string }[] };

/** Courts with a score in the current round: their players can't change until the round ends. */
export const lockedCourts = (cs: AdjSession) => [1, 2, 3, 4, 5, 6].filter((c) => Object.keys(cs.scores || {}).some((k) => k.startsWith(`c${c}_y${cs.cycle}_`)));

/** The adjustment input: seated players marked absent, players marked present who were taken off (they go back to the
 *  court they left), late arrivals still waiting, courts with scores, and courts marked unavailable. */
export function adjustInput(cs: AdjSession, extra: Partial<{ absent: number[]; returning: { id: number; court: number }[]; late: number[] }> = {}) {
  const seated = new Set(Object.values(cs.assignments).flat()), att = cs.attendance || {};
  return {
    nc: 6, lineup: cs.assignments, locked: lockedCourts(cs), closed: cs.closedCourts || [],
    absent: Object.entries(att).filter(([id, v]) => v === "absent" && seated.has(+id)).map(([id]) => +id),
    returning: Object.entries(cs.absentFrom || {}).filter(([id]) => att[id] === "present" && !seated.has(+id)).map(([id, c]) => ({ id: +id, court: +c })),
    late: (cs.latePlayers || []).filter((l) => l.pending).map((l) => l.playerId),
    ...extra,
  };
}
export const expectAdjust = (cs: AdjSession, extra = {}) => reference(adjustInput(cs, extra)) as RefResult;
export const changes = (res: RefResult) => (res.ok ? res.removed.length + res.seated.length + res.moves.length : 0);
/** The same courts with sorted players, for comparing who is where. */
export const sorted = (a: Record<string, number[]>) => Object.fromEntries([1, 2, 3, 4, 5, 6].map((c) => [String(c), [...(a[c] || [])].sort((x, y) => x - y)]));

/** The sentence the organizer sees when a late player stays where they are, written from the late rule. */
export function lateStaySentence(why: string, n: string, c: number, below: number, other: string) {
  return ({
    locked: `${n} arrived late, but Court ${c} already has scores this round, so ${n} stays there.`,
    bottom: `${n} arrived late but is already on the bottom court in use (Court ${c}), so stays there.`,
    "below-locked": `${n} arrived late, but Court ${below} already has scores this round, so ${n} stays on Court ${c}.`,
    "below-full": `${n} arrived late, but Court ${below} already has five players, so ${n} stays on Court ${c}.`,
    alone: `${n} arrived late, but moving would leave ${other} alone on Court ${c}, so ${n} stays.`,
  } as Record<string, string>)[why];
}
/** Refusal messages, by the reference model's reason. */
export const REFUSAL: Record<string, RegExp> = { capacity: /players need a court, but the available courts hold at most/, "one player": /^Only one player is left to play/, alone: /would be alone on Court \d and no court nearby has room/, "no room": /^There is no court with room for/, "closing a court with scores": /can't be closed now/ };

const FMT: Record<number, string> = { 2: "best of three singles", 3: "three singles games", 4: "three doubles games to 21", 5: "five doubles games to 15, each player sits out one" };
type Move = { id: number; from: number; to: number; reason?: string };
/** The preview's explanation, line by line, rebuilt from the reference result and the rule text (not from the app). */
export function explanation(inp: ReturnType<typeof adjustInput>, ref: RefResult & { moves: Move[]; lockedAbsent?: { id: number; c: number }[]; skippedLate: { id: number; c: number; why: string; below?: number; other?: number }[] }, nm: (id: number) => string): string[] {
  if (!ref.ok) return [];
  const out: string[] = [];
  for (const r of ref.removed) out.push(`${nm(r.id)} is absent — off Court ${r.from}.`);
  for (const s of ref.seated) out.push(`${nm(s.id)} is back — returns to Court ${s.to}.`);
  for (const m of ref.moves) {
    const n = nm(m.id);
    out.push(({
      late: `${n} arrived late — moves down from Court ${m.from} to Court ${m.to}.`,
      alone: `${n} was the only player left on Court ${m.from}, so joins Court ${m.to} (a game needs at least two).`,
      "alone-up": `${n} was the only player left on Court ${m.from}, the bottom court in use, so joins Court ${m.to} above.`,
      closed: `Court ${m.from} is unavailable, so ${n} moves to Court ${m.to}.`,
      full: `Court ${m.from} would have more than five players, so ${n} (the last to join it) moves to Court ${m.to}.`,
      "back-full": `${n} is back, but Court ${m.from} is full, so plays on Court ${m.to}.`,
      "back-locked": `${n} is back, but Court ${m.from} already has scores this round, so plays on Court ${m.to}.`,
      "back-closed": `${n} is back, but Court ${m.from} is unavailable, so plays on Court ${m.to}.`,
      back: `${n} is back and plays on Court ${m.to}.`,
    } as Record<string, string>)[m.reason || ""] ?? `?${m.reason}`);
  }
  for (const a of ref.lockedAbsent || []) out.push(`${nm(a.id)} is marked absent, but Court ${a.c} already has scores this round, so ${nm(a.id)} stays listed there until the round ends.`);
  for (const s of ref.skippedLate) if (s.why !== "not-seated") out.push(lateStaySentence(s.why, nm(s.id), s.c, s.below || 0, s.other ? nm(s.other) : ""));
  const L = ref.lineup as Record<string, number[]>;
  for (let c = 1; c <= 6; c++) { const n = (L[c] || []).length; if (n !== (inp.lineup[c] || []).length && n >= 2) out.push(`Court ${c} now has ${n} players: ${FMT[n]}.`); }
  if (!Object.values(L).flat().length) out.push("Nobody is left to play this round.");
  return out;
}
/** A lineup the rules accept: open courts hold none or two to five, courts with scores keep their players, closed courts are empty. */
export function validLineup(L: Record<string, number[]>, inp: ReturnType<typeof adjustInput>) {
  for (let c = 1; c <= 6; c++) {
    const n = (L[c] || []).length;
    if (inp.locked.includes(c)) { if ([...(L[c] || [])].sort().join() !== [...(inp.lineup[c] || [])].sort().join()) return false; continue; }
    if (inp.closed.includes(c) && n) return false;
    if (n === 1 || n > 5) return false;
  }
  return true;
}
