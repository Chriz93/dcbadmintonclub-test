// Seeded league generator for the per-tab suites. Every league is played out with the independent rules model (the one
// the ten-session simulation proves the real app agrees with) and stored in exactly the shape the app writes.
import season from "../../../automation/season.json";
import type { MockState } from "../mock-supabase";
import { Model, fresh, fillCourts } from "../rules-model";
export const CAPACITY = 26;

export type Player = MockState["players"][number];
export type Score = { a1: number; a2: number | null; b1: number; b2: number | null; sA: number; sB: number; w: "A" | "B" };
export type Assign = Record<string, number[]>;
export type Mv = { cycle: number; mv: Record<string, string>; wins: Record<string, number>; pts: Record<string, number>; tosses: Record<string, string>; tossChoices: Record<string, string> };
export type SessionRec = { id: number; number: number; date: string; cycle: number; assignments: Assign; initialAssignments: Assign; scores: Record<string, Score>; movements: Mv[]; completed?: boolean; preTosses: Record<string, string>; attendance: Record<string, string>; absentFrom: Record<string, number>; playerNames?: Record<string, string>; finalAssignments?: Assign; perRoundAssignments?: { cycle: number; assignments: Assign }[] };
export type LiveState = "none" | "r1-partial" | "r1-done" | "r2-partial" | "complete";
export type GenOpts = { regulars?: number; spares?: number; pending?: number; sessions?: number; live?: LiveState; absentRate?: number; declineRate?: number; tieRate?: number; benchRate?: number; viewerEmail?: string; viewerKind?: "regular" | "spare" | "pending"; hoursBefore?: number; dates?: string[] };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;
export type League = { pre?: Record<string, string>; seed: number; players: Player[]; sessions: SessionRec[]; current: SessionRec | null; rsvps: MockState["rsvps"]; payments: MockState["payments"]; questions: Row[]; announcements: Row[]; invitations: Record<string, string>; nowMs: number; upcoming: number; live: LiveState; title: string };

export const NC = 6;
export const target = (n: number) => (n === 5 ? 15 : 21);
export function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function sessionStartMs(iso: string) { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d, 20, 0, 0).getTime(); }
const fmt = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d, 12).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" }); };
const slug = (n: string) => n.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]+/g, ".").replace(/^\.+|\.+$/g, "");
// First names are unique inside a league: the Sessions tab and Court history show first names only.
const FIRST = ["Aarav", "Priya", "Daniel", "Mei", "Lucas", "Sofia", "Omar", "Hannah", "Mateo", "Aisha", "Ethan", "Fatima", "Noah", "Ananya", "Liam", "Chloe", "Arjun", "Grace", "Samuel", "Isabelle", "Kenji", "Zara", "Ryan", "Nadia", "Vikram", "Emma", "Diego", "Leah", "Tomás", "Anne-Marie", "Zoë", "Kwame", "Ingrid", "Rafael", "Yuki", "Olivia", "Hamza", "Maya", "Jonas", "Amara", "Felix", "Leila", "Marco", "Nia", "Oscar", "Sana", "Theo", "Imani", "Victor", "Elif"];
const LAST = ["Sharma", "Nair", "Okafor", "Chen", "Martin", "Rossi", "Haddad", "Kim", "Garcia", "Khan", "Tremblay", "Rahman", "Leblanc", "Iyer", "O'Connor", "Dubois", "Patel", "Wong", "Mensah", "Roy", "Tanaka", "Ahmed", "Gill", "Petrova", "Singh", "Clarke", "Alvarez", "Cohen", "Silva", "Dubé", "Park", "Boateng"];

/** The same pairings as buildCombos in index.html, from the lineup order of one court. */
export function combos(ids: number[]) {
  const [A, B, C, D, E] = ids;
  if (ids.length === 4) return [[A, B, C, D], [A, C, B, D], [A, D, B, C]].map(([a1, a2, b1, b2]) => ({ a1, a2, b1, b2 }));
  if (ids.length === 5) return [[B, E, C, D], [C, A, D, E], [D, B, E, A], [E, C, A, B], [A, D, B, C]].map(([a1, a2, b1, b2]) => ({ a1, a2, b1, b2 }));
  if (ids.length === 3) return [[A, B], [A, C], [B, C]].map(([a1, b1]) => ({ a1, a2: null as number | null, b1, b2: null as number | null }));
  if (ids.length === 2) return [[A, B], [A, B], [A, B]].map(([a1, b1]) => ({ a1, a2: null as number | null, b1, b2: null as number | null }));
  return [];
}

