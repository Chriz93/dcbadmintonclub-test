// Attendance counts (p57): "Present" is the players on a court tonight who are marked present, so the numbers add up to
// the courts; anyone marked present without a court is listed with "Not here" (p70: no Seat during a session). The
// Admin → Players tag does not seat a player without a court during a session (p68: players are set before it starts). Found by the organizer on TEST: 24 present with 22 on
// the courts, because two regulars who had declined were marked present without being seated. 40 generated leagues,
// each with declined regulars marked present after the start. Whether the court engine can seat someone comes from the
// independent reference (unit/adjust-reference.mjs): when it cannot, the page refuses with the reason and changes nothing.
import { test, expect } from "@playwright/test";
import { openAs, closeCtx, load, type Ctx } from "./harness";
import { genLeague, variety, type GenOpts } from "./gen";
import { courtOf } from "./oracle";
import { kvOf } from "./checks";
import { adjustInput, REFUSAL } from "./adjust-oracle";
import { reference } from "../../unit/adjust-reference.mjs";
import { callInCourt } from "./pool";

let ctx: Ctx;
test.beforeAll(async ({ browser }) => { ctx = await openAs(browser); });
test.afterAll(async () => { await closeCtx(ctx); });

type Cur = { assignments: Record<string, number[]>; attendance: Record<string, string>; absentFrom?: Record<string, number> };
const seatedIds = (a: Record<string, number[]>) => new Set(Object.values(a).flat().map(Number));
const validCourts = (a: Record<string, number[]>) => Object.values(a).every((ids) => ids.length !== 1 && ids.length <= 5);

for (let i = 0; i < 40; i++) {
  const opts: GenOpts = { ...variety(i + 300), regulars: 8 + (i % 18), spares: i % 3, pending: 0, live: "r1-partial", declineRate: 0.35, absentRate: 0, sessions: i % 4 };
  test(`Attendance count ${String(i + 1).padStart(3, "0")} · ${genLeague(47000 + i, opts).title}`, async () => {
    const L = genLeague(47000 + i, { ...opts, dates: ctx.dates }), cur = L.current as unknown as Cur;
    const declined = Object.entries(cur.attendance).filter(([, v]) => v === "declined").map(([id]) => +id);
    test.skip(declined.length === 0, "no declined regular in this league");
    // The TEST situation: declined regulars marked present after the start, without a court.
    const ghosts = declined.slice(0, 2);
    for (const id of ghosts) cur.attendance[id] = "present";
    await load(ctx, L);
    const page = ctx.page, name = (id: number) => L.players.find((p) => p.id === id)!.name;
    await page.evaluate(() => { nav("admin"); showSec("admin", "a-att"); });
    const seated = seatedIds(cur.assignments);
    const present = [...seated].filter((id) => cur.attendance[id] === "present").length;
    await expect(page.locator("#sec-a-att .tag.tg-green").first(), "Present counts players on a court").toHaveText(`✅ ${present} Present`);
    await expect(page.locator("#att-on-courts")).toHaveText(`🏸 ${seated.size} on courts`);
    const box = page.locator("#att-not-seated");
    await expect(box).toContainText(`Marked present but not on a court (${ghosts.length})`);
    for (const id of ghosts) await expect(box).toContainText(name(id));

    // p70: players are set before the session starts, so the box offers no Seat; "Not here" clears each mark: back to
    // excused (they voted not coming), no court, no absence penalty.
    await expect(box.getByRole("button", { name: /^Seat .* on a court$/ }), "no Seat during a session").toHaveCount(0);
    await expect(box).toContainText("Players are set before the session starts, so nobody is seated now");
    const onCourts = seated.size;
    let cs = kvOf(ctx, "current_session") as Cur;
    for (const [k, id] of ghosts.entries()) {
      await page.locator("#att-not-seated").getByRole("button", { name: `${name(id)} is not here` }).click();
      await expect.poll(() => (kvOf(ctx, "current_session") as Cur).attendance[id], { message: `${name(id)} back to excused` }).toBe("declined");
      cs = kvOf(ctx, "current_session") as Cur;
      expect(courtOf(cs.assignments, id)).toBe(0);
      expect(cs.absentFrom?.[id], "no absence penalty").toBeUndefined();
      if (k < ghosts.length - 1) await expect(page.locator("#att-not-seated")).not.toContainText(name(id));
    }
    await expect(page.locator("#att-not-seated"), "nobody left present without a court").toHaveCount(0);
    await expect(page.locator("#att-on-courts")).toHaveText(`🏸 ${onCourts} on courts`);
    expect(JSON.stringify(cs.assignments), "tonight's courts unchanged").toBe(JSON.stringify(cur.assignments));

    // Admin → Players: during a session the tag on a player without a court does not seat them (p68: players are set
    // before the session starts): it answers so, nothing changes, and nobody is left "present" without a court.
    const other = declined.find((id) => !ghosts.includes(id)) ?? ghosts[1];
    if (other) {
      const before = kvOf(ctx, "current_session") as Cur;
      await page.evaluate(() => { nav("admin"); showSec("admin", "a-pl"); });
      await page.locator(`#sec-a-pl [onclick="togglePlayerPresence(${other})"]`).first().click();
      await expect(page.locator("#_t"), "not seated during a session").toHaveText("Players are set before the session starts — only players in tonight’s lineup can be marked.");
      cs = kvOf(ctx, "current_session") as Cur;
      expect(cs.attendance[other], "unchanged").toBe(before.attendance[other]);
      expect(JSON.stringify(cs.assignments), "tonight's courts unchanged").toBe(JSON.stringify(before.assignments));
      expect(validCourts(cs.assignments)).toBe(true);
      const unseatedPresent = Object.entries(cs.attendance).filter(([id, v]) => v === "present" && !seatedIds(cs.assignments).has(+id)).map(([id]) => +id);
      expect(unseatedPresent, "nobody stays present without a court").toEqual([]);
    }
  });
}
