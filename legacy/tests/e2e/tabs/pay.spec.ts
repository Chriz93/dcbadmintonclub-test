// Admin → Pay: collected totals, each player's balance line and ledger, the $14 refund list with Mark refunded, recording
// payments of every kind (the amount follows the type), rejecting a blank amount and deleting a ledger entry. 100 leagues.
import { test, expect } from "@playwright/test";
import { openAs, load, norm, type Ctx } from "./harness";
import { genLeague, variety, rng, type League, type Player } from "./gen";
import type { MockState } from "../mock-supabase";

type Pay = MockState["payments"][number];
const H = 3600e3, KINDS = ["season", "spare", "refund", "adjustment"] as const, DEFAULT = { season: "400", spare: "20", refund: "14", adjustment: "0" };
const money = (xs: Pay[], k: string) => xs.filter((x) => x.kind === k).reduce((n, x) => n + Number(x.amount), 0);
function status(p: Player, pays: Pay[], L: League) {
  const mine = pays.filter((x) => x.player_id === p.id);
  if (p.membership_type === "spare") {
    const owed = L.sessions.filter((s) => Object.values(s.scores).some((sc) => [sc.a1, sc.a2, sc.b1, sc.b2].includes(p.id))).length * 20;
    const due = Math.max(0, owed - money(mine, "spare")), n = mine.filter((x) => x.kind === "spare").length;
    return owed === 0 ? "No spare sessions yet" : due === 0 ? `✅ ${n} session fee${n === 1 ? "" : "s"} paid` : `⏳ $${due} owing for ${Math.round(due / 20)} session${due > 20 ? "s" : ""}`;
  }
  const paid = money(mine, "season") + money(mine, "adjustment"), due = Math.max(0, 400 - paid);
  return (due === 0 ? `✅ Season fee paid ($${paid})` : paid > 0 ? `⏳ $${due} still owing (paid $${paid})` : "⏳ $400 e-transfer pending")
    + (p.declared_payment === "paid_full" && due > 0 ? " · player says: sent in full" : p.declared_payment === "will_pay" && due > 0 ? " · player says: will pay" : "");
}
const ledger = (id: number, pays: Pay[]) => pays.filter((x) => x.player_id === id).sort((a, b) => b.received_on.localeCompare(a.received_on) || b.id - a.id)
  .map((x) => [`${x.received_on} · ${x.kind}${x.session_number ? " S" + x.session_number : ""}${x.note ? " · " + x.note : ""}`, `${x.kind === "refund" ? "−" : ""}$${Number(x.amount)} ✕`]);
function refunds(L: League, pays: Pay[], fd: number[]) {
  const U = L.current ? L.current.number : Math.min(L.sessions.length + 1, 28), all = [...L.rsvps].sort((a, b) => a.updated_at.localeCompare(b.updated_at)), out = [];
  for (let n = 1; n <= U; n++) {
    const cutoff = fd[n - 1] - 72 * H;
    const players = all.filter((r) => r.session_number === n && r.response === "notcoming" && Date.parse(r.updated_at) <= cutoff)
      .map((r) => ({ r, p: L.players.find((x) => x.id === r.player_id)! })).filter((x) => x.p && x.p.membership_type !== "spare")
      .map(({ r, p }) => ({ id: p.id, name: p.name, at: Date.parse(r.updated_at), refund: pays.find((x) => x.kind === "refund" && x.player_id === p.id && x.session_number === n) || null }));
    if (players.length || n === U) out.push({ n, cutoff, closed: L.nowMs > cutoff, players });
  }
  return out.reverse();
}

