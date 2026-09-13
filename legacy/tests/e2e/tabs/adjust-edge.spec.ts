// Adjust courts when things go wrong or get busy: a double click, two organizers at once, a failed save and a retry, a
// save that someone else beat, one or no players left, an override that breaks the rules, a court with scores, the
// keyboard, Undo step by step, Late then Present, a reload in the middle. Expectations from the reference model.
import { test, expect, type Page } from "@playwright/test";
import { openAs, closeCtx, load, refresh, pinSession, norm, type Ctx } from "./harness";
import { signIn, unlockOrganizer } from "../helpers";
import { ORGANIZER } from "../mock-supabase";
import { genLeague, variety, type League } from "./gen";
import { courtOf } from "./oracle";
import { adjustInput, changes, sorted, explanation, validLineup, type RefResult } from "./adjust-oracle";
import { reference } from "../../unit/adjust-reference.mjs";

type Ref = RefResult & { moves: { id: number; from: number; to: number; reason?: string }[] };
const run = (inp: ReturnType<typeof adjustInput>) => reference(inp) as Ref;
type Kind = "double-click" | "two-organizers" | "save-fails" | "stale" | "one-left" | "nobody-left" | "bad-override" | "locked-court" | "keyboard" | "undo-steps" | "late-then-present" | "late-twice" | "reload";
const PLAN: [Kind, number][] = [["double-click", 5], ["two-organizers", 6], ["save-fails", 5], ["stale", 4], ["one-left", 3], ["nobody-left", 3], ["bad-override", 4], ["locked-court", 3], ["keyboard", 3], ["undo-steps", 3], ["late-then-present", 3], ["late-twice", 2], ["reload", 2]];

/** A live round 1 with no score yet in the current round (so every court can change), unless keep says otherwise. */
function league(seed: number, keep = false): League {
  const L = genLeague(seed, { ...variety(seed), regulars: 14 + (seed % 11), spares: 2, live: "r1-partial", absentRate: 0, declineRate: 0.1 });
  if (!keep && L.current) L.current.scores = Object.fromEntries(Object.entries(L.current.scores).filter(([k]) => !k.includes(`_y${L.current!.cycle}_`)));
  return L;
}
const seatedOn = (L: League, min: number) => { const a = L.current!.assignments; return [1, 2, 3, 4, 5, 6].find((c) => (a[c] || []).length >= min)!; };

