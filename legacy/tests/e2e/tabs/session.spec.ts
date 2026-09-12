// Admin → Session: start, next round, end, reset, cancel, late arrivals, absences and spares, rebalance, cascade and
// attendance — each checked against the database afterwards, on 100 leagues.
import { test, expect } from "@playwright/test";
import { openAs, closeCtx, load, norm, type Ctx } from "./harness";
import { genLeague, variety, rng, NC, gamesNeeded, type GenOpts, type League, type SessionRec } from "./gen";
import { expectAdjust, lateStaySentence, REFUSAL } from "./adjust-oracle";
import { upcoming, courtOf } from "./oracle";
import { fillCourts } from "../rules-model";

type Kind = "start" | "missing" | "next" | "end" | "reset" | "cancel" | "late" | "absent" | "rebalance" | "cascade" | "attendance";
const PLAN: [Kind, Partial<GenOpts>][] = [
  ["start", { live: "none" }], ["missing", { live: "r1-partial" }], ["next", { live: "r1-done", tieRate: 0 }], ["end", { live: "complete" }],
  ["reset", { live: "r2-partial" }], ["cancel", { live: "r1-done" }], ["late", { live: "r1-partial" }], ["absent", { live: "r1-partial" }],
  ["rebalance", { live: "r1-partial" }], ["cascade", { live: "r1-partial" }], ["attendance", { live: "r2-partial" }],
];
const statsFrom = (sessions: SessionRec[]) => {
  const s: Record<number, { w: number; l: number; g: number }> = {};
  for (const x of sessions) for (const sc of Object.values(x.scores)) {
    const A = [sc.a1, sc.a2].filter((v): v is number => v != null), B = [sc.b1, sc.b2].filter((v): v is number => v != null);
    for (const id of [...A, ...B]) { s[id] ??= { w: 0, l: 0, g: 0 }; s[id].g++; }
    for (const id of sc.w === "A" ? A : B) s[id].w++;
    for (const id of sc.w === "A" ? B : A) s[id].l++;
  }
  return s;
};