let ctx: Ctx;
test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
test.afterAll(async () => { await ctx?.page.close(); });
for (let i = 0; i < 100; i++) {
  const opts = { ...variety(i + 7), hoursBefore: [150, 80, 73, 71, 40, 5][i % 6] };
  test(`Pay ${String(i + 1).padStart(3, "0")} · ${genLeague(17000 + i, opts).title}`, async () => {
    const L = genLeague(17000 + i, { ...opts, dates: ctx.dates });
    await load(ctx, L);
    const page = ctx.page, r = rng(60 + i), toast = page.locator("#_t");
    await page.evaluate(() => nav("admin"));
    await page.getByRole("button", { name: "💰 Pay" }).click();
    const fmt = (ms: number[]) => page.evaluate((xs) => xs.map((x) => new Date(x).toLocaleString("en-CA", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })), ms);
    const regulars = L.players.filter((p) => p.membership_type !== "spare"), spares = L.players.filter((p) => p.membership_type === "spare");
    const pays = L.payments, regPaid = regulars.filter((p) => p.paid).length, sparePaid = spares.filter((p) => p.paid).length;
    await expect(page.locator("#pay-summary")).toContainText(`Regular Members (${regulars.length}/25)`);
    await expect(page.locator("#pay-summary")).toContainText(`Spare Players (${spares.length})`);
    expect(await page.locator("#pay-summary div[style*='grid'] > div > div:first-child").allTextContents(), "paid / unpaid / net collected; spare paid / unpaid")
      .toEqual([String(regPaid), String(regulars.length - regPaid), `$${money(pays, "season") + money(pays, "adjustment") + money(pays, "spare") - money(pays, "refund")}`, String(sparePaid), String(spares.length - sparePaid)]);
    // Refund list: regulars who declined by the 72-hour cutoff, newest session first.
    const ref = refunds(L, pays, ctx.fd), owed = ref.reduce((n, s) => n + s.players.filter((x) => !x.refund).length, 0);
    await expect(page.locator("#refunds-owed")).toHaveText(owed ? `${owed} refund${owed === 1 ? "" : "s"} to send · $${owed * 14}` : "Nothing owed right now");
    const card = page.locator("#refunds-card");
    const heads = (await card.locator("> div[style*='margin:8px 0 4px']").allTextContents()).map(norm);
    const cut = await fmt(ref.map((s) => s.cutoff));
    expect(heads, "one heading per session with declines (and the upcoming one)").toEqual(ref.map((s, k) => norm(`Session ${s.n} — ${ctx.dates[s.n - 1]} ${s.closed ? "" : `cutoff ${cut[k]} — provisional`}`)));
    const flat = ref.flatMap((s) => s.players.map((x) => ({ ...x, n: s.n })));
    const when = await fmt(flat.map((x) => x.at));
    const rrows = card.locator(".refund-row");
    await expect(rrows).toHaveCount(flat.length);
    for (let k = 0; k < flat.length; k++) expect(norm(await rrows.nth(k).innerText())).toBe(`${flat[k].name} declined ${when[k]} ${flat[k].refund ? `refunded ${flat[k].refund!.received_on}` : "Mark refunded"}`);
    // One row per player: regulars, then spares.
    const people = [...regulars, ...spares], rows = page.locator("#pay-list .pay-row");
    await expect(rows).toHaveCount(people.length);
    const check = async (k: number, list: Pay[]) => {
      const p = people[k], row = rows.nth(k);
      expect(norm((await row.locator("> div").first().locator("> div").first().textContent()) || ""), `row ${k + 1} name`).toBe(`${p.name}${p.membership_type === "spare" ? "SPARE" : ""}`);
      expect(norm((await row.locator(".pay-status").textContent()) || ""), `${p.name}: balance`).toBe(norm(status(p, list, L)));
      const lines = await row.locator("div[style*='flex-basis:100%'] > div").evaluateAll((ds) => ds.map((d) => [...d.querySelectorAll(":scope > span")].map((s) => (s.textContent || "").replace(/\s+/g, " ").trim())));
      expect(lines, `${p.name}: ledger`).toEqual(ledger(p.id, list));
    };
    for (let k = 0; k < people.length; k++) await check(k, pays);
    if (!people.length) return;

    const today = new Date(L.nowMs).toISOString().slice(0, 10), act = i % 5, k = Math.floor(r() * people.length), p = people[k];
    if (act === 0 || act === 1) {
      await rows.nth(k).getByRole("button", { name: "＋ Record" }).click();
      await expect(page.locator("#modal-title")).toHaveText(`Record payment — ${p.name}`);
      await expect(page.locator("#pay-kind")).toHaveValue(p.membership_type === "spare" ? "spare" : "season");
      const kind = KINDS[Math.floor(r() * 4)];
      await page.locator("#pay-kind").selectOption(kind);
      await expect(page.locator("#pay-amount"), "amount follows the type").toHaveValue(DEFAULT[kind]);
      if (act === 1) {
        await page.locator("#pay-amount").fill("");
        await page.getByRole("button", { name: "Save payment" }).click();
        await expect(toast).toHaveText("Enter the amount");
        expect(ctx.state.payments.length, "nothing recorded").toBe(pays.length);
        await page.evaluate(() => closeModal());
        return;
      }
      const amount = kind === "adjustment" ? 50 + Math.floor(r() * 300) : Number(DEFAULT[kind]), note = `ref #${1000 + i}`;
      await page.locator("#pay-amount").fill(String(amount));
      await page.locator("#pay-note").fill(note);
      await page.getByRole("button", { name: "Save payment" }).click();
      await expect(toast).toHaveText("Payment recorded");
      const U = L.current ? L.current.number : Math.min(L.sessions.length + 1, 28), row = ctx.state.payments.at(-1)!;
      expect({ ...row, id: 0 }).toEqual({ id: 0, player_id: p.id, kind, amount, session_number: kind === "spare" || kind === "refund" ? U : null, method: row.method, received_on: today, note });
      await check(k, ctx.state.payments);
    } else if (act === 2) {
      const due = flat.find((x) => !x.refund);
      if (!due) { await expect(card.getByRole("button", { name: "Mark refunded" })).toHaveCount(0); return; }
      const j = flat.indexOf(due);
      await rrows.nth(j).getByRole("button", { name: "Mark refunded" }).click();
      await expect(toast).toHaveText("$14 refund recorded");
      expect(ctx.state.payments.at(-1)).toMatchObject({ player_id: due.id, kind: "refund", amount: 14, session_number: due.n, received_on: today, note: "Declined by the 72-hour cutoff" });
      await expect(rrows.nth(j)).toContainText(`refunded ${today}`);
      await expect(page.locator("#refunds-owed")).toHaveText(owed - 1 ? `${owed - 1} refund${owed - 1 === 1 ? "" : "s"} to send · $${(owed - 1) * 14}` : "Nothing owed right now");
    } else if (act === 3) {
      const withRows = people.map((x, j) => [x, j] as const).filter(([x]) => pays.some((y) => y.player_id === x.id));
      if (!withRows.length) return;
      const [who, j] = withRows[Math.floor(r() * withRows.length)], gone = ledger(who.id, pays)[0], target = pays.filter((x) => x.player_id === who.id).sort((a, b) => b.received_on.localeCompare(a.received_on) || b.id - a.id)[0];
      await rows.nth(j).locator("div[style*='flex-basis:100%'] a").first().click();
      await expect(toast).toHaveText("Entry deleted");   // shown after the page has reloaded the ledger
      expect(ctx.state.payments.some((x) => x.id === target.id), `deleted: ${gone[0]}`).toBe(false);
      await check(j, ctx.state.payments);
    }
  });
}
