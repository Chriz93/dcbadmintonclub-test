// Organizer controls added by the audit remediation that no suite exercised: End play early (endSessionEarly and its
// reason), Cancel Session (reason, compensation plan and cash amount), next-season settings (prepareNextSeason and the
// new-season fields), the season calendar file (downloadCalendar) and moving a player between courts during a session
// (moveCourtPlayer). Expectations come from the rules, the season configuration and the manual-move oracle, not from the
// page.
import { test, expect } from "@playwright/test";
import { openAs, closeCtx, load, type Ctx } from "./harness";
import { genLeague, variety } from "./gen";
import { kvOf } from "./checks";
import { courtOf } from "./oracle";
import { manualMoveExpected } from "./manual-move-oracle";

let ctx: Ctx;
test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
test.afterAll(async () => { await closeCtx(ctx); });
const completed = () => JSON.parse(ctx.state.state["completed_sessions"]?.value || "[]") as { number: number; status?: string; reason?: string; ended_early?: boolean; end_reason?: string; scores: Record<string, unknown> }[];

/** The UTC instant of a local wall-clock time in a time zone, found independently of the page (Intl only). */
function zonedInstant(date: string, time: string, zone: string) {
  const [y, mo, d] = date.split("-").map(Number), [h, mi] = time.split(":").map(Number), want = Date.UTC(y, mo - 1, d, h, mi);
  let t = want;
  for (let k = 0; k < 3; k++) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(t)).map((p) => [p.type, p.value]));
    t += want - Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
  }
  return new Date(t);
}
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

for (const [i, regulars] of [[0, 16], [1, 22]] as const) {
  test(`Audit controls · End play early ${i + 1}: a reason is required; only finished rounds count and the reason is kept`, async () => {
    const L = genLeague(49000 + i, { ...variety(49000 + i), regulars, spares: 0, pending: 0, live: "r2-partial", sessions: 1, absentRate: 0, declineRate: 0 });
    await load(ctx, L);
    const page = ctx.page, finished = new Set(L.current!.movements.map((m) => m.cycle)), before = completed().length;
    await page.evaluate(() => endSessionEarly());
    await expect(page.locator("#modal.open #modal-title")).toHaveText("End play early");
    await page.locator("#end-early-reason").fill("ab");
    await page.locator("#modal.open").getByRole("button", { name: "End early" }).click();
    await expect(page.locator("#_t")).toHaveText("Enter why play ended early");
    expect(kvOf(ctx, "current_session"), "nothing ended without a reason").not.toBeNull();
    await page.locator("#end-early-reason").fill("Power cut in the gym");
    await page.locator("#modal.open").getByRole("button", { name: "End early" }).click();
    await expect.poll(() => completed().length, { message: "the session was recorded" }).toBe(before + 1);
    expect(kvOf(ctx, "current_session"), "tonight is over").toBeNull();
    const last = completed().at(-1)!;
    expect({ early: last.ended_early, reason: last.end_reason }).toEqual({ early: true, reason: "Power cut in the gym" });
    const rounds = new Set(Object.keys(last.scores).map((k) => Number(k.match(/_y(\d+)_/)![1])));
    expect([...rounds].every((r) => finished.has(r)), `only finished rounds (${[...finished]}) are kept; got ${[...rounds]}`).toBe(true);
    const round1 = Object.keys(L.current!.scores).filter((k) => k.includes("_y1_")).length;
    expect(Object.keys(last.scores).filter((k) => k.includes("_y1_")).length, "round 1's scores are all kept").toBe(round1);
  });
}

for (const [i, resolution] of [[0, "refund"], [1, "shuttles"]] as const) {
  test(`Audit controls · Cancel Session ${i + 1} (${resolution}): the reason and a valid amount are required; the date is recorded as cancelled`, async () => {
    const L = genLeague(49010 + i, { ...variety(49010 + i), regulars: 12, spares: 1, pending: 0, live: "none", sessions: 2 });
    await load(ctx, L);
    const page = ctx.page, n = L.upcoming;
    await page.evaluate(() => cancelSession());
    await expect(page.locator("#modal.open #modal-title")).toHaveText(`Cancel Session ${n}`);
    await page.locator("#cancel-reason").fill("School closed for a snow day");
    await page.locator("#cancel-resolution").selectOption(resolution);
    await page.locator("#cancel-amount").fill("-5");
    await page.locator("#modal.open").getByRole("button", { name: "Record cancellation" }).click();
    await expect(page.locator("#_t")).toHaveText("Enter a reason and valid refund amount");
    expect(completed().some((s) => s.number === n), "nothing recorded for an invalid amount").toBe(false);
    await page.locator("#cancel-amount").fill(resolution === "refund" ? "12.5" : "0");
    await page.locator("#modal.open").getByRole("button", { name: "Record cancellation" }).click();
    await expect.poll(() => completed().find((s) => s.number === n)?.status, { message: "recorded as cancelled" }).toBe("cancelled");
    expect(completed().find((s) => s.number === n)!.reason).toBe("School closed for a snow day");
    await page.evaluate(() => nav("schedule"));
    await expect(page.locator("#sched-list .sched-row").nth(n - 1).locator(".tag")).toHaveText("Cancelled");
  });
}