let ctx: Ctx;
test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
test.afterAll(async () => { await closeCtx(ctx); });
for (let i = 0; i < 100; i++) {
  const [kind, extra] = i === 99 ? (["start", { live: "none", sessions: 28 }] as [Kind, Partial<GenOpts>]) : PLAN[i % PLAN.length];
  const opts: GenOpts = { ...variety(i + 2), ...(i % 3 === 0 ? { regulars: 26, spares: 3 } : {}), ...extra };
  test(`Session ${String(i + 1).padStart(3, "0")} · ${kind} · ${genLeague(12000 + i, opts).title}`, async () => {
    const L: League = genLeague(12000 + i, { ...opts, dates: ctx.dates });
    await load(ctx, L);
    const page = ctx.page, r = rng(900 + i), toast = page.locator("#_t");
    const kv = (k: string) => { const v = ctx.state.state[k]; return v && v.value !== "null" ? JSON.parse(v.value) : null; };
    const name = (id: number) => L.players.find((p) => p.id === id)?.name;
    const dbStats = () => Object.fromEntries(ctx.state.players.filter((p) => p.games_played > 0 || p.season_wins > 0 || p.season_losses > 0).map((p) => [p.id, { w: p.season_wins, l: p.season_losses, g: p.games_played }]));
    await page.evaluate(() => nav("admin"));
    await page.getByRole("button", { name: "📅 Session" }).click();
    const ui = page.locator("#sess-ui");
    const dates = (await ui.locator(".card").filter({ hasText: "Dates" }).locator(".flex-between").allInnerTexts()).map(norm);
    expect(dates.length, "28 dates listed").toBe(28);
    dates.forEach((t, k) => expect(t, `date row ${k + 1}`).toBe(`Session ${k + 1} — ${ctx.dates[k]} 8:00–10:00 PM ${L.sessions.some((s) => s.number === k + 1) ? "✓ Done" : L.current?.number === k + 1 ? "● Active" : "—"}`));

    if (!L.current) {
      const n = L.sessions.length + 1;
      await expect(ui.locator(".alert").first()).toHaveText(`Next: Session ${n} — ${ctx.dates[n - 1] || "Season done"}`);
      const start = ui.getByRole("button", { name: `🏸 Start Session ${n}` });
      if (n > 28) { await expect(start).toBeDisabled(); return; }
      const up = upcoming(L);
      await start.click();
      await expect(toast).toHaveText(`Session ${n} started — ${up.declined.size} excused, ${up.spares.length} spare${up.spares.length === 1 ? "" : "s"} seated`);
      const cs = kv("current_session");
      expect({ number: cs.number, date: cs.date, cycle: cs.cycle }).toEqual({ number: n, date: ctx.dates[n - 1], cycle: 1 });
      expect(cs.assignments, "seated from the votes").toEqual(up.assign);
      expect(cs.initialAssignments).toEqual(up.assign);
      const seated = new Set(Object.values(up.assign).flat());
      const att: Record<string, string> = {};
      up.declined.forEach((id) => (att[id] = "declined"));
      seated.forEach((id) => { if (up.vote[id] === "coming") att[id] = "present"; });
      expect(cs.attendance, "votes become attendance").toEqual(att);
      for (const id of up.spares) expect(ctx.state.players.find((p) => p.id === id)!.current_court, `spare ${name(id)} carries a court tonight`).toBe(courtOf(up.assign, id));
      await expect(page.locator("#courts-sub")).toHaveText(`Session ${n} · ${ctx.dates[n - 1]} · Round 1`);
      return;
    }

    const cur = L.current, a = cur.assignments;
    await expect(ui.locator(".alert").first()).toHaveText(`✅ Session ${cur.number} — ${cur.date} · Round ${cur.cycle}`);
    await expect(ui.getByRole("button", { name: /Undo — nothing to undo/ })).toBeDisabled();
    expect(norm(await ui.getByText(/^Court sizes:/).innerText())).toBe(`Court sizes: ${[1, 2, 3, 4, 5, 6].map((c) => `C${c}:${(a[c] || []).length}`).join(" ")}`);
    const assigned = Object.values(a).flat();
    const lateOpts = (await page.locator("#late-player-sel option").allInnerTexts()).slice(1);
    expect(lateOpts, "late list: everyone holding a court").toEqual(ctx.state.players.filter((p) => p.current_court > 0).map((p) => p.name));
    const absentOpts = (await page.locator("#absent-player-sel option").allInnerTexts()).slice(1);
    expect(absentOpts, "absent list: everyone on a court tonight").toEqual(Object.entries(a).flatMap(([c, ids]) => ids.map((id) => `${name(id)} (C${c})`)));
    const replaceIds = L.players.filter((p) => !assigned.includes(p.id) && (p.current_court > 0 || p.membership_type === "spare")).map((p) => p.id);
    expect((await page.locator("#spare-replace-sel option").allInnerTexts()).slice(1).map((t) => t.replace(/ \((SPARE|C\d)\)$/, "")), "replacement list").toEqual(replaceIds.map((id) => name(id)));

    const missing: string[] = [];
    for (let c = 1; c <= NC; c++) { const n = (a[c] || []).length; if (n < 2) continue; for (let g = 1; g <= gamesNeeded(n, cur.scores, c, cur.cycle); g++) if (!cur.scores[`c${c}_y${cur.cycle}_g${g}`]) missing.push(`C${c}G${g}`); }
    const k = (kind === "missing" && !missing.length) || (kind === "next" && missing.length) ? (missing.length ? "missing" : "next") : kind;

    if (k === "missing") {
      await ui.getByRole("button", { name: "⏭ Next Round (Rotate)" }).click();
      await expect(toast).toHaveText(`Cannot advance — ${missing.length} scores missing: ${missing.slice(0, 6).join(", ")}${missing.length > 6 ? "..." : ""}`);
      expect(kv("current_session").cycle).toBe(cur.cycle);
    } else if (k === "next") {
      await ui.getByRole("button", { name: "⏭ Next Round (Rotate)" }).click();
      await expect(toast).toHaveText(cur.cycle >= 2 ? /Session complete/ : `Round ${cur.cycle + 1}!`);
      const cs = kv("current_session");
      expect(cs.movements.length).toBe(cur.movements.length + 1);
      expect(cs.movements.at(-1).cycle).toBe(cur.cycle);
      expect(Object.values(cs.assignments as Record<string, number[]>).flat().sort((x, y) => x - y), "nobody lost or added").toEqual([...assigned].sort((x, y) => x - y));
      for (const id of assigned) {
        const from = courtOf(a, id), to = courtOf(cs.assignments, id), mv = cs.movements.at(-1).mv[id];
        expect(Math.abs(from - to) <= 1, `${name(id)} moves at most one court`).toBe(true);
        if (mv === "up") expect(to, `${name(id)} up`).toBe(Math.max(1, from - 1));
      }
      expect(cs.movements.at(-1).mv[a[1]?.[0]] !== "up", "nobody moves up from Court 1").toBe(true);
    } else if (k === "end") {
      await ui.getByRole("button", { name: "✅ End & Save Session" }).click();
      await expect.poll(() => (kv("completed_sessions") || []).length, { timeout: 15000 }).toBe(L.sessions.length + 1);
      const done = kv("completed_sessions").at(-1);
      expect({ number: done.number, completed: done.completed }).toEqual({ number: cur.number, completed: true });
      expect(done.finalAssignments, "final courts saved").toEqual(cur.assignments);
      await expect.poll(() => kv("current_session"), { message: "tonight's record removed after the night is saved" }).toBeNull();
      const absent = Object.entries(cur.attendance).filter(([, v]) => v === "absent").map(([id]) => +id);
      for (const id of assigned.filter((x) => !absent.includes(x))) expect(ctx.state.players.find((p) => p.id === id)!.current_court, `${name(id)} keeps the court earned`).toBe(courtOf(cur.assignments, id));
      for (const id of absent) {
        const p = ctx.state.players.find((x) => x.id === id)!, before = L.players.find((x) => x.id === id)!;
        expect(p.current_court, `${name(id)} absent: one court down`).toBe(Math.min(NC, (cur.absentFrom[id] || before.current_court) + 1));
        expect(p.no_show_count).toBe(before.no_show_count + 1);
      }
      expect(dbStats(), "season statistics include tonight").toEqual(statsFrom([...L.sessions, cur]));
      await expect(page.locator("#modal.open"), "the night's summary opens").toContainText("Final Court Assignments");
      await page.evaluate(() => closeModal());
    } else if (k === "reset") {
      await ui.getByRole("button", { name: "🔄 Reset Session (Clear Scores)" }).click();
      await expect(toast).toHaveText("Session reset — current session cleared, completed session stats preserved");
      const cs = kv("current_session");
      expect({ cycle: cs.cycle, scores: cs.scores, movements: cs.movements, attendance: cs.attendance, completed: cs.completed }).toEqual({ cycle: 1, scores: {}, movements: [], attendance: {}, completed: undefined });
      expect(kv("completed_sessions") || [], "finished sessions untouched").toEqual(L.sessions);
      expect(dbStats(), "statistics rebuilt from finished sessions").toEqual(statsFrom(L.sessions));
    } else if (k === "cancel") {
      await ui.getByRole("button", { name: "✕ Cancel Session" }).click();
      await expect(toast).toHaveText("Session cancelled — earlier results kept");
      expect(kv("current_session")).toBeNull();
      expect(kv("completed_sessions") || [], "finished sessions untouched").toEqual(L.sessions);
      expect(dbStats(), "earlier weeks' statistics kept").toEqual(statsFrom(L.sessions));
    } else if (k === "late") {
      const pool = ctx.state.players.filter((p) => p.current_court > 0);
      const pick = pool[Math.floor(r() * pool.length)];
      await page.locator("#late-player-sel").selectOption(String(pick.id));
      await ui.getByRole("button", { name: "Mark Late", exact: true }).click();
      const from = courtOf(a, pick.id);
      if (!from) { await expect(toast).toHaveText("Player not assigned"); return; }
      // "Players arriving more than 5 minutes late move down one court": the next court in use below, if it has room and
      // no scores yet and the move leaves nobody alone; otherwise the player stays. Only the moves a valid round needs.
      const ref = expectAdjust(cur, { absent: [], returning: [], late: [pick.id] });
      if (!ref.ok) { await expect(toast).toHaveText(REFUSAL[ref.why!]); expect(kv("current_session").assignments, "nothing changed").toEqual(a); return; }
      const mv = ref.moves.find((m) => m.id === pick.id), stay = ref.skippedLate.find((x) => x.id === pick.id);
      const below = [1, 2, 3, 4, 5, 6].find((x) => x > from && (a[x] || []).length > 0) || 0, other = (a[from] || []).find((x) => x !== pick.id);
      await expect(toast).toHaveText(mv ? `${pick.name} arrived late — moves down from Court ${from} to Court ${mv.to}.` : lateStaySentence(stay!.why, pick.name, from, below, other ? name(other)! : ""));
      const cs = kv("current_session");
      expect(cs.assignments, "late rule applied with only the moves a valid round needs").toEqual(Object.fromEntries(Object.entries(ref.lineup).map(([c, ids]) => [String(c), ids])));
      expect(cs.latePlayers).toEqual([{ playerId: pick.id, originalCourt: from, round: cur.cycle, to: mv ? mv.to : from, pending: false, ...(stay ? { stayed: stay.why } : {}) }]);
      expect(cs.attendance[pick.id], "a late player counts as present").toBe("present");
      await expect(ui).toContainText(`⏰ ${pick.name} (was C${from}${mv ? ` → C${mv.to}` : " · stayed"})`);
      await page.locator("#late-player-sel").selectOption(String(pick.id));
      await ui.getByRole("button", { name: "Mark Late", exact: true }).click();
      await expect(toast).toHaveText("Already marked late");
    } else if (k === "absent") {
      if (i % 4 === 3) { await ui.getByRole("button", { name: /Remove Absent/ }).click(); await expect(toast).toHaveText("Select an absent player"); return; }
      const [c, ids] = Object.entries(a).filter(([, x]) => x.length)[Math.floor(r() * Object.values(a).filter((x) => x.length).length)];
      const out = ids[Math.floor(r() * ids.length)];
      const rep = replaceIds.length && r() < 0.6 ? replaceIds[Math.floor(r() * replaceIds.length)] : null;
      await page.locator("#absent-player-sel").selectOption(`${out}|${c}`);
      if (rep) await page.locator("#spare-replace-sel").selectOption(String(rep));
      await ui.getByRole("button", { name: /Remove Absent/ }).click();
      await expect(toast).toHaveText(`${name(out)} removed from Court ${c} (marked absent)${rep ? ` → ${name(rep)} added to Court ${c}` : ""}`);
      const cs = kv("current_session");
      expect(cs.assignments[c], `Court ${c} after the swap`).toEqual([...ids.filter((x) => x !== out), ...(rep ? [rep] : [])]);
      expect(cs.attendance[out]).toBe("absent");
      if (rep) expect(cs.attendance[rep]).toBe("present");
    } else if (k === "rebalance") {
      await ui.getByRole("button", { name: "🔄 Rebalance Courts" }).click();
      const ids = [...new Set(assigned)].map((id) => ctx.state.players.find((p) => p.id === id)!).filter(Boolean).sort((x, y) => x.current_court - y.current_court);
      const filled = fillCourts(ids.map((p) => p.id));
      await expect(toast).toHaveText(`Courts re-sorted — ${ids.length} players across ${filled.slice(1).filter((x) => x.length).length} courts`);
      const want: Record<string, number[]> = Object.fromEntries([1, 2, 3, 4, 5, 6].map((c) => [String(c), filled[c]]));
      expect(kv("current_session").assignments).toEqual(want);
    } else if (k === "cascade") {
      const from = 2 + Math.floor(r() * 5);
      await ui.getByRole("button", { name: `↑C${from}`, exact: true }).click();
      if (!(a[from] || []).length) { await expect(toast).toHaveText(`Court ${from} has no players to promote from`); return; }
      let t = from - 1; while (t >= 1 && (a[t] || []).length >= 4) t--;
      if (t < 1) { await expect(toast).toHaveText("All courts above are full (4/4)"); return; }
      const pid = a[from][0];
      await expect(toast).toHaveText(`${name(pid)} promoted from Court ${from} → Court ${t}`);
      const cs = kv("current_session");
      expect(cs.assignments[from]).toEqual(a[from].slice(1));
      expect(cs.assignments[t]).toEqual([pid, ...(a[t] || [])]);
    } else if (k === "attendance") {
      const list = L.players.filter((p) => assigned.includes(p.id) || cur.attendance[p.id]);
      const rows = page.locator("#attendance-list .att-row");
      await expect(rows).toHaveCount(list.length);
      for (let n = 0; n < list.length; n++) expect(norm(await rows.nth(n).locator("div").first().innerText())).toBe(`${list[n].name}(${list[n].no_show_count} absences)`);
      const n = Math.floor(r() * list.length), status = r() < 0.5 ? "present" : "absent";
      await rows.nth(n).getByRole("button", { name: status === "present" ? "✓ Present" : "✕ Absent" }).click();
      await expect(rows.nth(n).locator(status === "present" ? ".att-present" : ".att-absent")).toHaveCount(1);
      await ui.getByRole("button", { name: "💾 Save Attendance" }).click();
      await expect(toast).toHaveText("Attendance saved!");
      expect(kv("current_session").attendance[list[n].id]).toBe(status);
    }
  });
}
