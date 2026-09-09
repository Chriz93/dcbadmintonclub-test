import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
let db: PGlite;
const c = "12000000-0000-0000-0000-000000000001",
  se = "42000000-0000-0000-0000-000000000001",
  openSeason = "42000000-0000-0000-0000-000000000002",
  venue = "52000000-0000-0000-0000-000000000001",
  court = "82000000-0000-0000-0000-000000000001";
const ids = Array.from(
  { length: 7 },
  (_, i) => `23000000-0000-0000-0000-${String(i + 1).padStart(12, "0")}`,
);
const [admin, regular, regular2, spare, stranger, p5, p6] = ids;
const soon = "34000000-0000-0000-0000-000000000001",
  later = "34000000-0000-0000-0000-000000000002";
async function as(user: string, sql: string, aal = "aal1") {
  await db.exec(
    `set role authenticated;select set_config('request.jwt.claim.sub','${user}',false);select set_config('request.jwt.claims','{"aal":"${aal}"}',false);`,
  );
  try {
    return await db.exec(sql);
  } finally {
    await db.exec("reset role");
  }
}
const service = (sql: string) =>
  db.exec(`set role service_role;${sql};reset role;`);
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
    `insert into club_app.clubs(id,slug,name) values('${c}','launch','Launch league');
 insert into club_app.seasons(id,club_id,name,regular_capacity,rules) values('${se}','${c}','Closed season',25,'{"operationsEnabled":true,"requireIntake":true,"registrationClosed":true,"regularFeeCents":30000}'),('${openSeason}','${c}','Open season',25,'{"requireIntake":true}');
 insert into club_app.venues(id,club_id,name,address,rooms) values('${venue}','${c}','Gym','Street','A');
 insert into club_app.courts(id,club_id,venue_id,number) values('${court}','${c}','${venue}',1);`,
  );
  for (const [i, id] of ids.entries())
    await db.exec(
      `insert into auth.users values('${id}','launch${i}@example.invalid',now());insert into club_app.members(id,display_name,email) values('${id}','Launch ${i}','launch${i}@example.invalid');insert into club_app.memberships(club_id,user_id,role,status,kind) values('${c}','${id}','${i === 0 ? "club_admin" : "member"}','${i === 4 ? "pending" : "active"}','${i === 3 ? "spare" : "regular"}');`,
    );
  for (const id of [regular, regular2, spare, p5, p6])
    await db.exec(
      `insert into club_app.registrations(club_id,season_id,user_id,status) values('${c}','${se}','${id}','approved');insert into club_app.member_intake(club_id,season_id,user_id,legal_name,kind,emergency_contact,payment_status,claimed_amount_cents) values('${c}','${se}','${id}','Launch','${id === spare ? "spare" : "regular"}','Emergency','verified',30000);`,
    );
  await db.exec(
    `insert into club_app.sessions(id,club_id,season_id,venue_id,starts_at,ends_at,rsvp_deadline,capacity) values('${soon}','${c}','${se}','${venue}',now()+interval '5 days',now()+interval '5 days 2 hours',now()+interval '5 days'-interval '2 hours',2),('${later}','${c}','${se}','${venue}',now()+interval '12 days',now()+interval '12 days 2 hours',now()+interval '12 days'-interval '2 hours',25);`,
  );
}, 60000);
afterAll(async () => await db?.close());

