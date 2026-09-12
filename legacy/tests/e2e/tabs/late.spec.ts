// Session → Late Arrivals: "Players arriving more than 5 minutes late move down one court." Applied at once through the
// adjustment rules — the next court in use below, unless the player is on the bottom court in use, that court or theirs
// already has scores, the court below holds five, or the move would leave one player alone. Then Undo.
import { test, expect } from "@playwright/test";
import { openAs, closeCtx, load, type Ctx } from "./harness";
import { genLeague, variety, rng, type League, type LiveState } from "./gen";
import { courtOf } from "./oracle";
import { expectAdjust, lateStaySentence, REFUSAL } from "./adjust-oracle";

let ctx: Ctx;
test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
test.afterAll(async () => { await closeCtx(ctx); });
type Pick = "any" | "bottom" | "top" | "next-to-full" | "clear-round";
const PICKS: Pick[] = ["any", "clear-round", "bottom", "top", "next-to-full", "clear-round"];
for (let i = 0; i < 60; i++) {
  const pick = PICKS[i % PICKS.length], live: LiveState = i % 4 === 3 ? "r2-partial" : "r1-partial";
  const opts = { ...variety(i + 150), live, ...(pick === "next-to-full" ? { regulars: 26, spares: 2, declineRate: 0, absentRate: 0 } : {}) };
  test(`Late ${String(i + 1).padStart(3, "0")} · ${pick} · ${genLeague(47000 + i, opts).title}`, async () => {
    const L: League = genLeague(47000 + i, { ...opts, dates: ctx.dates });
    if (pick !== "any" && L.current) L.current.scores = Object.fromEntries(Object.entries(L.current.scores).filter(([k]) => !k.includes(`_y${L.current!.cycle}_`)));
    await load(ctx, L);
    const page = ctx.page, toast = page.locator("#_t"), r = rng(4700 + i), cur = L.current!, a = cur.assignments;
    const kv = () => JSON.parse(ctx.state.state["current_session"].value);
    const name = (id: number) => L.players.find((p) => p.id === id)!.name;
    await page.evaluate(() => nav("admin"));
    await page.getByRole("button", { name: "📅 Session" }).click();
    const ui = page.locator("#sess-ui");
    await expect(ui.locator(".card").filter({ hasText: "⏰ Late Arrivals" })).toContainText("Players arriving more than 5 minutes late move down one court, starting now. On the bottom court in use they stay. Courts with scores this round don't change.");
    const used = [1, 2, 3, 4, 5, 6].filter((c) => (a[c] || []).length);
    const court = pick === "bottom" ? used.at(-1)! : pick === "top" ? used[0] : pick === "next-to-full" ? (used.find((c) => (a[c + 1] || []).length >= 5 && (a[c] || []).length > 2) ?? used[0]) : used[Math.floor(r() * used.length)];
    const id = a[court][Math.floor(r() * a[court].length)], from = courtOf(a, id);
    await page.locator("#late-player-sel").selectOption(String(id));
    await ui.getByRole("button", { name: "Mark Late", exact: true }).click();
    const ref = expectAdjust(cur, { absent: [], returning: [], late: [id] });
    if (!ref.ok) { await expect(toast).toHaveText(REFUSAL[ref.why!]); expect(kv().assignments).toEqual(a); return; }
    const mv = ref.moves.find((m) => m.id === id), stay = ref.skippedLate.find((x) => x.id === id);
    const below = [1, 2, 3, 4, 5, 6].find((x) => x > from && (a[x] || []).length > 0) || 0, other = a[from].find((x) => x !== id);
    await expect(toast).toHaveText(mv ? `${name(id)} arrived late — moves down from Court ${from} to Court ${mv.to}.` : lateStaySentence(stay!.why, name(id), from, below, other ? name(other) : ""));
    if (pick === "bottom") expect(mv, "on the bottom court in use a late player stays").toBeUndefined();
    const cs = kv();
    expect(cs.assignments, "only the moves a valid round needs").toEqual(Object.fromEntries(Object.entries(ref.lineup).map(([c, ids]) => [String(c), ids])));
    for (let c = 1; c <= 6; c++) expect((cs.assignments[c] || []).length === 1, `Court ${c} not left with one player`).toBe(false);
    expect(cs.latePlayers).toEqual([{ playerId: id, originalCourt: from, round: cur.cycle, to: mv ? mv.to : from, pending: false, ...(stay ? { stayed: stay.why } : {}) }]);
    await expect(ui).toContainText(`⏰ ${name(id)} (was C${from}${mv ? ` → C${mv.to}` : " · stayed"})`);
    // Once per round; and the step can be undone.
    await page.locator("#late-player-sel").selectOption(String(id));
    await ui.getByRole("button", { name: "Mark Late", exact: true }).click();
    await expect(toast).toHaveText("Already marked late");
    await page.evaluate(() => undoLast());
    await expect(toast).toHaveText(`Undone: Mark ${name(id)} late`);
    expect(kv().assignments, "Undo puts the courts back").toEqual(a);
    expect(kv().latePlayers || [], "and forgets the late mark").toEqual(cur.latePlayers || []);
  });
}
