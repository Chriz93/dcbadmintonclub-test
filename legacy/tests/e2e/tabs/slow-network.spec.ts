// Saves on a slow connection (p63). Found by GitHub's checks on slower machines, where three tests failed at random:
// the next round's Save answered "Round is advancing", a quick second tap on the Players tag was refused as "Someone
// else saved newer changes", and a reload that finished while a save was on its way put the older data back on screen.
// Each case holds one reply at the moment that went wrong (the mock database has already applied the change, or has
// fixed an older reply) and fails on the page without p63.
import { test, expect, type Page } from "@playwright/test";
import { openAs, closeCtx, load, type Ctx } from "./harness";
import { genLeague, variety, type LiveState } from "./gen";
import { courtGames, scoreCourt } from "../helpers";
import { courtOf } from "./oracle";
import { adjustInput, changes } from "./adjust-oracle";
import { reference } from "../../unit/adjust-reference.mjs";

let ctx: Ctx;
test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
test.afterAll(async () => { await closeCtx(ctx); });

const nn = (i: number) => String(i + 1).padStart(2, "0");
const kv = () => JSON.parse(ctx.state.state["current_session"]?.value ?? "null");
type Hold = { asked: Promise<void>; release: () => void };
function held(set: (h: { until: Promise<void>; served: () => void }) => void): Hold {
  let release!: () => void, served!: () => void;
  const until = new Promise<void>((r) => (release = r)), asked = new Promise<void>((r) => (served = r));
  set({ until, served });
  return { asked, release };
}
/** The next read of a shared record: its reply is fixed when asked and delivered when released. */
const holdRead = (key: string) => held((h) => (ctx.state.holdRead = { key, ...h }));
/** The next save through a database function: applied at once, its reply delivered when released. */
const holdRpc = (fn: string) => held((h) => (ctx.state.holdRpc = { fn, ...h }));
/** A background refresh like the 20-second sync: load, and draw only a complete, current load. */
const backgroundRefresh = (page: Page) => page.evaluate(() => loadAll().then((r) => { if (r === true) renderAll(); return r; }));
const tail = (cs: unknown) => (changes(reference(adjustInput(cs as never)) as Parameters<typeof changes>[0]) ? " — press Adjust courts to update the courts" : "");

// ── Round advance: Save waits until the round is saved ──
for (let i = 0; i < 8; i++) {
  test(`Round advance ${nn(i)} · the next round's Save is off, with the reason, until the round is saved`, async () => {
    const L = genLeague(56100 + i, { ...variety(56100 + i), regulars: 8 + ((i * 5) % 19), spares: 1, pending: 0, live: "r1-partial", sessions: 1 + (i % 4), dates: ctx.dates });
    await load(ctx, L);
    const page = ctx.page;
    await page.evaluate(() => nav("scores"));
    const open = await page.evaluate(() => Object.entries(S.current.assignments as Record<string, number[]>).filter(([c, ids]) => ids.length >= 2 && !isCourtDone(+c)).map(([c]) => +c));
    expect(open.length, "round 1 has courts still to score").toBeGreaterThan(0);
    // Hold the round advance at its statistics rebuild: the new round is drawn, its save is still under way.
    await page.evaluate(() => {
      const w = window as unknown as { __held: boolean; __go: Promise<void>; __release: () => void; rebuildStats: () => Promise<void> };
      w.__held = false; w.__go = new Promise((r) => (w.__release = r));
      const orig = w.rebuildStats;
      w.rebuildStats = async () => { if (_autoAdvancing) { w.__held = true; await w.__go; } return orig(); };
    });
    const scores = async (c: number) => {
      const t = await page.evaluate((x) => courtTarget(S.current.assignments[x].length), c), games = await courtGames(page, c);
      const n = await page.evaluate((x) => S.current.assignments[x].length, c);
      // Two players: three games with split winners, so Game 3 is played whatever was saved before (best of three).
      return games.map((_, k) => (n === 2 && k === 1 ? [t - 6, t] : [t, Math.max(0, t - 6 - k)]) as [number, number]);
    };
    for (const c of open) await scoreCourt(page, c, await scores(c));
    await expect.poll(() => page.evaluate(() => (window as unknown as { __held: boolean }).__held), { message: "the round advance is under way" }).toBe(true);
    const c2 = await page.evaluate(() => S.current.cycle === 2 ? Number(Object.entries(S.current.assignments as Record<string, number[]>).find(([, ids]) => ids.length >= 2)?.[0] || 0) : 0);
    expect(c2, "Round 2 is drawn").toBeGreaterThan(0);
    await page.selectOption("#sc-sel", String(c2));
    const save = page.locator(`#sbtn_${c2}`), games = page.locator(`#score-area button[onclick^="saveGameScore("]`);
    await expect(save, "Save All is off while the round is saved").toBeDisabled();
    await expect(save).toHaveAttribute("title", "The round is advancing. Save when this button turns on.");
    await expect(games.first(), "each game's Save is off too").toBeDisabled();
    const s2 = await scores(c2);
    await page.fill(`#si_${c2}_1_a`, String(s2[0][0]));   // typed while waiting
    await page.evaluate(() => (window as unknown as { __release: () => void }).__release());
    await expect(save, "Save turns on when the round is saved").toBeEnabled();
    await expect(page.locator(`#si_${c2}_1_a`), "what was typed is kept").toHaveValue(String(s2[0][0]));
    await scoreCourt(page, c2, s2);
    await expect.poll(() => kv()?.scores?.[`c${c2}_y2_g1`]?.sA, { message: "Round 2's first game is stored" }).toBe(s2[0][0]);
  });
}

