// p76, from the organizer looking at the live site: the Courts tab drew the PREVIOUS round's arrows; the court grids
// disagreed on where Court 6 sits; the gym carried NET / Entrance Side / Back Wall labels; and Rankings showed a 📈/📉
// guessed from the player's court instead of what their Elo actually did. Expected here: arrows that match the moves
// which produced the courts on screen, one order everywhere (1 2 3 on top, 6 5 4 below), no wall labels, and an Elo
// change measured against the independent reference model.
import { test, expect } from "@playwright/test";
import { openAs, closeCtx, load, type Ctx } from "./harness";
import { genLeague, variety, type GenOpts, type League } from "./gen";
import { eloReference, type Sess } from "../helpers";

let ctx: Ctx;
test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
test.afterAll(async () => { await closeCtx(ctx); });

for (let i = 0; i < 4; i++) {
  test(`Courts layout ${String(i + 1).padStart(3, "0")} · the gym's arrows are the moves that made these courts, and every grid keeps Court 6 bottom left`, async () => {
    const opts: GenOpts = { ...variety(i + 940), regulars: 14 + i * 2, spares: 0, pending: 0, live: i % 2 ? "complete" : "r2-partial", sessions: 1 + (i % 2) };
    const L = genLeague(57000 + i, { ...opts, dates: ctx.dates });
    test.skip(!L.current, "needs a live session");
    await load(ctx, L);
    const page = ctx.page;
    await page.evaluate(() => nav("courts"));

    // The arrows come from the round that produced the courts on screen: the last one when the night is finished.
    const cy = L.current!.cycle, completed = !!L.current!.completed;
    const expectedMv: Record<string, string> = L.current!.movements?.find((m) => m.cycle === (completed ? cy : cy - 1))?.mv ?? {};
    const shownArrows = await page.evaluate(() => {
      const out: Record<string, string> = {};
      document.querySelectorAll("#court-gym-view .gc-player").forEach((el) => {
        const t = el.textContent || "";
        const name = t.replace(/[↑↓].*$/, "").trim();
        if (name && name !== "Open") out[name] = t.includes("↑") ? "up" : t.includes("↓") ? "down" : "stay";
      });
      return out;
    });
    const wrong = Object.entries(expectedMv)
      .filter(([id, dir]) => dir !== "stay")
      .map(([id, dir]) => ({ first: (L.players.find((p) => p.id === +id)?.name ?? "").split(" ")[0], dir }))
      .filter(({ first, dir }) => first && shownArrows[first] !== undefined && shownArrows[first] !== dir)
      .map(({ first, dir }) => `${first}: gym shows ${shownArrows[first]}, the round applied ${dir}`);
    expect(wrong, "the gym's arrows are the moves that produced these courts").toEqual([]);

    // One order everywhere: 1 2 3 across the top, 6 5 4 below.
    const gymOrder = await page.evaluate(() => [...document.querySelectorAll("#court-gym-view .gym-court")].map((e) => (e.textContent || "").trim().slice(0, 2)));
    expect(gymOrder, "the gym keeps Court 6 bottom left").toEqual(["C1", "C2", "C3", "C6", "C5", "C4"]);
    const trackerOrder = await page.evaluate(() => {
      const out: string[] = [];
      document.querySelectorAll("#round-tracker div").forEach((d) => {
        const head = d.firstElementChild?.textContent?.trim() ?? "";
        if (/^C[1-6]$/.test(head)) out.push(head);
      });
      return out.slice(0, 6);
    });
    if (trackerOrder.length === 6) expect(trackerOrder, "the round cards use the same order").toEqual(["C1", "C2", "C3", "C6", "C5", "C4"]);

    // The gym is a plain set of courts: no wall or net labels.
    const gymText = await page.evaluate(() => document.getElementById("court-gym-view")?.textContent || "");
    for (const label of ["Entrance", "Back Wall", "NET"]) expect(gymText, `no "${label}" label`).not.toContain(label);
  });
}

test("Rankings · the arrow is the Elo change over this session, checked against the reference model", async () => {
  const opts: GenOpts = { ...variety(947), regulars: 16, spares: 0, pending: 0, live: "complete", sessions: 2 };
  const L = genLeague(57100, { ...opts, dates: ctx.dates });
  test.skip(!L.current || !L.sessions.length, "needs a finished session and history");
  await load(ctx, L);
  const page = ctx.page;
  await page.evaluate(() => { nav("standings"); showSec("standings", "rank"); });

  // Independent expectation: every session's ratings, minus the same without the session being played.
  const all = [...L.sessions, L.current!] as Sess[];
  const now = eloReference(ctx.state.players, all), before = eloReference(ctx.state.players, all.slice(0, -1));
  const rows = await page.$$eval("#sec-rank .lbrow", (els) => els.map((r) => ({ name: (r.querySelector(".lbname")?.textContent || "").trim(), text: r.textContent || "" })));
  expect(rows.length, "the rankings list every player").toBeGreaterThan(0);
  const mismatches: string[] = [];
  for (const row of rows) {
    const p = L.players.find((x) => row.name.startsWith(x.name));
    if (!p || now[p.id] === undefined) continue;
    const want = Math.round(now[p.id] - (before[p.id] ?? now[p.id]));
    const m = row.text.match(/([▲▼])\s*([+-]?\d+)/);
    const got = m ? parseInt(m[2]) : 0;
    const arrow = m ? m[1] : "none";
    if (got !== want || (want > 0 && arrow !== "▲") || (want < 0 && arrow !== "▼")) mismatches.push(`${p.name}: shows ${arrow} ${got}, the session moved them ${want}`);
  }
  expect(mismatches, "each arrow is the real change, in the right direction").toEqual([]);
  await expect(page.locator("#sec-rank"), "no guessed trend emoji").not.toContainText("📈");
  await expect(page.locator("#sec-rank"), "no guessed trend emoji").not.toContainText("📉");
});