test("Audit controls · next season: 'Use current fees and session time' fills every new-season field from the season configuration", async () => {
  const L = genLeague(49020, { ...variety(49020), regulars: 10, spares: 1, pending: 0, live: "none", sessions: 0 });
  await load(ctx, L);
  const page = ctx.page;
  const c = await page.evaluate(() => S.seasonConfig);
  await page.evaluate(() => prepareNextSeason());
  const want: Record<string, string | number> = { "new-season-start-time": c.start_time_local, "new-season-end-time": c.end_time_local,
    "new-season-zone": c.time_zone, "new-season-capacity": c.regular_capacity, "new-season-regular": c.fees.regular_season,
    "new-season-spare": c.fees.spare_session, "new-season-refund": c.fees.absence_refund, "new-season-notice": c.fees.absence_notice_hours,
    "new-season-deadline": c.fees.vote_deadline_hours, "new-season-ask": c.fees.spare_ask_hours };
  for (const [field, v] of Object.entries(want)) await expect(page.locator(`#${field}`), field).toHaveValue(String(v));
  // p65: it says what it did (it used to fill the fields without a word).
  await expect(page.locator("#_t")).toHaveText("Filled in with the current fees and session time — change what differs for next season");
});

test("Audit controls · the season calendar file has one event per scheduled date at the league's local time", async () => {
  const L = genLeague(49030, { ...variety(49030), regulars: 10, spares: 0, pending: 0, live: "none", sessions: 0 });
  await load(ctx, L);
  const page = ctx.page;
  const c = await page.evaluate(() => S.seasonConfig) as { approved_dates: string[]; cancelled_dates?: string[]; start_time_local: string; end_time_local: string; time_zone: string; label?: string };
  const file = await page.evaluate(() => new Promise<{ name: string; text: string; type: string }>((resolve) => { (window as unknown as { downloadText: unknown }).downloadText = (name: string, text: string, type: string) => resolve({ name, text, type }); downloadCalendar(); }));
  expect(file.type).toMatch(/^text\/calendar/);
  expect(file.text.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n") && file.text.endsWith("END:VCALENDAR\r\n"), "an iCalendar file with CRLF lines").toBe(true);
  const cancelled = new Set(c.cancelled_dates || []);
  const dates = c.approved_dates.map((d, i) => [d, i + 1] as const).filter(([d]) => !cancelled.has(d));
  const events = file.text.split("BEGIN:VEVENT").slice(1);
  expect(events.length, "one event per scheduled, not cancelled date").toBe(dates.length);
  for (const [k, [d, n]] of dates.entries()) {
    const e = events[k];
    expect(e, `Session ${n} starts at ${c.start_time_local} ${c.time_zone}`).toContain(`DTSTART:${stamp(zonedInstant(d, c.start_time_local, c.time_zone))}\r\n`);
    expect(e, `Session ${n} ends at ${c.end_time_local}`).toContain(`DTEND:${stamp(zonedInstant(d, c.end_time_local, c.time_zone))}\r\n`);
    expect(e).toContain(`SUMMARY:DC Badminton Session ${n}\r\n`);
    expect(e).toMatch(new RegExp(`UID:dcbc-[^\\r]*-${n}@chriz93\\.github\\.io\\r\\n`));
  }
});

for (let i = 0; i < 4; i++) {
  test(`Audit controls · move a player on Admin → Assign ${i + 1}: the court engine's rules decide (manual-move oracle)`, async () => {
    const L = genLeague(49040 + i, { ...variety(49040 + i), regulars: 12 + i * 3, spares: 0, pending: 0, live: i % 2 ? "r1-partial" : "r1-done", sessions: 1, absentRate: 0, declineRate: 0 });
    if (L.current && i < 2) L.current.scores = Object.fromEntries(Object.entries(L.current.scores).filter(([k]) => !k.includes(`_y${L.current!.cycle}_`)));   // no scored court: every move is possible
    await load(ctx, L);
    const page = ctx.page, a = L.current!.assignments;
    const from = [1, 2, 3, 4, 5, 6].find((c) => (a[c] || []).length >= 3)!, id = a[from][0], target = [1, 2, 3, 4, 5, 6].find((c) => c !== from && (a[c] || []).length > 0 && (a[c] || []).length < 5) ?? (from === 1 ? 2 : 1);
    const want = manualMoveExpected(L, id, target), name = L.players.find((p) => p.id === id)!.name;
    await page.evaluate(() => { nav("admin"); showSec("admin", "a-assign"); });
    const sel = page.getByLabel(`Move ${name}`).first();
    await expect(sel, "the selector moves through the court engine").toHaveAttribute("onchange", `moveCourtPlayer(${id},Number(this.value))`);
    await sel.selectOption(String(target));
    // The oracle gives the message and the resulting lineup for both outcomes (a refusal keeps the lineup as it was).
    await expect(page.locator("#_t")).toHaveText(want.message!);
    const got = kvOf(ctx, "current_session").assignments as Record<string, number[]>;
    for (let c = 1; c <= 6; c++) expect([...(got[c] || [])].sort((x, y) => x - y), `Court ${c}`).toEqual([...((want.lineup as Record<string, number[]>)[c] || [])].sort((x, y) => x - y));
    void courtOf; void from;
  });
}
