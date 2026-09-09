import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Page } from "@playwright/test";
import { databaseLeague } from "./database-league-fixture";
import { admins, club, players } from "../../scripts/matchday-fixture";
import { mockUser } from "./auth-fixture";
const nav = (page: Page, name: string) =>
  page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name, exact: true })
    .click();
test("real SQL: player request, independent admin approval, results/ELO/history and selected-season courts stay consistent", async ({
  page,
  browser,
}) => {
  test.setTimeout(90000);
  const league = await databaseLeague(),
    context = await browser.newContext();
  try {
    const before = await league.snapshot();
    const match = before.matches.find(
      (m) => m.round === 4 && [...m.a, ...m.b].includes(mockUser.id),
    )!;
    await league.open(page);
    await nav(page, "Scores");
    const card = page
      .locator(".lp-match")
      .filter({ hasText: `Saved ${match.scoreA}–${match.scoreB}` })
      .filter({
        hasText: `Court ${before.courts.find((c) => c.id === match.court_id)!.number} · Game ${match.game}`,
      });
    await card
      .getByRole("button", { name: "Request a correction", exact: true })
      .click();
    await page
      .getByLabel(`${match.id} Team A score`)
      .fill(String(match.scoreB));
    await page
      .getByLabel(`${match.id} Team B score`)
      .fill(String(match.scoreA));
    await card
      .getByLabel("Reason", { exact: true })
      .fill("Teams were entered backwards; please swap the scores.");
    await card.getByRole("button", { name: "Send correction request" }).click();
    const queue = page.getByRole("region", {
      name: "Correction requests",
      exact: true,
    });
    await expect(queue).toContainText("1 pending");
    await expect(card).toContainText("Correction requested:");
    await expect(
      card.getByRole("button", { name: "Request a correction", exact: true }),
    ).toHaveCount(0);
    expect((await league.snapshot()).history).toEqual(before.history);
    expect((await league.snapshot(players[14])).reviews).toEqual([]);
    const pending = (await league.snapshot()).reviews[0];
    await expect(
      league.rpc("resolve_match_review", {
        c: club,
        entry: pending.id,
        expected_revision: pending.revision,
        accept: true,
        reason: "Player cannot self approve",
      }),
    ).rejects.toThrow("Administrator MFA required");
    expect(
      (await new AxeBuilder({ page }).include("#correction-requests").analyze())
        .violations,
    ).toEqual([]);
    const admin = await context.newPage();
    await league.open(admin, admins[0], true);
    await nav(admin, "Scores");
    const adminQueue = admin.getByRole("region", {
      name: "Correction requests",
      exact: true,
    });
    await expect(adminQueue).toContainText("Requested by TEST Player 13");
    await adminQueue
      .getByLabel("Review decision")
      .fill("Confirmed with both teams at the court.");
    await adminQueue
      .getByRole("button", { name: "Accept & correct score" })
      .click();
    await expect(adminQueue).toContainText("Accepted · score corrected");
    await page
      .getByRole("button", { name: "Refresh league", exact: true })
      .click();
    await expect(queue).toContainText("Accepted · score corrected");
    const after = await league.snapshot();
    expect(after.matches.find((m) => m.id === match.id)).toMatchObject({
      scoreA: match.scoreB,
      scoreB: match.scoreA,
      revision: match.revision + 1,
    });
    expect(after.history).not.toEqual(before.history);
    expect(after.assignments).toEqual(before.assignments);
    expect(after.finals).toEqual(before.finals);
    await nav(page, "Standings");
    await page
      .getByRole("button", { name: "TEST Player 13 · You", exact: true })
      .first()
      .click();
    await expect(
      page.getByRole("heading", { name: "Match history", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "ELO progress", exact: true }),
    ).toBeVisible();
    await nav(page, "Courts");
    await expect(page.locator(".md-player")).toHaveCount(25);
    await nav(page, "Schedule");
    await expect(
      page.getByRole("heading", { name: "Season schedule" }),
    ).toBeVisible();
    await expect(page.locator(".lp-schedule")).toContainText(
      "Synthetic 25-player rehearsal",
    );
    await expect(
      page.getByRole("button", { name: "Download season calendar" }),
    ).toBeEnabled();
    const downloadPromise = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download season calendar" })
      .click();
    const stream = await (await downloadPromise).createReadStream();
    let calendar = "";
    for await (const chunk of stream!) calendar += chunk.toString();
    expect(calendar).toContain("test-matchday-rehearsal-");
    expect(calendar.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(calendar).toContain("DTSTART:20260901T001500Z");
    await page.getByRole("button", { name: /View courts for/ }).click();
    await expect(page.locator(".md-player")).toHaveCount(25);
    expect(league.errors).toEqual([]);
  } finally {
    await context.close();
    await page.unrouteAll({ behavior: "wait" }).catch(() => {});
    await league.close();
  }
});
test("real SQL: stale correction fails visibly without overwriting; admin can decline it", async ({
  page,
}) => {
  test.setTimeout(90000);
  const league = await databaseLeague();
  try {
    const before = await league.snapshot(),
      m = before.matches.find(
        (m) => m.round === 4 && [...m.a, ...m.b].includes(mockUser.id),
      )!;
    await league.rpc("request_match_review", {
      c: club,
      m: m.id,
      expected_revision: m.revision,
      a: m.scoreB,
      b: m.scoreA,
      message: "The teams were reversed",
    });
    await league.rpc(
      "correct_score",
      {
        c: club,
        m: m.id,
        expected_revision: m.revision,
        a: m.target,
        b: 0,
        reason: "Independent correction before review",
      },
      admins[1],
      true,
    );
    const corrected = await league.snapshot();
    await league.open(page, admins[0], true);
    await nav(page, "Scores");
    const queue = page.getByRole("region", {
      name: "Correction requests",
      exact: true,
    });
    await queue
      .getByLabel("Review decision")
      .fill("Review after another correction");
    await queue.getByRole("button", { name: "Accept & correct score" }).click();
    await expect(queue.getByRole("alert")).toContainText("This record changed");
    expect((await league.snapshot()).matches).toEqual(corrected.matches);
    await queue.getByRole("button", { name: "Decline request" }).click();
    await expect(queue).toContainText("Declined");
    expect((await league.snapshot()).history).toEqual(corrected.history);
    expect(league.errors).toHaveLength(1);
  } finally {
    await page.unrouteAll({ behavior: "wait" }).catch(() => {});
    await league.close();
  }
});