it("closed registration only admits sign-in emails Christy confirmed, with the confirmed player type", async () => {
  const intake = (user: string, kind: string, season = se) =>
    as(
      user,
      `select club_app.submit_intake('${c}','${season}','Legal Name','Display','6135550100','Contact 613','${kind}','',0,0)`,
    );
  expect(
    (await as(stranger, `select club_app.my_invitation('${c}','${se}') k`))[0]
      .rows[0],
  ).toEqual({ k: "none" });
  await expect(intake(stranger, "regular")).rejects.toThrow(
    "Registration is closed",
  );
  await expect(
    as(
      stranger,
      `select club_app.invite_participants('${c}','${se}',array['launch4@example.invalid'],'regular','Self invite')`,
    ),
  ).rejects.toThrow("MFA");
  await expect(
    as(
      admin,
      `select club_app.invite_participants('${c}','${se}',array['not an email'],'regular','Bad address')`,
      "aal2",
    ),
  ).rejects.toThrow("Invalid email");
  expect(
    (
      await as(
        admin,
        `select club_app.invite_participants('${c}','${se}',array[' Launch4@Example.invalid ','other@example.invalid'],'spare','Confirmed spare applicants') n`,
        "aal2",
      )
    )[0].rows[0],
  ).toEqual({ n: 2 });
  expect(
    (await as(stranger, `select club_app.my_invitation('${c}','${se}') k`))[0]
      .rows[0],
  ).toEqual({ k: "spare" });
  await expect(intake(stranger, "regular")).rejects.toThrow(
    "player type Christy confirmed",
  );
  expect((await intake(stranger, "spare"))[0].rows).toEqual([
    { submit_intake: 1 },
  ]);
  await as(
    admin,
    `select club_app.revoke_invitation('${c}','${se}','launch4@example.invalid','No longer accepted')`,
    "aal2",
  );
  await expect(intake(stranger, "spare")).rejects.toThrow(
    "Registration is closed",
  );
  expect((await intake(stranger, "regular", openSeason))[0].rows).toEqual([
    { submit_intake: 1 },
  ]);
  expect(
    (await as(stranger, "select * from club_app.season_invitations"))[0].rows,
  ).toHaveLength(0);
  expect(
    (
      await db.query(
        `select action from club_app.audit_events where club_id='${c}' and action like 'invitation.%' order by id`,
      )
    ).rows,
  ).toEqual([{ action: "invitation.added" }, { action: "invitation.revoked" }]);
});

it("planning courts keeps the session open for spares; the first recorded score starts play", async () => {
  const plan = JSON.stringify([
    { court_id: court, players: [regular, regular2, p5, p6, spare] },
  ]);
  await db.exec(
    `insert into club_app.spare_requests(club_id,session_id,user_id,expires_at,payment_reference,status,paid_at,verified_by) values('${c}','${later}','${spare}',now()+interval '1 day','ref','confirmed',now(),'${admin}');`,
  );
  await as(
    admin,
    `select club_app.assign_courts('${c}','${later}',1,'${plan}',0,'Planned two days ahead')`,
    "aal2",
  );
  expect(
    (
      await db.query(
        `select status,revision from club_app.sessions where id='${later}'`,
      )
    ).rows,
  ).toEqual([{ status: "scheduled", revision: 1 }]);
  expect(
    (
      await db.query(
        `select user_id,ordinal from club_app.assignments where session_id='${later}' order by ordinal`,
      )
    ).rows,
  ).toEqual(
    [regular, regular2, p5, p6, spare].map((user_id, i) => ({
      user_id,
      ordinal: i + 1,
    })),
  );
  const game = (
    await db.query<{ id: string }>(
      `select id from club_app.matches where session_id='${later}' and game=1`,
    )
  ).rows[0].id;
  await as(
    admin,
    `select club_app.submit_score('${c}','${game}',15,9,0)`,
    "aal2",
  );
  expect(
    (await db.query(`select status from club_app.sessions where id='${later}'`))
      .rows,
  ).toEqual([{ status: "active" }]);
  await expect(
    as(spare, `select club_app.request_spare('${c}','${later}','late vote',0)`),
  ).rejects.toThrow("Spare voting closed");
  await db.exec(
    `update club_app.sessions set rsvp_deadline=now()-interval '1 minute' where id='${soon}'`,
  );
  await as(
    admin,
    `select club_app.assign_courts('${c}','${soon}',1,'${JSON.stringify([{ court_id: court, players: [regular, regular2] }])}',0,'Assigned inside the RSVP window')`,
    "aal2",
  );
  expect(
    (await db.query(`select status from club_app.sessions where id='${soon}'`))
      .rows,
  ).toEqual([{ status: "active" }]);
  await db.exec(
    `delete from club_app.matches where session_id='${soon}';delete from club_app.assignments where session_id='${soon}';update club_app.sessions set status='scheduled',rsvp_deadline=starts_at-interval '2 hours' where id='${soon}';delete from club_app.rate_limits;`,
  );
});

