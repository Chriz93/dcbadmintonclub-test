// Attendance counts (p57): "Present" is the players on a court tonight who are marked present, so the numbers add up to
// the courts; anyone marked present without a court is listed with Seat (through the court engine) and "Not here"; the
// Admin → Players tag seats and unseats through the same engine. Found by the organizer on TEST: 24 present with 22 on
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
    /** The court engine's answer for seating this player back (their own court, or the nearest with room), from the reference. */
    const seatRef = (cs: Cur, id: number) => reference({ ...adjustInput(cs), absent: [], returning: [{ id, court: courtOf(cs.assignments, id) || callInCourt(cs.assignments, L.players.find((p) => p.id === id)!.current_court) }], late: [] }) as { ok: boolean; why?: string };
    await page.evaluate(() => { nav("admin"); showSec("admin", "a-att"); });
    const seated = seatedIds(cur.assignments);
    const present = [...seated].filter((id) => cur.attendance[id] === "present").length;
    await expect(page.locator("#sec-a-att .tag.tg-green").first(), "Present counts players on a court").toHaveText(`✅ ${present} Present`);
    await expect(page.locator("#att-on-courts")).toHaveText(`🏸 ${seated.size} on courts`);
    const box = page.locator("#att-not-seated");
    await expect(box).toContainText(`Marked present but not on a court (${ghosts.length})`);
    for (const id of ghosts) await expect(box).toContainText(name(id));

    // Seat the first through the court engine, or see the refusal with its reason.
    const first = ghosts[0], firstRef = seatRef(kvOf(ctx, "current_session") as Cur, first), seatOk = firstRef.ok;
    const seatBtn = box.getByRole("button", { name: `Seat ${name(first)} on a court` });
    await expect(seatBtn, "Seat goes through the court engine").toHaveAttribute("onclick", `changePlayerAttendance(${first},'present')`);
    await seatBtn.click();
    let cs: Cur, onCourts = seated.size;
    if (seatOk) {
      await expect.poll(() => courtOf(kvOf(ctx, "current_session").assignments, first), { message: `${name(first)} seated` }).toBeGreaterThan(0);
      cs = kvOf(ctx, "current_session") as Cur;
      expect(cs.attendance[first]).toBe("present");
      expect(validCourts(cs.assignments), "every court is still a real game").toBe(true);
      expect(seatedIds(cs.assignments).size, "nobody else lost a court").toBe(seated.size + 1);
      onCourts = seated.size + 1;
    } else {
      await expect(page.locator("#_t"), `refused with the reason (${firstRef.why})`).toHaveText(REFUSAL[firstRef.why!]);
      cs = kvOf(ctx, "current_session") as Cur;
      expect(courtOf(cs.assignments, first), "not seated").toBe(0);
      expect(cs.attendance[first], "still marked present").toBe("present");
      await expect(page.locator("#att-not-seated")).toContainText(name(first));
    }
    await expect(page.locator("#att-on-courts")).toHaveText(`🏸 ${onCourts} on courts`);

    // "Not here" for the second: back to excused (they voted not coming), no court, no penalty.
    if (ghosts[1]) {
      const second = ghosts[1];
      await page.locator("#att-not-seated").getByRole("button", { name: `${name(second)} is not here` }).click();
      await expect.poll(() => (kvOf(ctx, "current_session") as Cur).attendance[second], { message: "back to excused" }).toBe("declined");
      cs = kvOf(ctx, "current_session") as Cur;
      expect(courtOf(cs.assignments, second)).toBe(0);
      expect(cs.absentFrom?.[second], "no absence penalty").toBeUndefined();
      if (seatOk) await expect(page.locator("#att-not-seated")).toHaveCount(0);
      else await expect(page.locator("#att-not-seated")).not.toContainText(name(second));
    }

    // Admin → Players: the tag on a player without a court seats them through the engine (or is refused with the reason);
    // it never leaves someone "present" without a court.
    const other = declined.find((id) => !ghosts.includes(id)) ?? ghosts[1];
    if (other) {
      const before = kvOf(ctx, "current_session") as Cur, tagRef = seatRef(before, other), tagOk = tagRef.ok;
      await page.evaluate(() => { nav("admin"); showSec("admin", "a-pl"); });
      await page.locator(`#sec-a-pl [onclick="togglePlayerPresence(${other})"]`).first().click();
      if (tagOk) {
        await expect.poll(() => { const c = kvOf(ctx, "current_session") as Cur; return c.attendance[other] === "present" ? courtOf(c.assignments, other) : -1; }, { message: `${name(other)} present only with a court` }).toBeGreaterThan(0);
      } else {
        await expect(page.locator("#_t"), `refused with the reason (${tagRef.why})`).toHaveText(REFUSAL[tagRef.why!]);
      }
      cs = kvOf(ctx, "current_session") as Cur;
      if (!tagOk) expect(cs.attendance[other], "unchanged after a refusal").toBe(before.attendance[other]);
      expect(validCourts(cs.assignments)).toBe(true);
      const unseatedPresent = Object.entries(cs.attendance).filter(([id, v]) => v === "present" && !seatedIds(cs.assignments).has(+id)).map(([id]) => +id);
      expect(unseatedPresent, "only a refused Seat stays present without a court (listed for the organizer)").toEqual(seatOk ? [] : [first]);
    }
  });
}
