// Voting — the Home card for players (regular, spare, awaiting approval) and Standings → RSVP for the organizer — across
// the week before a Tuesday: counts, spare seats, deadline and refund lines, one-tap answers, the 46-hour lock in the app
// and in the database, organizer overrides and the email-reminder switch. 100 leagues.
import { test, expect, type Page } from "@playwright/test";
import { openAs, load, norm, type Ctx } from "./harness";
import { genLeague, variety, rng, type League, type Player } from "./gen";

const PLAYER = "vote.tester@example.invalid";
const HOURS = [150, 100, 80, 73, 71, 60, 47, 46.05, 45.95, 30, 5];
const H = 3600e3;
let admin: Ctx, player: Ctx;
test.beforeAll(async ({ browser }) => { admin = await openAs(browser); player = await openAs(browser, PLAYER); });
test.afterAll(async () => { await admin?.page.close(); await player?.page.close(); });

function tally(L: League, U: number) {
  const byId = (id: number) => L.players.find((p) => p.id === id);
  const isReg = (p?: Player) => !!p && p.approved && !p.waitlisted && p.membership_type !== "spare";
  const isSpare = (p?: Player) => !!p && p.approved && p.membership_type === "spare";
  const rows = L.rsvps.filter((r) => r.session_number === U).sort((a, b) => a.updated_at.localeCompare(b.updated_at));
  const vote: Record<number, string> = {}; rows.forEach((r) => (vote[r.player_id] = r.response));
  const regs = L.players.filter(isReg), spares = L.players.filter(isSpare);
  const declined = rows.filter((r) => r.response === "notcoming" && isReg(byId(r.player_id))).length;
  const claims = rows.filter((r) => r.response === "coming" && isSpare(byId(r.player_id))).sort((a, b) => a.updated_at.localeCompare(b.updated_at) || a.player_id - b.player_id).map((r, k) => ({ id: r.player_id, rank: k + 1, confirmed: k < declined }));
  return { vote, regs, spares, declined, claims, counts: [regs.filter((p) => vote[p.id] === "coming").length, regs.filter((p) => vote[p.id] === "notcoming").length, regs.filter((p) => !vote[p.id]).length].map(String),
    seats: `Spare seats: ${Math.max(declined - claims.length, 0)} open · ${claims.filter((c) => c.confirmed).length} confirmed · ${claims.filter((c) => !c.confirmed).length} standby` };
}
const fmtAll = (page: Page, ms: number[]) => page.evaluate((xs) => xs.map((x) => new Date(x).toLocaleString("en-CA", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })), ms);
async function timing(page: Page, start: number, now: number, spare: boolean) {
  const [deadline, cutoff] = await fmtAll(page, [start - 46 * H, start - 72 * H]);
  if (spare) return now < start - 72 * H ? `Spares are asked from ${cutoff} (3 days before play) whenever a regular declines. You can already say if you are available.` : "Seats open as regulars decline; answer early — seats go in the order spares reply.";
  return (now <= start - 46 * H ? `Vote by ${deadline} (Sunday 10:00 PM) — after that your answer is final. ` : `Voting closed ${deadline}. To change your answer, message the admin in the group — only the admin can update it now. `)
    + (now <= start - 72 * H ? `$14 refund if you decline by ${cutoff}.` : `The 72-hour refund window closed ${cutoff}.`);
}
async function header(ctx: Ctx, card: ReturnType<Page["locator"]>, L: League, U: number, spare: boolean) {
  const t = tally(L, U);
  await expect(card.locator(".card-title").first()).toHaveText(`🗳️ ${spare ? "Spare" : "Vote"}: are you ${spare ? "available for" : "playing"} Session ${U} (${ctx.dates[U - 1]})?`);
  expect(await card.locator("div[style*='1fr 1fr 1fr'] > div > div:first-child").allTextContents(), "coming / not coming / no reply among regulars").toEqual(t.counts);
  expect(norm((await card.locator(".spare-seats-line").textContent()) || "")).toBe(t.seats);
  expect(norm((await card.locator(".vote-timing").textContent()) || "")).toBe(norm(await timing(ctx.page, ctx.fd[U - 1], L.nowMs, spare)));
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
      const rows = sec.locator(".card").filter({ hasText: "📋 RSVP Status" }).locator("div:has(> div > button.admin-vote)");
      const list = [...t.regs, ...t.spares];
      await expect(rows).toHaveCount(list.length);
      const tag = (p: Player, v: string | undefined) => p.membership_type === "spare" ? (v === "coming" ? (t.claims.find((c) => c.id === p.id)?.confirmed ? "✅ Seat confirmed" : "⏳ Standby") : v === "notcoming" ? "❌ Not available" : /^⏳/) : v === "coming" ? "✅ Coming" : v === "notcoming" ? "❌ Not Coming" : "⏳ Not Responded";
      for (let k = 0; k < list.length; k++) {
        const row = rows.nth(k), p = list[k];
        expect(norm(await row.locator("> div").first().innerText())).toBe(`${p.name}${p.membership_type === "spare" ? "SPARE" : ""}`);
        await expect(row.locator(".tag")).toHaveText(tag(p, t.vote[p.id]));
      }
      if (!list.length) return;
      const k = Math.floor(r() * list.length), p = list[k], resp = r() < 0.5 ? "coming" : "notcoming";
      await rows.nth(k).locator(`button[title="${resp === "coming" ? "Set coming" : "Set not coming"}"]`).click();
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
    const status = (v: string | undefined, claims = t.claims, declined = t.declined) => {
      const c = claims.find((x) => x.id === me.id);
      if (spare && v === "coming" && c) return c.confirmed ? `🎉 Seat confirmed (seat ${c.rank}). Please e-transfer $20 to christygeorge993@gmail.com before Tuesday.` : `⏳ Standby — you are #${c.rank - declined} in line. You will be emailed the moment a seat opens.`;
      return v ? `${v === "coming" ? "✅ You confirmed - See you there!" : "❌ Noted - Sit this one out"}${locked ? "" : " · You can change your answer above."}` : null;
    };
    const alerts = async () => (await card.locator(".alert").allInnerTexts()).map(norm);
    const want = status(mine);
    if (want) expect(await alerts(), "my answer shown").toContain(want);
    if (locked) {
      await expect(yes).toBeDisabled(); await expect(no).toBeDisabled();
      expect(await alerts()).toContain(`🔒 Voting is closed for this session${mine ? ` — your answer is ${mine === "coming" ? "coming" : "not coming"}` : " — you did not answer"}. Any change needs the admin: message the group.`);
      const res = await page.evaluate(({ U, id }) => rpc("set_rsvp", { p_session: U, p_player: id, p_response: "coming" }).then(() => "saved", () => "refused"), { U, id: me.id });
      expect(res, "the database refuses a late change too").toBe("refused");
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
    await expect.poll(async () => (await alerts()).includes(status(resp, t2.claims, t2.declined)!), { message: "confirmation after answering" }).toBe(true);
    expect(norm((await card.locator(".spare-seats-line").textContent()) || "")).toBe(t2.seats);
    if (i % 3 === 0) {
      await card.locator(".email-reminders-toggle").uncheck();
      await expect.poll(() => ctx.state.players.find((p) => p.id === me.id)!.email_reminders, { message: "reminder emails switched off" }).toBe(false);
    }
  });
}
