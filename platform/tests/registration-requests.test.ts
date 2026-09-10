import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, beforeEach, afterEach, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import {
  matchdayFixture,
  club,
  seasonId,
  admins,
  players,
  identity,
  fixtureId,
} from "../scripts/matchday-fixture";
let db: PGlite;
const applicant = fixtureId(90),
  unverified = fixtureId(91);
async function as(user: string, sql: string, admin = false) {
  await db.exec(
    "savepoint actor;set local role authenticated;" +
      identity(user, admin ? "aal2" : "aal1"),
  );
  try {
    const result = await db.exec(sql);
    await db.exec("reset role;release savepoint actor");
    return result;
  } catch (error) {
    await db.exec(
      "rollback to savepoint actor;reset role;release savepoint actor",
    );
    throw error;
  }
}
const submit = (kind = "regular", rev = 0, user = applicant) =>
  as(
    user,
    `select club_app.submit_intake('${club}','${seasonId}','New Player','New display','6135550199','Emergency 6135550100','${kind}','TEST-REF',40000,${rev})`,
  );
const list = async (user = admins[0], admin = true) =>
  (
    await as(
      user,
      `select club_app.registration_review_list('${club}') rows`,
      admin,
    )
  )[0].rows[0].rows as {
    user_id: string;
    status: string;
    agreement_signed: boolean;
    email: string;
    identity_reviewed: boolean;
  }[];
async function ready(kind = "regular") {
  await submit(kind);
  await as(
    applicant,
    `select club_app.save_eligibility('${club}','${seasonId}','1990-01-01',null,0,true);select club_app.sign_agreement('${club}','${seasonId}','${applicant}',waiver_id,sha256,'New Player',null,true,true) from club_app.signing_options() where club_id='${club}';`,
  );
  await as(
    admins[0],
    `select club_app.review_eligibility('${club}','${seasonId}','${applicant}',1,null,'Synthetic independent identity check',true);select club_app.verify_intake_payment('${club}','${seasonId}','${applicant}',1,'Synthetic bank verification');`,
    true,
  );
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;grant usage on schema auth to authenticated;grant execute on all functions in schema auth to authenticated;`,
  );
  for (const f of readdirSync("migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync("migrations/" + f, "utf8"));
  await db.exec(
    "begin;" +
      matchdayFixture() +
      `update club_app.seasons set rules=rules||'{"registrationClosed":true}' where id='${seasonId}';insert into auth.users values('${applicant}','request@example.invalid',now()),('${unverified}','unverified@example.invalid',null);commit;`,
  );
}, 60000);
afterAll(async () => await db?.close());
beforeEach(async () => await db.exec("begin"));
afterEach(async () => await db.exec("rollback"));
it("a first-time verified email submits without an invitation and stays pending/private", async () => {
  await submit();
  const rows = await list();
  expect(rows).toHaveLength(26);
  expect(rows.find((p) => p.user_id === applicant)).toMatchObject({
    status: "pending",
    email: "request@example.invalid",
    agreement_signed: false,
    identity_reviewed: false,
  });
  expect(
    (
      await db.query(
        `select status,paid from club_app.memberships where user_id='${applicant}'`,
      )
    ).rows,
  ).toEqual([{ status: "pending", paid: false }]);
  expect(
    (
      await as(
        applicant,
        `select * from club_app.initial_seeds where user_id='${applicant}'`,
      )
    )[0].rows,
  ).toHaveLength(0);
  await expect(list(applicant, false)).rejects.toThrow("MFA");
  await expect(list(players[0], false)).rejects.toThrow("MFA");
  await expect(list(admins[0], false)).rejects.toThrow("MFA");
});
it("rejects unverified email and unauthenticated requests", async () => {
  await expect(submit("regular", 0, unverified)).rejects.toThrow(
    "Verified email",
  );
  await expect(submit("regular", 0, fixtureId(99))).rejects.toThrow(
    "Verified email",
  );
});
it("retries cannot duplicate or overwrite an existing request", async () => {
  await submit();
  await expect(submit()).rejects.toThrow("Revision conflict");
  expect((await list()).filter((p) => p.user_id === applicant)).toHaveLength(1);
  expect((await submit("spare", 1))[0].rows).toEqual([{ submit_intake: 2 }]);
});
it("only an admin approves after the actual agreement, payment and identity gates", async () => {
  await submit();
  await expect(
    as(
      applicant,
      `select club_app.approve_member('${club}','${seasonId}','${applicant}')`,
    ),
  ).rejects.toThrow("MFA");
  await expect(
    as(
      admins[0],
      `select club_app.approve_member('${club}','${seasonId}','${applicant}')`,
      true,
    ),
  ).rejects.toThrow("signed agreement");
  expect((await list()).find((p) => p.user_id === applicant)?.status).toBe(
    "pending",
  );
});
it("approving a spare moves them into the approved list without reserving a session", async () => {
  await ready("spare");
  expect((await list()).find((p) => p.user_id === applicant)).toMatchObject({
    agreement_signed: true,
    identity_reviewed: true,
  });
  await as(
    admins[0],
    `select club_app.approve_member('${club}','${seasonId}','${applicant}')`,
    true,
  );
  expect((await list()).find((p) => p.user_id === applicant)?.status).toBe(
    "approved",
  );
  expect(
    (
      await db.query(
        `select * from club_app.spare_requests where user_id='${applicant}'`,
      )
    ).rows,
  ).toHaveLength(0);
  await expect(submit("regular", 2)).rejects.toThrow("reviewed registration");
});
it("the 26th regular application can be reviewed but cannot overfill the roster", async () => {
  await ready();
  await expect(
    as(
      admins[0],
      `select club_app.approve_member('${club}','${seasonId}','${applicant}')`,
      true,
    ),
  ).rejects.toThrow("roster is full");
  expect((await list()).find((p) => p.user_id === applicant)?.status).toBe(
    "pending",
  );
});
it("the queue excludes another club's registrations", async () => {
  expect(await list()).toHaveLength(25);
  await expect(
    as(
      admins[0],
      `select club_app.registration_review_list('${fixtureId(99)}')`,
      true,
    ),
  ).rejects.toThrow("MFA");
});
it("signed season terms cannot be replaced during a player review", async () => {
  await ready("spare");
  await expect(
    as(
      admins[0],
      `select club_app.publish_agreement('${club}','${seasonId}',repeat('SYNTHETIC replacement agreement. ',10),'Synthetic review',1);`,
      true,
    ),
  ).rejects.toThrow("already has signatures");
  expect(
    (await list()).find((p) => p.user_id === applicant)?.agreement_signed,
  ).toBe(true);
});