let ctx: Ctx;
test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
test.afterAll(async () => { await closeCtx(ctx); });
let n = 0;
for (const [kind, times] of PLAN) for (let t = 0; t < times; t++) {
  const seed = 46000 + n++;
  test(`Adjust edge ${String(n).padStart(3, "0")} · ${kind} · ${genLeague(seed, { ...variety(seed), regulars: 14 + (seed % 11), spares: 2, live: "r1-partial" }).title}`, async ({ browser }) => {
    const L = league(seed, kind === "locked-court");
    await load(ctx, L);
    const page = ctx.page, toast = page.locator("#_t"), modal = page.locator("#modal.open"), cur = L.current!;
    const kv = () => JSON.parse(ctx.state.state["current_session"].value), ver = () => ctx.state.state["current_session"].version;
    const nm = (id: number) => L.players.find((p) => p.id === id)?.name ?? "Player";
    const openTab = async (p: Page) => { await p.evaluate(() => nav("admin")); await p.getByRole("button", { name: "📋 Attendance" }).click(); };
    const mark = async (p: Page, id: number, st: string) => { const v0 = ver(), c = courtOf(kv().assignments, id); await p.locator(`#sec-a-att button[onclick="markAttForTab(${id},'${st}',${c})"]`).click(); await expect.poll(ver).toBeGreaterThan(v0); };
    await openTab(page);
    const c = seatedOn(L, 3), victim = cur.assignments[c][0];
    const sets = () => ctx.state.requests.filter((r) => r.includes("/rpc/set_state")).length;
    // Wait until the page has finished its current step (the preview or a save): Adjust courts is busy until then.
    const settled = async (p: Page = page) => { await expect.poll(() => p.evaluate(() => _adjusting), { message: "Adjust courts finished" }).toBe(false); };

    if (kind === "double-click") {
      await mark(page, victim, "absent");
      await page.locator("#adj-btn").click(); await expect(modal).toBeVisible();
      const s0 = sets(), u0 = ctx.state.undo.length;
      await modal.locator("#adj-apply").dblclick();
      await expect(toast).toContainText(`Courts adjusted for Round ${cur.cycle}`);
      await expect.poll(sets).toBe(s0 + 1);
      expect(ctx.state.undo.length, "one undo step").toBe(u0 + 1);
      expect(courtOf(kv().assignments, victim)).toBe(0);
      return;
    }
    if (kind === "two-organizers") {
      const other = await openAs(browser, "admin", ctx.state.nowMs, ctx.state);
      try {
        await refresh(other); await openTab(other.page);
        await mark(page, victim, "absent");
        await page.locator("#adj-btn").click(); await expect(modal).toBeVisible();
        // Meanwhile the other organizer records a late arrival on another court (a change to tonight's session, not yet applied).
        const c2 = [1, 2, 3, 4, 5, 6].find((x) => x !== c && (kv().assignments[x] || []).length >= 3)!, v2 = kv().assignments[c2][0], v0 = ver();
        await refresh(other);
        await other.page.evaluate((id) => markAttForTab(id, "late"), v2);
        await expect.poll(ver).toBeGreaterThan(v0);
        const mid = kv();
        if (t % 2) {
          // This page synced in the meantime: Apply rebuilds the preview from the newer courts instead of saving.
          await page.evaluate(async () => { await loadAll(); });
          await modal.locator("#adj-apply").click();
          await expect(page.locator("#modal.open .alert-warn")).toHaveText("The courts changed while you were looking — this is the updated proposal.");
          expect(kv(), "nothing saved yet").toEqual(mid);
          await page.locator("#modal.open #adj-apply").click();
        } else {
          // This page had not synced: its save is refused by the version check and nothing is overwritten.
          await modal.locator("#adj-apply").click();
          await expect(toast).toHaveText("⚠️ Someone else saved newer changes — reloading");
          await settled();
          await expect(page.locator("#modal.open"), "the stale preview is closed").toHaveCount(0);
          expect(kv(), "the other organizer's courts stand").toEqual(mid);
          await page.locator("#adj-btn").click(); await page.locator("#modal.open #adj-apply").click();
        }
        await expect(toast).toContainText(`Courts adjusted for Round ${cur.cycle}`);
        const fin = kv(); expect(courtOf(fin.assignments, victim), "the first organizer's absence applied").toBe(0);
        expect(sorted(fin.assignments), "the final courts are the rules applied to both organizers' changes").toEqual(sorted(run(adjustInput(mid)).lineup));
        expect((fin.latePlayers || []).filter((l: { playerId: number; pending?: boolean }) => l.playerId === v2 && l.pending), "the other organizer's late arrival settled too").toEqual([]);
      } finally { await closeCtx(other); }
      return;
    }
    if (kind === "save-fails") {
      await mark(page, victim, "absent");
      const before = kv();
      await page.locator("#adj-btn").click(); await expect(modal).toBeVisible();
      await page.route("**/rest/v1/rpc/set_state", (r) => r.abort("failed"), { times: 1 });
      await modal.locator("#adj-apply").click();
      await expect(toast).toHaveText(/^Courts not changed: .+\. Try again\.$/);
      expect(kv(), "a failed save changes nothing").toEqual(before);
      await expect(page.locator("#modal.open")).toHaveCount(0);
      await settled();
      await page.locator("#adj-btn").click(); await page.locator("#modal.open #adj-apply").click();
      await expect(toast).toContainText(`Courts adjusted for Round ${cur.cycle}`);
      expect(sorted(kv().assignments)).toEqual(sorted(run(adjustInput(before)).lineup));
      return;
    }
    if (kind === "stale") {
      await mark(page, victim, "absent");
      await page.locator("#adj-btn").click(); await expect(modal).toBeVisible();
      const before = kv(); ctx.state.state["current_session"].version += 1;   // someone else saved in the meantime
      await modal.locator("#adj-apply").click();
      await expect(toast).toHaveText("⚠️ Someone else saved newer changes — reloading");
      await settled();
      expect(kv().assignments, "nothing overwritten").toEqual(before.assignments);
      await expect(page.locator("#modal.open"), "the stale preview is closed").toHaveCount(0);
      return;
    }
    if (kind === "one-left" || kind === "nobody-left") {
      const all = Object.values(kv().assignments).flat() as number[], keep = kind === "one-left" ? all.slice(0, 1) : [];
      for (const id of all) if (!keep.includes(id)) await page.evaluate((x) => markAttForTab(x, "absent"), id);
      const st = kv(), inp = adjustInput(st), ref = run(inp);
      await page.locator("#adj-btn").click();
      if (kind === "one-left") {
        await expect(page.locator("#modal.open #adj-explain .alert-error")).toHaveText("Only one player is left to play — a game needs at least two. Nothing was changed.");
        await expect(page.locator("#modal.open #adj-apply")).toBeDisabled();
        expect(ref.ok).toBe(false); return;
      }
      await expect(page.locator("#modal.open #adj-explain li").last()).toHaveText("Nobody is left to play this round.");
      await page.locator("#modal.open #adj-apply").click();
      await expect(toast).toHaveText(`Courts adjusted for Round ${cur.cycle} — ${changes(ref)} change${changes(ref) === 1 ? "" : "s"}. Undo is on the Attendance tab.`);
      expect(Object.values(kv().assignments).flat(), "every court empty").toEqual([]);
      return;
    }
    if (kind === "bad-override") {
      // Three off one court: its last player must move, and the preview offers to send them elsewhere.
      const ids = kv().assignments[c] as number[];
      for (const id of ids.slice(0, ids.length - 1)) await page.evaluate((x) => markAttForTab(x, "absent"), id);
      const inp = adjustInput(kv()), ref = run(inp), m = ref.moves[0];
      await page.locator("#adj-btn").click(); await expect(page.locator("#modal.open")).toBeVisible();
      const bad = [1, 2, 3, 4, 5, 6].find((x) => { if (x === m.to) return false; const Lx: Record<string, number[]> = Object.fromEntries(Object.entries(ref.lineup).map(([k, v]) => [k, [...v]])); Lx[m.to] = Lx[m.to].filter((y) => y !== m.id); Lx[x] = [...Lx[x], m.id]; return !validLineup(Lx, inp); })!;
      await page.locator(`#modal.open select.adj-ov[data-id="${m.id}"]`).selectOption(String(bad));
      await expect(page.locator("#modal.open #adj-explain .alert-error")).toHaveText(/^Your change is not a valid round: /);
      await expect(page.locator("#modal.open #adj-apply")).toBeDisabled();
      await page.locator(`#modal.open select.adj-ov[data-id="${m.id}"]`).selectOption(String(m.to));
      await expect(page.locator("#modal.open #adj-apply"), "back to the proposal: allowed again").toBeEnabled();
      return;
    }
    if (kind === "locked-court") {
      const locked = [1, 2, 3, 4, 5, 6].filter((x) => Object.keys(cur.scores).some((k) => k.startsWith(`c${x}_y${cur.cycle}_`)));
      const other = [1, 2, 3, 4, 5, 6].find((x) => !locked.includes(x) && (cur.assignments[x] || []).length >= 3);
      if (other) await page.evaluate((x) => markAttForTab(x, "absent"), cur.assignments[other][0]);
      await page.locator("#adj-btn").click(); await settled();
      if (!(await page.locator("#modal.open").count())) { expect(changes(run(adjustInput(kv())))).toBe(0); return; }
      for (const x of locked) { await expect(page.locator(`#modal.open #adj-closed-${x}`)).toBeDisabled(); await expect(page.locator(`#modal.open label:has(#adj-closed-${x})`)).toContainText(`Court ${x} (has scores)`); }
      await expect(page.locator("#modal.open .adj-sizes")).toContainText(locked.length ? "🔒" : "C1");
      return;
    }
    if (kind === "keyboard") {
      await mark(page, victim, "absent");
      // Start from the top of the page and allow one press per focusable element: Adjust courts must be reachable with
      // Tab alone. (80 presses from wherever focus happened to land failed on a 26-player list under load.)
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      const stops = await page.evaluate(() => document.querySelectorAll("a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])").length);
      let found = false;
      for (let k = 0; k < stops + 5 && !found; k++) { await page.keyboard.press("Tab"); found = await page.evaluate(() => document.activeElement?.id === "adj-btn"); }
      expect(found, "Adjust courts is reachable with Tab").toBe(true);
      const outline = await page.evaluate(() => { const s = getComputedStyle(document.activeElement!); return parseFloat(s.outlineWidth) || 0; });
      expect(outline, "keyboard focus is visible").toBeGreaterThanOrEqual(2);
      await page.keyboard.press("Enter");
      await expect(page.locator("#modal.open")).toBeVisible();
      await page.locator("#modal.open #adj-apply").focus(); await page.keyboard.press("Enter");
      await expect(toast).toContainText(`Courts adjusted for Round ${cur.cycle}`);
      return;
    }
    if (kind === "undo-steps") {
      const s0 = kv();
      await mark(page, victim, "absent");
      const s1 = kv();
      await page.locator("#adj-btn").click(); await page.locator("#modal.open #adj-apply").click();
      await expect(toast).toContainText(`Courts adjusted for Round ${cur.cycle}`);
      await page.locator("#adj-undo").click(); await expect(toast).toHaveText(`Undone: Adjust courts (Round ${cur.cycle})`);
      expect(kv().assignments, "first Undo: the courts before Adjust").toEqual(s1.assignments);
      await page.evaluate(() => undoLast()); await expect(toast).toHaveText(`Undone: Mark ${nm(victim)} absent`);
      expect(kv().attendance?.[victim] ?? null, "second Undo: the attendance before the toggle").toBe(s0.attendance?.[victim] ?? null);
      return;
    }
    if (kind === "late-then-present" || kind === "late-twice") {
      const ids = kv().assignments[c] as number[], id = ids[0];
      await mark(page, id, "late");
      if (kind === "late-twice") { await page.evaluate((x) => markAttForTab(x, "late"), id); await expect(toast).toHaveText(`${nm(id).split(" ")[0]} is already marked late this round`); return; }
      await mark(page, id, "present");
      expect((kv().latePlayers || []).filter((l: { playerId: number; pending?: boolean }) => l.playerId === id && l.pending), "the waiting late move is withdrawn").toEqual([]);
      await page.locator("#adj-btn").click();
      await expect(toast).toHaveText("Courts already match attendance — nothing to change");
      return;
    }
    if (kind === "reload") {
      await mark(page, victim, "absent");
      const before = kv();
      await page.locator("#adj-btn").click(); await expect(modal).toBeVisible();
      await page.reload();
      // A reload starts from the sign-in screen, like closing the tab and coming back.
      await expect(page.locator("#invite-gate")).toBeVisible();
      await signIn(page, ORGANIZER); await unlockOrganizer(page);
      await pinSession(page);
      await page.evaluate(() => { clearInterval(_syncTimer); _syncTimer = null; });
      expect(kv(), "leaving in the middle changes nothing").toEqual(before);
      await openTab(page);
      await expect(page.locator("#adj-sum")).toContainText(`${changes(run(adjustInput(before)))} court change`);
      expect(norm(await page.locator("#adj-sum").innerText())).toContain(`Round ${cur.cycle}`);
      void explanation;
    }
  });
}
