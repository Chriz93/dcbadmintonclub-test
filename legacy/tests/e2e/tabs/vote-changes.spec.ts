// Admin Home → Vote changes: the latest 20 changes, newest first — player (or #id once removed), old → new answer,
// session, the "after deadline" and "by admin" marks and the time — and an organizer override appearing at the top
// straight away. 100 leagues.
import { test, expect } from "@playwright/test";
import { openAs, closeCtx, load, refresh, norm, type Ctx } from "./harness";
import { genLeague, variety, rng, type Player } from "./gen";

const H = 3600e3;
const word = (v: string | null) => (v === "coming" ? "coming" : v === "notcoming" ? "not coming" : v || "—");
let ctx: Ctx;
test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
test.afterAll(async () => { await closeCtx(ctx); });
for (let i = 0; i < 100; i++) {
  const base = variety(i + 17);
  const opts = { ...base, regulars: Math.max(6, base.regulars ?? 6), live: "none" as const, hoursBefore: [100, 60, 40, 10][i % 4] };
  test(`Vote changes ${String(i + 1).padStart(3, "0")} · ${genLeague(27000 + i, opts).title}`, async () => {
    const L = genLeague(27000 + i, { ...opts, dates: ctx.dates });
    await load(ctx, L);
    const page = ctx.page, r = rng(400 + i), U = L.upcoming, ids = L.players.map((p) => p.id);
    const n = i % 10 === 0 ? 0 : 1 + Math.floor(r() * 30);
    for (let k = 0; k < n; k++) {
      const s = 1 + Math.floor(r() * U), at = ctx.fd[s - 1] - (46 + (r() - 0.5) * 30) * H;   // either side of the 46-hour deadline
      ctx.state.rsvpLog.push({ id: k + 1, session_number: s, player_id: r() < 0.05 ? 9000 + k : ids[Math.floor(r() * ids.length)], old_response: r() < 0.3 ? null : r() < 0.5 ? "coming" : "notcoming",
        new_response: r() < 0.5 ? "coming" : "notcoming", by_admin: r() < 0.25, changed_at: new Date(at).toISOString() });
    }
    await refresh(ctx);
    await page.evaluate(() => nav("home"));
    const card = page.locator("#vote-changes");
    // p88: the changes are a table grouped by what the answer became — comings together, not-comings together —
    // each group still newest first, and the twenty most recent changes in total.
    const expectRows = async () => {
      const log = [...ctx.state.rsvpLog].reverse().slice(0, 20);
      if (!log.length) return expect(card).toContainText("No votes yet.");
      const times = await page.evaluate((xs) => xs.map((x) => new Date(x).toLocaleString("en-CA", { timeZone: "America/Toronto", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })), log.map((x) => x.changed_at));
      const shown = await card.evaluate((el) => {
        const out: { group: string; cells: string[] }[] = []; let head = "";
        for (const tr of el.querySelectorAll("tr")) {
          const txt = (c: Element) => (c.textContent || "").replace(/\s+/g, " ").trim();
          if (tr.classList.contains("vg")) head = txt(tr).replace(/\s*\(\d+\)\s*$/, "");
          else if (tr.classList.contains("vc-row")) out.push({ group: head, cells: [...tr.children].map(txt) });
        }
        return out;
      });
      const want = ["coming", "notcoming"].flatMap((k) => log.map((x, idx) => ({ x, idx })).filter(({ x }) => x.new_response === k).map(({ x, idx }) => {
        const p = L.players.find((q) => q.id === x.player_id), late = Date.parse(x.changed_at) > ctx.fd[x.session_number - 1] - 46 * H && !x.by_admin;
        return { group: k === "coming" ? "✅ Now coming" : "❌ Now not coming",
          cells: [norm(`${p ? p.name : "#" + x.player_id}${late ? " after deadline" : ""}${x.by_admin ? " by admin" : ""}`), x.old_response ? word(x.old_response) : "no answer", `S${x.session_number}`, times[idx]] };
      }));
      expect(shown, "grouped by the new answer, newest first within each group, at most 20 in total").toEqual(want);
      // Each group heading counts the rows underneath it.
      for (const g of ["✅ Now coming", "❌ Now not coming"])
        await expect(card.locator("tr.vg", { hasText: g })).toContainText(`(${want.filter((w) => w.group === g).length})`);
    };
    await expectRows();
    if (i % 3 !== 1) return;
    // An organizer override shows at the top at once, marked "by admin".
    const isReg = (p: Player) => p.approved && !p.waitlisted && p.membership_type !== "spare", isSpare = (p: Player) => p.approved && p.membership_type === "spare";
    const list = [...L.players.filter(isReg), ...L.players.filter(isSpare)], who = list[Math.floor(r() * list.length)];
    const prev = L.rsvps.find((x) => x.session_number === U && x.player_id === who.id)?.response ?? null, resp = prev === "coming" ? "notcoming" : "coming";
    await page.evaluate(() => nav("standings"));
    await page.locator("#page-standings .ptab").filter({ hasText: /RSVP$/ }).click();
    await page.locator(`#vote-table tr.vote-row[data-pid="${who.id}"]`).locator(`button[title="${resp === "coming" ? "Set coming" : "Set not coming"}"]`).click(); // p85
    await expect(page.locator("#_t")).toHaveText(`Answer updated for ${who.name}`);
    await page.evaluate(() => nav("home"));
    // The override appears at the top of the group it belongs to, marked "by admin".
    const grp = resp === "coming" ? "✅ Now coming" : "❌ Now not coming";
    const first = card.locator(`tr.vg:has-text("${grp}") + tr.vc-row`);
    await expect(first.locator("td").first()).toHaveText(`${who.name} by admin`);
    await expect(first.locator("td").nth(1)).toHaveText(prev ? word(prev) : "no answer");
    await expect(first.locator("td").nth(2)).toHaveText(`S${U}`);
    await expectRows();
  });
}
