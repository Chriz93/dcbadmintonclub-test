// p85: the 🔔 beside a player who has not answered asks the scheduled job to remind that one player.
// The organizer asked for "a small email remainder tab beside them to remind about voting". The browser never sends
// email — it queues a request the GitHub job picks up — so what this checks is the request that is written.
import { test, expect } from "@playwright/test";
import { openAs, closeCtx, load, type Ctx } from "./harness";
import { genLeague, variety, type GenOpts, type League } from "./gen";

let ctx: Ctx;
test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
test.afterAll(async () => { await closeCtx(ctx); });

test("the reminder button asks for one player, and only for players who have not answered", async () => {
  const opts: GenOpts = { ...variety(7), regulars: 18, spares: 2, pending: 0, live: "none", sessions: 1 };
  const L: League = genLeague(56004, { ...opts, dates: ctx.dates });
  await load(ctx, L);
  const page = ctx.page;
  await page.evaluate(() => { nav("standings"); showSec("standings", "vote"); });
  const table = page.locator("#vote-table");
  await expect(table).toBeVisible();

  const U = L.upcoming;
  const answered = new Set(L.rsvps.filter((r) => r.session_number === U).map((r) => r.player_id));
  const silent = (await table.locator("tr.vote-row:has(button.vote-remind)")
    .evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-pid")))));
  expect(silent.length, "somebody has not answered in this league").toBeGreaterThan(0);
  expect(silent.filter((id) => answered.has(id)), "nobody who answered is offered a reminder").toEqual([]);

  const who = silent[0];
  // The row's 🔔 is the single-player path, not the bulk one that writes to everyone who is silent.
  await expect(table.locator(`tr.vote-row[data-pid="${who}"] button.vote-remind`))
    .toHaveAttribute("onclick", `remindOnePlayer(${who})`);
  await table.locator(`tr.vote-row[data-pid="${who}"] button.vote-remind`).click();
  // The queued request is read from the audit the job dispatch records, which outlives the request row itself.
  await expect.poll(() => ctx.state.audit.filter((x) => x.action === "dispatch").length, { timeout: 5000 }).toBeGreaterThan(0);
  const req = JSON.parse(ctx.state.audit.filter((x) => x.action === "dispatch").at(-1)!.subject!);
  expect(req, "the request names the session, the kind and the one player").toMatchObject({ kind: "vote", session: U, players: [who] });
  // The page queues the request; it never carries a mail transport of its own.
  expect(await page.evaluate(() => /smtp\.|nodemailer/i.test(document.documentElement.innerHTML))).toBe(false);
});

test("the bulk reminder still asks for everyone who has not answered", async () => {
  const opts: GenOpts = { ...variety(9), regulars: 16, spares: 1, pending: 0, live: "none", sessions: 0 };
  const L: League = genLeague(56005, { ...opts, dates: ctx.dates });
  await load(ctx, L);
  const page = ctx.page;
  await page.evaluate(() => { nav("admin"); showSec("admin", "a-tools"); });
  await page.click("#reminder-tools-card button:has-text('vote reminders now')");
  await expect.poll(() => ctx.state.audit.filter((x) => x.action === "dispatch").length, { timeout: 5000 }).toBeGreaterThan(0);
  const req = JSON.parse(ctx.state.audit.filter((x) => x.action === "dispatch").at(-1)!.subject!);
  expect(req.kind).toBe("vote");
  expect(req.players, "no player list means everyone who is silent").toBeUndefined();
});

test("the session picker shows an earlier session's answers, and offers no buttons for a night already played", async () => {
  const opts: GenOpts = { ...variety(11), regulars: 20, spares: 2, pending: 0, live: "none", sessions: 3 };
  const L: League = genLeague(56006, { ...opts, dates: ctx.dates });
  await load(ctx, L);
  const page = ctx.page;
  await page.evaluate(() => { nav("standings"); showSec("standings", "vote"); });
  const table = page.locator("#vote-table");
  const U = L.upcoming, past = U - 1;
  await expect(page.locator("#vote-sess"), "it opens on the upcoming session").toHaveValue(String(U));

  // setVoteSession moves the whole table to the session chosen.
  await page.locator("#vote-sess").selectOption(String(past));
  await expect(page.locator("#vote-sess")).toHaveValue(String(past));
  await expect(table, "a night already played says so").toContainText(`Session ${past} has been played`);
  await expect(table.locator("button.admin-vote"), "no vote can be changed for a night already played").toHaveCount(0);
  await expect(table.locator("button.vote-remind"), "nobody is reminded about a night already played").toHaveCount(0);

  // Every row is that session's answer, taken from the record and not from the upcoming session's.
  const onRecord: Record<number, string> = {};
  for (const r of L.rsvps.filter((x) => x.session_number === past)) onRecord[r.player_id] = r.response;
  const grouped = await table.evaluate((el) => {
    const out: Record<string, number[]> = {}; let head = "";
    for (const tr of el.querySelectorAll("tr")) {
      if (tr.classList.contains("vg")) { head = (tr.textContent || "").replace(/\s*\(\d+\)\s*$/, "").trim(); out[head] = out[head] || []; }
      else if (tr.classList.contains("vote-row")) (out[head] = out[head] || []).push(Number(tr.getAttribute("data-pid")));
    }
    return out;
  });
  const groupOf = (v: string | undefined) => v === "coming" ? "✅ Coming" : v === "notcoming" ? "❌ Not coming" : "⏳ No answer";
  const listed = Object.values(grouped).flat();
  const wrong = listed.filter((id) => !(grouped[groupOf(onRecord[id])] || []).includes(id))
    .map((id) => `${id}: answered ${onRecord[id] ?? "nothing"} for session ${past}`);
  expect(wrong, "each row shows what that player answered for the session chosen").toEqual([]);

  // Back to the upcoming session, the buttons return.
  await page.locator("#vote-sess").selectOption(String(U));
  await expect(table.locator("button.admin-vote").first()).toBeVisible();
});