it("tells approved spares about each newly opened vacancy, never a closed one, and only once per opening", async () => {
  await db.exec(
    `insert into club_app.notification_preferences values('${c}','${spare}','email',true,now());delete from club_app.spare_requests where user_id='${spare}';`,
  );
  const count = async () =>
    (
      await db.query<{ n: number }>(
        `select count(*)::int n from club_app.notification_deliveries where template='spare.available' and user_id='${spare}' and payload->>'session'='${soon}'`,
      )
    ).rows[0].n;
  await db.exec(`update club_app.sessions set capacity=5 where id='${soon}';`);
  await service("select club_app.queue_due_reminders()");
  await service("select club_app.queue_due_reminders()");
  expect(await count()).toBe(1);
  await as(
    regular,
    `select club_app.submit_rsvp('${c}','${soon}','${regular}','not_attending','Away',0,gen_random_uuid())`,
  );
  await service("select club_app.queue_due_reminders()");
  await service("select club_app.queue_due_reminders()");
  expect(await count()).toBe(2);
  const latest = (
    await db.query<{ id: string }>(
      `select id from club_app.notification_deliveries where template='spare.available' and user_id='${spare}' order by created_at desc limit 1`,
    )
  ).rows[0].id;
  const enabled = async () =>
    (
      await db.query<{ t: { enabled: boolean } }>(
        `select club_app.delivery_target('${latest}') t`,
      )
    ).rows[0].t.enabled;
  await db.exec("set role service_role");
  try {
    expect(await enabled()).toBe(true);
  } finally {
    await db.exec("reset role");
  }
  await as(spare, `select club_app.request_spare('${c}','${soon}','paid',0)`);
  await service("select club_app.queue_due_reminders()");
  expect(await count()).toBe(2);
  await db.exec(
    `update club_app.sessions set capacity=1 where id='${soon}';delete from club_app.rate_limits;`,
  );
  await db.exec("set role service_role");
  try {
    expect(await enabled()).toBe(false);
  } finally {
    await db.exec("reset role");
  }
});

it("RSVP refunds follow the season fee and non-members are refused before any lock", async () => {
  expect(
    (
      await db.query(
        `select cents,status from club_app.session_accounts where session_id='${soon}' and user_id='${regular}' and kind='absence_refund'`,
      )
    ).rows,
  ).toEqual([{ cents: 1400, status: "pending" }]);
  await expect(
    as(
      stranger,
      `select club_app.submit_rsvp('${c}','${soon}','${stranger}','attending','',0,gen_random_uuid())`,
    ),
  ).rejects.toThrow("Forbidden");
});

it("pre-submission SMTP failures may retry with backoff; uncertain ones may not", async () => {
  const id = "99000000-0000-0000-0000-000000000040";
  await db.exec(
    `insert into club_app.notification_deliveries(id,club_id,user_id,channel,template,idempotency_key,status,attempts,lease_until,payload) values('${id}','${c}','${regular}','email','attendance.reminder','smtp-pre','processing',1,now()+interval '2 minutes','{}');`,
  );
  await service(`select club_app.begin_smtp_delivery('${id}',1)`);
  await expect(
    as(regular, `select club_app.abandon_smtp_delivery('${id}',1)`),
  ).rejects.toThrow();
  await service(`select club_app.abandon_smtp_delivery('${id}',1)`);
  await service(`select club_app.finish_delivery('${id}',1,'pending')`);
  expect(
    (
      await db.query(
        `select status,smtp_started_at from club_app.notification_deliveries where id='${id}'`,
      )
    ).rows,
  ).toEqual([{ status: "pending", smtp_started_at: null }]);
  await db.exec(
    `update club_app.notification_deliveries set status='processing',attempts=2,lease_until=now()+interval '2 minutes' where id='${id}';`,
  );
  await service(`select club_app.begin_smtp_delivery('${id}',2)`);
  await service(`select club_app.finish_delivery('${id}',2,'pending')`);
  expect(
    (
      await db.query(
        `select status from club_app.notification_deliveries where id='${id}'`,
      )
    ).rows,
  ).toEqual([{ status: "failed" }]);
});