// ── An attendance mark stays on screen while its save is on its way ──
const MARKS = ["absent", "late", "present", "absent", "late", "present", "absent", "late"] as const;
for (let i = 0; i < MARKS.length; i++) {
  const st = MARKS[i], live: LiveState = i % 2 ? "r2-partial" : "r1-partial";
  test(`Overlapping reload ${nn(i)} · Attendance "${st}" stays on screen while its save is on its way (${live})`, async () => {
    const L = genLeague(57000 + i, { ...variety(57000 + i), regulars: 12 + i * 2, spares: 2, pending: 0, live, sessions: 1 + (i % 3), dates: ctx.dates });
    // "present" needs a seated player not yet confirmed: the first seated player starts unmarked, as when a session begins.
    if (st === "present" && L.current!.attendance) delete L.current!.attendance[Object.values(L.current!.assignments as Record<string, number[]>).flat()[0]];
    await load(ctx, L);
    const page = ctx.page, before = kv();
    const seated = Object.values(before.assignments as Record<string, number[]>).flat();
    const id = seated.find((x) => (st === "late" ? before.attendance?.[x] !== "absent" && !(before.latePlayers || []).some((l: { playerId: number }) => l.playerId === x) : before.attendance?.[x] !== st))!;
    expect(id, "a seated player whose mark changes").toBeTruthy();
    const c = courtOf(before.assignments, id), want = st === "late" ? "present" : st, first = L.players.find((p) => p.id === id)!.name.split(" ")[0];
    await page.evaluate(() => nav("admin"));
    await page.getByRole("button", { name: "📋 Attendance" }).click();
    const button = page.locator(`#sec-a-att button[onclick="markAttForTab(${id},'${st}',${c})"]`);
    const read = holdRead("current_session"), bg = backgroundRefresh(page);
    await read.asked;                                   // a refresh has the session as it was before the mark
    const save = holdRpc("set_state");
    await button.click();
    await save.asked;                                   // the database has the mark; its reply is on its way
    expect(kv().attendance[id], "saved in the database").toBe(want);
    read.release();                                     // the older reply arrives first
    await expect.poll(() => page.evaluate(() => _activeLoads), { message: "the page has handled the older reply" }).toBe(0);
    expect(await page.evaluate((x) => S.current.attendance[x], id), "the mark is still on screen after the older reply").toBe(want);
    save.release();
    const t = tail(kv());
    await expect(page.locator("#_t")).toHaveText(st === "absent" ? `${first} marked absent${t}. One court down next week.` : st === "late" ? `${first} marked late${t}` : `${first} confirmed present${t}`);
    expect(await bg, "the refresh is repeated after the save, then shown").toBe(true);
    await expect(button).toHaveAttribute("aria-pressed", "true");
    expect(await page.evaluate((x) => S.current.attendance[x], id)).toBe(want);
  });
}

