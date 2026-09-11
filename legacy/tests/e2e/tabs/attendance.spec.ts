// Admin → Attendance: tonight's counts, each court with votes and open slots, the spare pool, excused decliners, confirmed
// spares, past sessions (expand to see names), and marking present / absent / saving — before and during a session.
import { test, expect } from "@playwright/test";
import { openAs, closeCtx, load, norm, type Ctx } from "./harness";
import { genLeague, variety, rng, NC, type LiveState } from "./gen";
import { courtOf } from "./oracle";

const LIVES: LiveState[] = ["none", "r1-partial", "r2-partial", "r1-done"];
let ctx: Ctx;
test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
test.afterAll(async () => { await closeCtx(ctx); });
for (let i = 0; i < 100; i++) {
  const opts = { ...variety(i + 10), live: LIVES[i % 4], absentRate: 0.4, declineRate: 0.2 };
  test(`Attendance ${String(i + 1).padStart(3, "0")} · ${genLeague(20000 + i, opts).title}`, async () => {
    const L = genLeague(20000 + i, { ...opts, dates: ctx.dates });
    await load(ctx, L);
    const page = ctx.page, r = rng(110 + i), toast = page.locator("#_t"), P = L.players, cur = L.current, sec = page.locator("#sec-a-att");
    const kv = (k: string) => { const v = ctx.state.state[k]; return v && v.value !== "null" ? JSON.parse(v.value) : null; };
    await page.evaluate(() => nav("admin"));
    await page.getByRole("button", { name: "📋 Attendance" }).click();
    const att: Record<string, string> = cur ? cur.attendance : {}, U = cur ? cur.number : Math.min(L.sessions.length + 1, 28);
    await expect(sec.locator(".card-title").first()).toHaveText(`📋 Session ${cur ? cur.number : L.sessions.length + 1} Attendance`);
    const courtIds = (c: number) => (cur ? cur.assignments[c] || [] : P.filter((p) => p.current_court === c).map((p) => p.id));
    const all = [1, 2, 3, 4, 5, 6].flatMap(courtIds);
    const tags = (await sec.locator(".card").first().locator("> div[style*='display:flex'] .tag").allTextContents()).map(norm);
    expect(tags, "present / absent / unmarked").toEqual([`✅ ${Object.values(att).filter((v) => v === "present").length} Present`, `❌ ${Object.values(att).filter((v) => v === "absent").length} Absent`, `— ${all.filter((id) => !att[id]).length} Unmarked`]);
    const vote: Record<number, string> = {}; L.rsvps.filter((x) => x.session_number === U).sort((a, b) => a.updated_at.localeCompare(b.updated_at)).forEach((x) => (vote[x.player_id] = x.response));
    const blocks = sec.locator(".card").first().locator("> div[style*='border-radius:8px;padding:8px']");
    const used = [1, 2, 3, 4, 5, 6].filter((c) => courtIds(c).length);
    await expect(blocks).toHaveCount(used.length);
    for (let b = 0; b < used.length; b++) {
      const c = used[b], ids = courtIds(c), blk = blocks.nth(b);
      await expect(blk.locator("> div").first()).toHaveText(`Court ${c} (${ids.length}/${Math.max(4, ids.length)})`);
      const names = (await blk.locator("div:has(> button[onclick^='markAttForTab']) > span:first-child").allTextContents()).map(norm);
      expect(names, `Court ${c}: players and their votes`).toEqual(ids.map((id) => `${P.find((p) => p.id === id)!.name.split(" ")[0]} ${vote[id] === "coming" ? "voted in" : vote[id] === "notcoming" ? "voted out" : "no vote"}`));
      await expect(blk.getByText("🪑 Open slot")).toHaveCount(Math.max(0, 4 - ids.length));
    }
    const pool = P.filter((p) => !p.current_court);
    const poolCard = sec.locator(".card").filter({ has: page.locator(".card-title", { hasText: /^🪑 Spare Pool/ }) });
    await expect(poolCard).toHaveCount(pool.length ? 1 : 0);
    if (pool.length) expect((await poolCard.locator("div:has(> button[onclick^='callInSpare']) > span").allTextContents()).map(norm)).toEqual(pool.map((p) => p.name + (p.membership_type === "spare" ? "SPARE" : "")));
    const excused = P.filter((p) => att[p.id] === "declined");
    await expect(sec.locator("#excused-tonight")).toHaveCount(excused.length ? 1 : 0);
    if (excused.length) await expect(sec.locator("#excused-tonight")).toContainText(`${excused.length} regular${excused.length === 1 ? "" : "s"} declined in time — no court penalty.`);
    const past = [...L.sessions].reverse(), pastCard = sec.locator(".card").filter({ has: page.locator(".card-title", { hasText: "📅 Past Attendance" }) });
    await expect(pastCard).toHaveCount(past.length ? 1 : 0);
    for (let k = 0; k < past.length; k++) {
      const s = past[k], pres = Object.values(s.attendance).filter((v) => v === "present").length, abs = Object.values(s.attendance).filter((v) => v === "absent").length;
      expect(norm(await pastCard.locator("> div[style*='padding:8px 0'] > div:first-child").nth(k).innerText())).toBe(norm(`Session ${s.number} — ${s.date} ✅ ${pres}${abs ? ` ❌ ${abs}` : ""}`));
    }
    const act = i % 4;
    if (act === 2 && past.length) {
      const k = Math.floor(r() * past.length), s = past[k];
      await pastCard.locator("> div[style*='padding:8px 0'] > div:first-child").nth(k).click();
      const open = sec.locator(".card").filter({ has: page.locator(".card-title", { hasText: "📅 Past Attendance" }) }).locator("> div[style*='padding:8px 0']").nth(k);
      const nm = (st: string) => Object.entries(s.attendance).filter(([, v]) => v === st).map(([id]) => P.find((p) => p.id === +id)?.name || "?");
      await expect(open).toContainText(nm("absent").length ? "Absent (" : "Full attendance — everyone present!");
      const shown = norm(await open.innerText());
      if (nm("present").length) expect(shown).toContain(`Present (${nm("present").length}): ${nm("present").join(", ")}`);
      expect(shown).toContain(nm("absent").length ? `Absent (${nm("absent").length}): ${nm("absent").join(", ")}` : "Full attendance — everyone present!");
      return;
    }
    if (act === 3 || !all.length) {
      await sec.getByRole("button", { name: "💾 Save Attendance" }).click();
      await expect(toast).toHaveText("Attendance saved!");
      return;
    }
    const n = Math.floor(r() * all.length), id = all[n], c = [1, 2, 3, 4, 5, 6].find((x) => courtIds(x).includes(id))!, first = P.find((p) => p.id === id)!.name.split(" ")[0];
    const row = sec.locator(".card").first().locator("div:has(> button[onclick^='markAttForTab'])").nth(n);
    if (act === 0) {
      await row.getByRole("button", { name: "✅" }).click();
      await expect(toast).toHaveText(`${first} confirmed present`);
      await expect.poll(() => (cur ? kv("current_session")?.attendance?.[id] : kv("pre_session_attendance")?.[id]), { message: "saved" }).toBe("present");
    } else {
      await row.getByRole("button", { name: "❌" }).click();
      await expect(toast).toHaveText(`${first} marked absent — off Court ${c} tonight, one court down next week`);
      if (cur) { const cs = kv("current_session"); expect({ att: cs.attendance[id], from: cs.absentFrom[id], seated: courtOf(cs.assignments, id) }).toEqual({ att: "absent", from: c, seated: 0 }); }
      else await expect.poll(() => kv("pre_session_attendance")?.[id], { message: "saved" }).toBe("absent");
    }
  });
}