it("organizer review queue and member next-session read expose only the right records", async () => {
  await db.exec(
    `insert into club_app.participant_eligibility(club_id,season_id,user_id,birth_date,guardian_email) values('${c}','${se}','${regular}','1990-01-01',null),('${c}','${se}','${p5}',(current_date-interval '15 years')::date,'parent@example.invalid');`,
  );
  await as(
    admin,
    `select club_app.review_eligibility('${c}','${se}','${regular}',1,null,'Checked birth date in person',true)`,
    "aal2",
  );
  await expect(
    as(regular, `select * from club_app.eligibility_review_queue('${c}')`),
  ).rejects.toThrow("MFA");
  const queue = (
    await as(
      admin,
      `select user_id,legal_name,review_current,signed,registration_status from club_app.eligibility_review_queue('${c}')`,
      "aal2",
    )
  )[0].rows;
  expect(queue).toEqual([
    {
      user_id: p5,
      legal_name: "Launch",
      review_current: null,
      signed: false,
      registration_status: "approved",
    },
    {
      user_id: regular,
      legal_name: "Launch",
      review_current: true,
      signed: false,
      registration_status: "approved",
    },
  ]);
  const mine = (
    await as(
      regular,
      `select session_id,status,response,placement,kind,courts from club_app.my_upcoming('${c}')`,
    )
  )[0].rows as Record<string, unknown>[];
  expect(mine.map((r) => r.session_id)).toEqual([soon, later]);
  expect(mine[0]).toMatchObject({
    response: "not_attending",
    kind: "regular",
    courts: [],
  });
  expect(mine[1]).toMatchObject({
    status: "active",
    courts: [{ round: 1, court: 1 }],
  });
  await expect(
    as(stranger, `select * from club_app.my_upcoming('${c}')`),
  ).rejects.toThrow("membership required");
});

it("a confirmed spare gets the full $20 back when the school cancels, not shuttles", async () => {
  const terms = (
    await db.query<{ terms: string }>("select club_app.agreement_terms() terms")
  ).rows[0].terms;
  expect(terms).toContain(
    "regular players receive two physical shuttlecocks with no cash refund",
  );
  expect(terms).toContain("Confirmed paid spares receive a full $20 refund");
  const sid = "34000000-0000-0000-0000-000000000003";
  await db.exec(
    `delete from club_app.rate_limits;insert into club_app.sessions(id,club_id,season_id,venue_id,starts_at,ends_at,rsvp_deadline,capacity) values('${sid}','${c}','${se}','${venue}',now()+interval '9 days',now()+interval '9 days 2 hours',now()+interval '9 days'-interval '2 hours',25);
 insert into club_app.spare_requests(club_id,session_id,user_id,expires_at,payment_reference,status,paid_at,verified_by) values('${c}','${sid}','${spare}',now()+interval '1 day','ref','confirmed',now(),'${admin}');`,
  );
  await as(admin, `select club_app.cancel_session('${c}','${sid}',0)`, "aal2");
  const ledger = (
    await db.query<{
      kind: string;
      cents: number;
      shuttles: number;
      status: string;
    }>(
      `select kind,cents,shuttles,status from club_app.session_accounts where session_id='${sid}' and user_id='${spare}' order by kind`,
    )
  ).rows;
  expect(ledger).toEqual([
    { kind: "shuttle_credit", cents: 0, shuttles: 2, status: "void" },
    {
      kind: "spare_reconciliation",
      cents: 2000,
      shuttles: 0,
      status: "pending",
    },
  ]);
  expect(
    (
      await db.query(
        `select shuttles,status from club_app.session_accounts where session_id='${sid}' and user_id='${regular2}' and kind='shuttle_credit'`,
      )
    ).rows,
  ).toEqual([{ shuttles: 2, status: "pending" }]);
});