/** Deterministic coverage of the edges: empty league, no sessions, every live state, spares, pending, benched players. */
export function variety(i: number, extra: Partial<GenOpts> = {}): GenOpts {
  if (i === 0) return { regulars: 0, spares: 0, pending: 0, sessions: 0, live: "none", ...extra };
  if (i === 1) return { regulars: 6, spares: 0, pending: 1, sessions: 0, live: "none", ...extra };
  const lives: LiveState[] = ["none", "r1-partial", "r1-done", "r2-partial", "complete", "none", "none"];
  return { regulars: 4 + ((i * 7) % 22), spares: i % 5, pending: i % 4 === 0 ? 1 : 0, sessions: (i * 3) % 8, live: lives[i % 7], absentRate: 0.25, declineRate: 0.1, tieRate: 0.15, benchRate: i % 6 === 0 ? 1 : 0.05, ...extra };
}

export function genLeague(seed: number, o: GenOpts = {}): League {
  const r = rng(seed);
  const int = (n: number) => Math.floor(r() * n);
  const chance = (p: number) => r() < p;
  const shuffle = <T,>(a: T[]) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = int(i + 1); [b[i], b[j]] = [b[j], b[i]]; } return b; };
  const nReg = o.regulars ?? 4 + int(22), nSpare = o.spares ?? int(5), nPend = o.pending ?? (chance(0.3) ? 1 + int(2) : 0);
  const live: LiveState = nReg >= 2 ? o.live ?? "none" : "none";
  const nSess = nReg >= 2 ? Math.min(o.sessions ?? int(7), live === "none" ? 28 : 27) : 0;
  const dates = o.dates ?? season.approved_dates.map(fmt);
  const firsts = shuffle(FIRST), lasts = shuffle(LAST);
  let kinds = shuffle([...Array(nReg).fill("regular"), ...Array(nSpare).fill("spare"), ...Array(nPend).fill("pending")] as string[]);
  if (o.viewerEmail && o.viewerKind) { const k = kinds.indexOf(o.viewerKind); if (k > 0) [kinds[0], kinds[k]] = [kinds[k], kinds[0]]; }
  const t0 = Date.parse("2026-09-01T12:00:00Z");
  const players: Player[] = kinds.map((k, i) => {
    const name = `${firsts[i]} ${lasts[i % lasts.length]}`;
    return { id: i + 1, name, email: i === 0 && o.viewerEmail ? o.viewerEmail : slug(name) + "@example.invalid", phone: `613-555-${2000 + i}`, emergency: "Contact 613-555-0101", medical: chance(0.15) ? "Asthma" : "", sig: name, waiver_signed: true, paid: false, email_reminders: true, declared_payment: k === "spare" ? "per_session" : chance(0.6) ? "paid_full" : "will_pay", current_court: 0, highest_court: 0, season_wins: 0, season_losses: 0, games_played: 0, no_show_count: 0, membership_type: k === "spare" ? "spare" : "regular", created_at: new Date(t0 + i * 60000).toISOString(), approved: k !== "pending", waitlisted: false, registered_at: new Date(t0 + i * 60000).toISOString(), admin_note: "", user_id: null } as unknown as Player;
  });
  kinds = [];
  const byId = (id: number) => players.find((p) => p.id === id)!;
  const str: Record<number, number> = {}; players.forEach((p) => (str[p.id] = 30 + r() * 70));
  const regs = players.filter((p) => p.membership_type === "regular" && p.approved);
  const key: Record<number, number> = {}; regs.forEach((p) => (key[p.id] = str[p.id] + r() * 25));
  const seeded = fillCourts([...regs].sort((a, b) => key[b.id] - key[a.id]).map((p) => p.id));
  for (let c = 1; c <= NC; c++) for (const id of seeded[c]) { const p = players.find((x) => x.id === id)!; p.current_court = c; p.highest_court = c; }
  const model = new Model(players);
  const courtIdx = (id: number) => model.lineup.findIndex((l) => l && l.includes(id));
  const assignFrom = (): Assign => Object.fromEntries(Array.from({ length: NC }, (_, i) => [String(i + 1), [...(model.lineup[i + 1] || [])]]));
  const sessions: SessionRec[] = []; let current: SessionRec | null = null; const rsvps: MockState["rsvps"] = [];
  const total = nSess + (live !== "none" ? 1 : 0);
  for (let k = 1; k <= total; k++) {
    const isLive = k > nSess;
    const startMs = sessionStartMs(season.approved_dates[k - 1]);
    const regActive = players.filter((p) => p.current_court > 0 && p.membership_type !== "spare");
    const declined = regActive.filter(() => chance(o.declineRate ?? 0.08)).slice(0, 3).map((p) => p.id);
    const spareAnswers = shuffle(players.filter((p) => p.membership_type === "spare" && p.approved)).map((p) => ({ id: p.id, yes: chance(0.6) }));
    const confirmed = spareAnswers.filter((a) => a.yes).map((a) => a.id).slice(0, declined.length);
    let tick = startMs - (150 + int(10)) * 3600e3;
    const at = () => { tick += (5 + int(80)) * 60e3; return new Date(tick).toISOString(); };
    for (const p of regActive) if (!declined.includes(p.id)) rsvps.push({ session_number: k, player_id: p.id, response: "coming", note: "", updated_at: at() });
    for (const id of declined) { const late = chance(0.3); rsvps.push({ session_number: k, player_id: id, response: "notcoming", note: "", updated_at: new Date(startMs - (late ? 60 + int(10) : 80 + int(40)) * 3600e3).toISOString() }); }
    for (const a of spareAnswers) rsvps.push({ session_number: k, player_id: a.id, response: a.yes ? "coming" : "notcoming", note: "", updated_at: at() });
    model.seat(new Set(declined), confirmed);
    const initial = assignFrom();
    for (const id of confirmed) { const c = courtIdx(id), p = byId(id); p.current_court = c; p.highest_court = p.highest_court > 0 ? Math.min(p.highest_court, c) : c; }
    const attendance: Record<string, string> = {}; const absentFrom: Record<string, number> = {};
    for (const id of declined) attendance[id] = "declined";
    for (const ids of model.lineup.slice(1)) for (const id of ids) attendance[id] = "present";
    if (chance(o.absentRate ?? 0.2)) {
      const cands = model.lineup.slice(1).flat().filter((id) => byId(id).membership_type !== "spare");
      if (cands.length > 2) { const id = cands[int(cands.length)]; absentFrom[id] = courtIdx(id); model.absent(id); attendance[id] = "absent"; }
    }
    const activeIds = players.filter((p) => p.current_court > 0).map((p) => p.id);
    const scoreRounds = isLive ? { "r1-partial": 1, "r1-done": 1, "r2-partial": 2, complete: 2, none: 0 }[live] : 2;
    const rotateRounds = isLive ? { "r1-partial": 0, "r1-done": 0, "r2-partial": 1, complete: 2, none: 0 }[live] : 2;
    const scores: Record<string, Score> = {}; const movements: Mv[] = [];
    for (let cy = 1; cy <= scoreRounds; cy++) {
      const round = fresh();
      const partial = isLive && ((live === "r1-partial" && cy === 1) || (live === "r2-partial" && cy === 2));
      const tieCourt = chance(o.tieRate ?? 0.1) ? 1 + int(NC) : 0;
      for (let c = 1; c <= NC; c++) {
        const ids = model.lineup[c]; if (!ids || ids.length < 2) continue;
        const T = target(ids.length);
        combos(ids).forEach((g, gi) => {
          if (partial && chance(0.45)) return;
          const A = [g.a1, g.a2].filter((x): x is number => x != null), B = [g.b1, g.b2].filter((x): x is number => x != null);
          let sA: number, sB: number;
          if (tieCourt === c && ids.length === 4) [sA, sB] = [[21, 19], [19, 21], [21, 19]][gi];
          else { const fa = A.reduce((n, id) => n + str[id], 0) / A.length + (r() - 0.5) * 30, fb = B.reduce((n, id) => n + str[id], 0) / B.length + (r() - 0.5) * 30; const lo = 2 + int(T - 3); [sA, sB] = fa >= fb ? [T, lo] : [lo, T]; }
          const w = sA > sB ? "A" : "B";
          scores[`c${c}_y${cy}_g${gi + 1}`] = { a1: g.a1, a2: g.a2, b1: g.b1, b2: g.b2, sA, sB, w };
          const add = (o2: Record<number, number>, id: number, v: number) => { o2[id] = (o2[id] || 0) + v; };
          for (const id of A) { add(round.pts, id, sA); add(round.pf, id, sA); add(round.pa, id, sB); if (w === "A") add(round.wins, id, 1); }
          for (const id of B) { add(round.pts, id, sB); add(round.pf, id, sB); add(round.pa, id, sA); if (w === "B") add(round.wins, id, 1); }
          round.games.push({ A, B, w });
        });
      }
      if (cy <= rotateRounds) {
        const mv = model.rotate(round, { sid: 1789000000000 + k, cy });
        const fill = (src: Record<number, number>) => { const o2: Record<string, number> = {}; for (const id of activeIds) o2[id] = src[id] || 0; for (const [id, v] of Object.entries(src)) o2[id] = v; return o2; };
        movements.push({ cycle: cy, mv: mv as Record<string, string>, wins: fill(round.wins), pts: fill(round.pts), tosses: {}, tossChoices: {} });
      }
    }
    const rec: SessionRec = { id: 1789000000000 + k, number: k, date: dates[k - 1], cycle: isLive ? (live === "r2-partial" || live === "complete" ? 2 : 1) : 2, assignments: assignFrom(), initialAssignments: initial, scores, movements, preTosses: {}, attendance, absentFrom };
    if (!isLive) {
      rec.completed = true;
      const finals = model.endSession();
      rec.finalAssignments = rec.assignments;
      rec.perRoundAssignments = [1, 2].map((cy) => {
        if (cy === 1) return { cycle: 1, assignments: initial };
        const ra: Assign = Object.fromEntries(Array.from({ length: NC }, (_, i) => [String(i + 1), [] as number[]]));
        for (const [k2, sc] of Object.entries(scores)) { const m = k2.match(new RegExp("^c(\\d+)_y" + cy + "_g")); if (m) for (const id of [sc.a1, sc.a2, sc.b1, sc.b2]) if (id != null && !ra[m[1]].includes(id)) ra[m[1]].push(id); }
        return { cycle: cy, assignments: ra };
      });
      const seen = new Set<number>([...Object.values(rec.assignments).flat(), ...Object.values(scores).flatMap((sc) => [sc.a1, sc.a2, sc.b1, sc.b2]).filter((x): x is number => x != null), ...Object.keys(attendance).map(Number)]);
      rec.playerNames = Object.fromEntries([...seen].map((id) => [id, byId(id).name]));
      for (const [id, c] of finals) { const p = byId(id); p.current_court = c; p.highest_court = p.highest_court > 0 ? Math.min(p.highest_court, c) : c; }
      for (const [id, from] of Object.entries(absentFrom)) { const p = byId(+id); p.current_court = Math.min(NC, from + 1); p.no_show_count++; }
      sessions.push(rec);
    } else { if (live === "complete") rec.completed = true; current = rec; }
  }
  if (!current && chance(o.benchRate ?? 0.05)) { const c = players.filter((p) => p.membership_type !== "spare" && p.current_court > 0 && p.games_played >= 0 && sessions.length); if (c.length) c[int(c.length)].current_court = 0; }
  // Season statistics are derived: every completed session, plus the rotated rounds of a live one.
  const count = (sc: Score) => { for (const id of [sc.a1, sc.a2]) if (id != null) { const p = byId(id); p.games_played++; if (sc.w === "A") p.season_wins++; else p.season_losses++; } for (const id of [sc.b1, sc.b2]) if (id != null) { const p = byId(id); p.games_played++; if (sc.w === "B") p.season_wins++; else p.season_losses++; } };
  for (const s of sessions) Object.values(s.scores).forEach(count);
  if (current) { const rot = new Set(current.movements.map((m) => m.cycle)); for (const [k2, sc] of Object.entries(current.scores)) if (rot.has(parseInt(k2.match(/_y(\d+)_/)![1]))) count(sc); }
  const U = current ? current.number : Math.min(nSess + 1, 28);
  const uStart = sessionStartMs(season.approved_dates[U - 1]);
  const hours = o.hoursBefore ?? (current ? -(0.25 + r()) : [150, 110, 90, 75, 70, 60, 50, 47, 45, 30, 10, 2][int(12)]);
  const nowMs = Math.round(uStart - hours * 3600e3);
  if (!current) {
    const from = uStart - 160 * 3600e3, span = Math.max(0, nowMs - from);
    for (const p of players.filter((x) => x.approved)) {
      const roll = r(), spare = p.membership_type === "spare";
      const resp = spare ? (roll < 0.4 ? "coming" : roll < 0.55 ? "notcoming" : null) : roll < 0.55 ? "coming" : roll < 0.67 ? "notcoming" : null;
      if (resp && span > 0) rsvps.push({ session_number: U, player_id: p.id, response: resp, note: "", updated_at: new Date(from + r() * span).toISOString() });
    }
  }
  const payments: MockState["payments"] = []; let pid = 1;
  const pay = (player_id: number, kind: string, amount: number, session_number: number | null) => payments.push({ id: pid++, player_id, kind, amount, session_number, method: "e-transfer", received_on: "2026-09-0" + (1 + int(9)), note: "" });
  for (const p of players.filter((x) => x.approved && x.membership_type !== "spare")) { const q = r(); if (q < 0.45) pay(p.id, "season", 400, null); else if (q < 0.6) pay(p.id, "adjustment", 200, null); }
  for (const s of sessions) for (const id of new Set(Object.values(s.scores).flatMap((sc) => [sc.a1, sc.a2, sc.b1, sc.b2]))) if (id != null && byId(id).membership_type === "spare" && chance(0.6)) pay(id, "spare", 20, s.number);
  for (const v of rsvps.filter((x) => x.response === "notcoming" && x.session_number <= nSess && byId(x.player_id).membership_type !== "spare")) if (Date.parse(v.updated_at) <= sessionStartMs(season.approved_dates[v.session_number - 1]) - 72 * 3600e3 && chance(0.5)) pay(v.player_id, "refund", 14, v.session_number);
  for (const p of players) { const rows = payments.filter((x) => x.player_id === p.id); p.paid = p.membership_type === "spare" ? rows.some((x) => x.kind === "spare") : rows.filter((x) => x.kind === "season" || x.kind === "adjustment").reduce((n, x) => n + x.amount, 0) >= 400; }
  const approved = players.filter((p) => p.approved);
  const questions = Array.from({ length: approved.length ? int(4) : 0 }, (_, i) => { const p = approved[int(approved.length)]; const answered = chance(0.5); return { id: i + 1, player_id: p.id, asker: p.name, question: `Question ${i + 1} from ${p.name.split(" ")[0]}: is parking available?`, answer: answered ? `Answer ${i + 1}: yes, lot B.` : null, answered_at: answered ? new Date(t0 + 86400e3 * (i + 1)).toISOString() : null, created_at: new Date(t0 + 3600e3 * (i + 1)).toISOString() }; });
  const announcements = Array.from({ length: int(5) }, (_, i) => ({ id: i + 1, created_at: new Date(t0 + 3600e3 * (i + 1)).toISOString(), type: ["info", "warn", "success"][i % 3], title: `Notice ${i + 1}`, body: `Body of notice ${i + 1}.` }));
  const invitations = Object.fromEntries(players.map((p) => [p.email.toLowerCase(), p.membership_type]));
  return { seed, players, sessions, current, rsvps, payments, questions, announcements, invitations, nowMs, upcoming: U, live,
    title: `${nReg} regulars, ${nSpare} spares, ${nPend} pending · ${nSess} sessions played${current ? ` · live ${live}` : ""}` };
}