// ── A quick second tap on the Players tag waits for the first save ──
for (let i = 0; i < 8; i++) {
  const live: LiveState = i % 2 ? "r2-partial" : "r1-partial";
  test(`Quick taps ${nn(i)} · a second tap on the Players tag is saved after the first, not refused (${live})`, async () => {
    const L = genLeague(57100 + i, { ...variety(57100 + i), regulars: 16 + i, spares: 2, pending: 0, live, sessions: 1 + (i % 4), dates: ctx.dates });
    const cur = L.current!, seated = Object.values(cur.assignments as Record<string, number[]>).flat();
    // A seated player the courts can do without (reference model), unmarked as at the start of a session.
    const id = seated.find((x) => (reference({ ...adjustInput({ ...structuredClone(cur), attendance: { ...(cur.attendance || {}), [x]: "present" } } as never), absent: [x], returning: [], late: [] }) as { ok: boolean }).ok)!;
    expect(id, "a player who can be marked absent").toBeTruthy();
    if (cur.attendance) delete cur.attendance[id];
    await load(ctx, L);
    const page = ctx.page;
    await page.evaluate(() => { nav("admin"); showSec("admin", "a-pl"); });
    const tag = page.locator(`#a-pl-list span[onclick="togglePlayerPresence(${id})"]`);
    await expect(tag).toHaveText("—");
    const first = holdRpc("set_state");
    await tag.click();
    await expect(tag, "the first tap shows at once").toHaveText("✅");
    await first.asked;                                  // saved in the database; its reply is on its way
    await tag.click();                                  // the second tap, before that reply
    first.release();
    await expect(tag, "the second tap is saved after the first").toHaveText("❌");
    await expect.poll(() => kv().attendance[id], { message: "stored absent" }).toBe("absent");
    await expect(page.locator("#_t")).not.toContainText("Someone else saved newer changes");
  });
}

// ── Before a session: a tap on the Players tag survives a refresh during its one-second wait ──
for (let i = 0; i < 6; i++) {
  test(`Waiting save ${nn(i)} · a Players tag tap before the session survives a refresh while its save waits`, async () => {
    const L = genLeague(57200 + i, { ...variety(57200 + i), regulars: 12 + 2 * i, spares: 2, pending: 0, live: "none", sessions: 1 + (i % 3), hoursBefore: 30 + i * 10, dates: ctx.dates });
    await load(ctx, L);
    const page = ctx.page;
    await page.evaluate(() => { nav("admin"); showSec("admin", "a-pl"); });
    const tags = page.locator(`#a-pl-list span[onclick^="togglePlayerPresence("]`), n = await tags.count();
    expect(n, "players with a presence tag").toBeGreaterThan(0);
    // The list is drawn again after a tap, so the player's tag is found by its player, not its position.
    const id = Number((await tags.nth(i % n).getAttribute("onclick"))!.match(/\d+/)![0]), tag = page.locator(`#a-pl-list span[onclick="togglePlayerPresence(${id})"]`);
    const before = (await tag.textContent())!.trim();
    await tag.click();
    await expect(tag, "the tap shows at once").not.toHaveText(before);
    const shown = (await tag.textContent())!.trim();
    expect(await backgroundRefresh(page), "the refresh waits for the save, then shows").toBe(true);
    await expect(tag, "the tap is still shown after the refresh").toHaveText(shown);
    const stored = shown === "✅" ? "present" : shown === "❌" ? "absent" : undefined;
    await expect.poll(() => JSON.parse(ctx.state.state["pre_session_attendance"]?.value ?? "{}")[id], { message: "saved after the short pause", timeout: 8000 }).toBe(stored);
  });
}
