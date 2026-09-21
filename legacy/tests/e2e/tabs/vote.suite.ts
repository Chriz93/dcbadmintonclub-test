// Voting — the Home card for players (regular, spare, awaiting approval) and Standings → RSVP for the organizer — across
// the week before a Tuesday: counts, spare seats, deadline and refund lines, one-tap answers, the 46-hour lock in the app
// and in the database, organizer overrides and the email-reminder switch. 100 leagues.
import { test, expect, type Page } from "@playwright/test";
import { openAs, closeCtx, load, norm, type Ctx } from "./harness";
import { genLeague, variety, rng, type League, type Player } from "./gen";
import { spareSeatCount } from "./oracle";

/** The suite's cases; the desktop and phone spec files both call this. */
export function define() {
  const PLAYER = "vote.tester@example.invalid";
  const HOURS = [150, 100, 80, 73, 71, 60, 47, 46.05, 45.95, 30, 5];
  const H = 3600e3;
  let admin: Ctx, player: Ctx;
  test.beforeAll(async ({ browser }) => { admin = await openAs(browser); player = await openAs(browser, PLAYER); });
  test.afterAll(async () => { await closeCtx(admin); await closeCtx(player); });

  function tally(L: League, U: number) {
    const byId = (id: number) => L.players.find((p) => p.id === id);
    const isReg = (p?: Player) => !!p && p.approved && !p.waitlisted && p.membership_type !== "spare";
    const isSpare = (p?: Player) => !!p && p.approved && p.membership_type === "spare";
    const rows = L.rsvps.filter((r) => r.session_number === U).sort((a, b) => a.updated_at.localeCompare(b.updated_at));
    const vote: Record<number, string> = {}; rows.forEach((r) => (vote[r.player_id] = r.response));
    const regs = L.players.filter(isReg), spares = L.players.filter(isSpare);
    const declined = rows.filter((r) => r.response === "notcoming" && isReg(byId(r.player_id))).length;
    // p69: seats for fewer than 24 regulars coming, decided when the regulars' vote closes (the reference's count).
    const sc = spareSeatCount(L), hold = (k: number) => sc.decided && k < sc.seats;
    const claims = rows.filter((r) => r.response === "coming" && isSpare(byId(r.player_id))).sort((a, b) => a.updated_at.localeCompare(b.updated_at) || a.player_id - b.player_id).map((r, k) => ({ id: r.player_id, rank: k + 1, reserved: hold(k), confirmed: hold(k) && L.payments.filter(x=>x.player_id===r.player_id&&x.kind==="spare"&&x.session_number===U).reduce((n,x)=>n+Number(x.amount),0)>=20 }));
    // p88: the headline counts everyone who was asked; the split table underneath keeps regulars and spares apart.
    const count = (list: Player[]) => [list.filter((p) => vote[p.id] === "coming").length, list.filter((p) => vote[p.id] === "notcoming").length, list.filter((p) => !vote[p.id]).length];
    const cReg = count(regs), cSpare = count(spares), cAll = cReg.map((n, k) => n + cSpare[k]);
    return { vote, regs, spares, declined, claims, sc, counts: cAll.map(String), split: { regular: cReg.map(String), spare: cSpare.map(String), total: cAll.map(String) },
      seats: sc.decided ? `Spare seats: ${Math.max(sc.seats - claims.length, 0)} open · ${claims.filter((c) => c.confirmed).length} confirmed · ${claims.filter((c) => !c.reserved).length} standby` : null };
  }
  /** The spare-seats line: before the deadline it gives the seats if the vote closed now and when they are decided. */
  async function seatsLine(page: Page, t: ReturnType<typeof tally>) {
    return t.seats ?? `Spare seats: ${t.sc.seats} if the vote closed now (${t.sc.coming} regulars coming) · decided ${(await fmtAll(page, [t.sc.deadline]))[0]}`;
  }
  const fmtAll = (page: Page, ms: number[]) => page.evaluate((xs) => xs.map((x) => new Date(x).toLocaleString("en-CA", { timeZone: "America/Toronto", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })), ms);
  async function timing(page: Page, start: number, now: number, spare: boolean, seats = 0) {
    const [deadline, cutoff] = await fmtAll(page, [start - 46 * H, start - 72 * H]);
    // p69: spare seats are decided when the regulars' vote closes; then the seats this session, or none.
    if (spare) return now <= start - 46 * H ? `Spare seats are decided when the regulars' vote closes (${deadline}): with fewer than 24 regulars coming, available spares fill the seats in the order they replied, confirmed once paid. You can already say if you are available.` : seats ? `${seats} spare seat${seats === 1 ? "" : "s"} this session, taken in the order spares replied and confirmed once paid.` : "24 or more regulars are coming — no spare seats this session.";
    return (now <= start - 46 * H ? `Vote by ${deadline} (46 hours before play) — after that your answer is final. ` : `Voting closed ${deadline}. To change your answer, message the admin in the group — only the admin can update it now. `)
      + (now <= start - 72 * H ? `$14 refund if you decline by ${cutoff}.` : `The 72-hour refund window closed ${cutoff}.`);
  }
  async function header(ctx: Ctx, card: ReturnType<Page["locator"]>, L: League, U: number, spare: boolean) {
    const t = tally(L, U);
    await expect(card.locator(".card-title").first()).toHaveText(`🗳️ ${spare ? "Spare" : "Vote"}: are you ${spare ? "available for" : "playing"} Session ${U} (${ctx.dates[U - 1]})?`);
    expect(await card.locator("div[style*='1fr 1fr 1fr'] > div > div:first-child").allTextContents(), "coming / not coming / no reply, spares included").toEqual(t.counts);
    // The split table appears whenever there are spares to split out, and its total row is the headline again.
    const split = card.locator("table.vote-split");
    if (t.spares.length) {
      for (const g of ["regular", "spare", "total"] as const)
        expect(await split.locator(`tr[data-g="${g}"] td:not(:first-child)`).allTextContents(), `the ${g} row`).toEqual(t.split[g]);
    } else await expect(split, "nothing to split when the league has no spares").toHaveCount(0);
    expect(norm((await card.locator(".spare-seats-line").textContent()) || "")).toBe(await seatsLine(ctx.page, t));
    expect(norm((await card.locator(".vote-timing").textContent()) || "")).toBe(norm(await timing(ctx.page, ctx.fd[U - 1], L.nowMs, spare, t.sc.seats)));
    return t;
  }

  for (let i = 0; i < 100; i++) {
    const asPlayer = i % 2 === 0;
    const kind = (["regular", "spare", "regular", "pending"] as const)[Math.floor(i / 2) % 4];
    const base = variety(i + 4);
    const opts = { ...base, regulars: Math.max(6, base.regulars ?? 6), live: i % 10 === 9 ? base.live : ("none" as const), hoursBefore: HOURS[i % HOURS.length],
      ...(asPlayer ? { viewerEmail: PLAYER, viewerKind: kind, spares: kind === "spare" ? Math.max(1, base.spares ?? 1) : base.spares, pending: kind === "pending" ? 1 : 0 } : {}) };
    test(`Vote ${String(i + 1).padStart(3, "0")} · ${asPlayer ? kind + " player" : "organizer"} · ${HOURS[i % HOURS.length]} h before · ${genLeague(14000 + i, opts).title}`, async () => {
      const ctx = asPlayer ? player : admin, page = ctx.page, r = rng(700 + i), toast = page.locator("#_t");
      const L = genLeague(14000 + i, { ...opts, dates: ctx.dates });
      await load(ctx, L);
      const U = L.current ? L.current.number : Math.min(L.sessions.length + 1, 28);
      const dbVote = (id: number) => ctx.state.rsvps.find((x) => x.session_number === U && x.player_id === id)?.response;

      if (!asPlayer) {
        await page.evaluate(() => nav("standings"));
        await page.locator("#page-standings .ptab").filter({ hasText: /RSVP$/ }).click();
        const sec = page.locator("#sec-vote");
        await expect(sec.locator(".alert").first()).toHaveText(`📋 RSVP for Session ${U}${L.current ? " (tonight)" : ""}`);
        const t = await header(ctx, sec.locator(".card").first(), L, U, false);
        await expect(sec).toContainText("Your registration must be approved before you can RSVP.");
        // p85: the RSVP list is a table for one session, grouped by the answer, regulars before spares.
        const table = sec.locator("#vote-table");
        const rows = table.locator("tr.vote-row");
        const list = [...t.regs, ...t.spares];
        await expect(rows).toHaveCount(list.length);
        // Every player appears exactly once, under the group that matches the answer on record.
        const grouped = await table.evaluate((el) => {
          const out: Record<string, number[]> = {}; let head = "";
          for (const tr of el.querySelectorAll("tr")) {
            if (tr.classList.contains("vg")) { head = (tr.textContent || "").replace(/\s*\(\d+\)\s*$/, "").trim(); out[head] = out[head] || []; }
            else if (tr.classList.contains("vote-row")) (out[head] = out[head] || []).push(Number(tr.getAttribute("data-pid")));
          }
          return out;
        });
        const groupOf = (v: string | undefined) => v === "coming" ? "✅ Coming" : v === "notcoming" ? "❌ Not coming" : "⏳ No answer";
        const misplaced = list.filter((p) => !(grouped[groupOf(t.vote[p.id])] || []).includes(p.id))
          .map((p) => `${p.name}: answered ${t.vote[p.id] ?? "nothing"}`);
        expect(misplaced, "each player sits under the answer they gave").toEqual([]);
        expect(Object.values(grouped).flat().sort((a, b) => a - b), "listed once each").toEqual(list.map((p) => p.id).sort((a, b) => a - b));
        // The counts in the heading and the three chips agree with the rows underneath.
        for (const [head, ids] of Object.entries(grouped)) await expect(table.locator("tr.vg", { hasText: head })).toContainText(`(${ids.length})`);
        // A spare who is coming shows what their seat is doing, which their answer alone does not say.
        const seatTag = (p: Player) => t.claims.find((c) => c.id === p.id)?.confirmed ? "Seat confirmed"
          : t.claims.find((c) => c.id === p.id)?.reserved ? "Seat reserved — unpaid" : t.sc.decided ? "Standby" : "Available";
        for (const p of t.spares.filter((x) => t.vote[x.id] === "coming" && t.claims.some((c) => c.id === x.id)))
          await expect(table.locator(`tr.vote-row[data-pid="${p.id}"] .tag`), `${p.name}'s seat`).toHaveText(seatTag(p));
        for (const p of list) expect(norm(await table.locator(`tr.vote-row[data-pid="${p.id}"] .vname`).innerText())).toBe(p.name);
        // Only the players who have said nothing are offered a reminder.
        const silent = list.filter((p) => !t.vote[p.id]).map((p) => p.id).sort((a, b) => a - b);
        const offered = (await table.locator("tr.vote-row:has(button.vote-remind)").evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-pid"))))).sort((a, b) => a - b);
        expect(offered, "the reminder button belongs to the players who have not answered").toEqual(silent);
        if (!list.length) return;
        const k = Math.floor(r() * list.length), p = list[k], resp = r() < 0.5 ? "coming" : "notcoming";
        await table.locator(`tr.vote-row[data-pid="${p.id}"]`).locator(`button[title="${resp === "coming" ? "Set coming" : "Set not coming"}"]`).click();
        await expect(toast).toHaveText(`Answer updated for ${p.name}`);
        expect(dbVote(p.id), "organizer override saved, even after the deadline").toBe(resp);
        if (t.vote[p.id] !== resp) expect(ctx.state.rsvpLog.at(-1), "change logged as the organizer's").toMatchObject({ session_number: U, player_id: p.id, new_response: resp, by_admin: true });
        return;
      }

      await page.evaluate(() => nav("home"));
      const card = page.locator("#home-vote"), me = L.players[0];
      expect(me.email).toBe(PLAYER);
      if (kind === "pending") {
        await expect(card.locator(".card-title")).toHaveText(`🗳️ Vote: Session ${U} (${ctx.dates[U - 1]})`);
        await expect(card).toContainText("Your registration is waiting for the admin's approval — voting opens the moment it is approved.");
        return;
      }
      const spare = kind === "spare";
      const t = await header(ctx, card, L, U, spare);
      const locked = !spare && L.nowMs > ctx.fd[U - 1] - 46 * H, mine = t.vote[me.id];
      const yes = card.getByRole("button", { name: spare ? "✅ I'm available" : "✅ I'm Coming" }), no = card.getByRole("button", { name: spare ? "❌ Not available" : "❌ Not Coming" });
      await expect(card.locator(".email-reminders-toggle")).toBeChecked();
      const [deadlineText] = await fmtAll(page, [t.sc.deadline]);
      const status = (v: string | undefined, claims = t.claims, sc = t.sc) => {
        const c = claims.find((x) => x.id === me.id);
        if (spare && v === "coming" && c) return c.confirmed ? `🎉 Seat confirmed and paid (seat ${c.rank}).` : c.reserved ? `Seat reserved (seat ${c.rank}). E-transfer $20 to christygeorge993@gmail.com. Confirmation follows payment verification.` : !sc.decided ? `⏳ Available — spare seats are decided when the regulars' vote closes (${deadlineText}). You are #${c.rank} among the spares who replied.` : `⏳ Standby — you are #${c.rank - sc.seats} in line: ${sc.seats ? "every spare seat is taken" : "24 or more regulars are coming"}. The organizer contacts you if a seat opens.`;
        return v ? `${v === "coming" ? "✅ You confirmed - See you there!" : "❌ Noted - Sit this one out"}${locked ? "" : " · You can change your answer above."}` : null;
      };
      const alerts = async () => (await card.locator(".alert").allInnerTexts()).map(norm);
      const want = status(mine);
      if (want) expect(await alerts(), "my answer shown").toContain(want);
      if (locked) {
        await expect(yes).toBeDisabled(); await expect(no).toBeDisabled();
        expect(await alerts()).toContain(`🔒 Voting is closed for this session${mine ? ` — your answer is ${mine === "coming" ? "coming" : "not coming"}` : " — you did not answer"}. Any change needs the admin: message the group.`);
        const res = await page.evaluate(({ U, id }) => rpc("set_rsvp", { p_session: U, p_player: id, p_response: "coming" }).then(() => "saved", () => "refused"), { U, id: me.id });
        expect(res, "unchanged retries are idempotent; actual late changes are refused").toBe(mine==="coming"?"saved":"refused");
        expect(dbVote(me.id)).toBe(mine);
        return;
      }
      await expect(yes).toBeEnabled(); await expect(no).toBeEnabled();
      const resp = mine ? (mine === "coming" ? "notcoming" : "coming") : r() < 0.5 ? "coming" : "notcoming";
      await (resp === "coming" ? yes : no).click();
      await expect(toast).toHaveText(resp === "coming" ? "You are coming! 🎉" : "Noted - see you next time!");
      expect(dbVote(me.id), "answer saved").toBe(resp);
      // Seat order comes from the database clock: my new answer is the latest.
      const after = { ...L, rsvps: [...L.rsvps.filter((x) => !(x.session_number === U && x.player_id === me.id)), { session_number: U, player_id: me.id, response: resp, note: "", updated_at: new Date(L.nowMs).toISOString() }] };
      const t2 = tally(after, U);
      await expect.poll(async () => (await alerts()).includes(status(resp, t2.claims, t2.sc)!), { message: "confirmation after answering" }).toBe(true);
      expect(norm((await card.locator(".spare-seats-line").textContent()) || "")).toBe(await seatsLine(page, t2));
      if (i % 3 === 0) {
        await card.locator(".email-reminders-toggle").uncheck();
        await expect.poll(() => ctx.state.players.find((p) => p.id === me.id)!.email_reminders, { message: "reminder emails switched off" }).toBe(false);
      }
    });
  }
}
