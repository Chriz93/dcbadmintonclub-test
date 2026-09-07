import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
let db: PGlite;
const c = "11000000-0000-0000-0000-000000000001",
  se = "41000000-0000-0000-0000-000000000001",
  venue = "51000000-0000-0000-0000-000000000001";
const ids = Array.from(
  { length: 6 },
  (_, i) => `22000000-0000-0000-0000-${String(i + 1).padStart(12, "0")}`,
);
const [admin, adult, minor, guardian, spare, other] = ids;
const sessions = Array.from(
  { length: 3 },
  (_, i) => `32000000-0000-0000-0000-${String(i + 1).padStart(12, "0")}`,
);
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
    `insert into club_app.clubs(id,slug,name) values('${c}','operations','Synthetic league');insert into club_app.seasons(id,club_id,name,regular_capacity,rules) values('${se}','${c}','Synthetic',1,'{"operationsEnabled":true,"requireIntake":true}');insert into club_app.venues(id,club_id,name,address,rooms) values('${venue}','${c}','Gym','Street','A');`,
  );
  for (const [i, id] of ids.entries()) {
    await db.exec(
      `insert into auth.users values('${id}','person${i}@example.invalid',now());insert into club_app.members(id,display_name,email) values('${id}','Person ${i}','person${i}@example.invalid');insert into club_app.memberships(club_id,user_id,role,status,kind) values('${c}','${id}','${i === 0 ? "club_admin" : "member"}','${i === 2 ? "pending" : "active"}','${i >= 4 ? "spare" : "regular"}');`,
    );
    if (i !== 0 && i !== 3)
      await db.exec(
        `insert into club_app.registrations(club_id,season_id,user_id,status) values('${c}','${se}','${id}','${i === 2 ? "pending" : "approved"}');insert into club_app.member_intake(club_id,season_id,user_id,legal_name,kind,emergency_contact,payment_status,claimed_amount_cents) values('${c}','${se}','${id}','Person ${i}','${i >= 4 ? "spare" : "regular"}','Emergency','verified',40000);`,
      );
  }
  for (const [i, id] of sessions.entries())
    await db.exec(
      `insert into club_app.sessions(id,club_id,season_id,venue_id,starts_at,ends_at,rsvp_deadline,capacity) values('${id}','${c}','${se}','${venue}',now()+interval '${i + 5} days',now()+interval '${i + 5} days 2 hours',now()+interval '${i + 4} days',1);`,
    );
}, 60000);
afterAll(async () => await db?.close());
const rsvp = (s: string, response: string, rev: number, key: number) =>
  `select club_app.submit_rsvp('${c}','${s}','${adult}','${response}','',${rev},'62000000-0000-0000-0000-${String(key).padStart(12, "0")}')`;
it("creates exactly one $14 refund and safely handles replay after changed attendance", async () => {
  await as(adult, rsvp(sessions[0], "not_attending", 0, 1));
  await as(adult, rsvp(sessions[0], "not_attending", 0, 1));
  expect(
    (
      await db.query<{ cents: number; status: string }>(
        "select cents,status from club_app.session_accounts",
      )
    ).rows,
  ).toEqual([{ cents: 1400, status: "pending" }]);
  await as(adult, rsvp(sessions[0], "attending", 1, 2));
  await as(adult, rsvp(sessions[0], "not_attending", 0, 1));
  expect(
    (
      await db.query<{ status: string }>(
        "select status from club_app.session_accounts",
      )
    ).rows[0].status,
  ).toBe("void");
});
it("credits two physical birds for a school cancellation without creating cash refund", async () => {
  await as(
    admin,
    `select club_app.cancel_session('${c}','${sessions[0]}',0)`,
    "aal2",
  );
  const { rows } = await db.query<{ cents: number; shuttles: number }>(
    `select cents,shuttles from club_app.session_accounts where kind='shuttle_credit'`,
  );
  expect(rows).toEqual([{ cents: 0, shuttles: 2 }]);
  await as(
    admin,
    `select club_app.cancel_session('${c}','${sessions[0]}',1)`,
    "aal2",
  );
  expect(
    (
      await db.query(
        `select * from club_app.session_accounts where kind='shuttle_credit'`,
      )
    ).rows,
  ).toHaveLength(1);
});
it("reserves unanswered regular places, then admits only one verified spare", async () => {
  await expect(
    as(spare, `select club_app.request_spare('${c}','${sessions[1]}','ref',0)`),
  ).rejects.toThrow("No vacancy");
  await as(adult, rsvp(sessions[1], "not_attending", 0, 3));
  await as(
    spare,
    `select club_app.request_spare('${c}','${sessions[1]}','ref-a',0)`,
  );
  await as(
    other,
    `select club_app.request_spare('${c}','${sessions[1]}','ref-b',0)`,
  );
  await expect(
    as(
      spare,
      `select club_app.verify_spare('${c}','${sessions[1]}','${spare}',1,'Payment received')`,
    ),
  ).rejects.toThrow("Administrator MFA");
  await as(
    admin,
    `select club_app.verify_spare('${c}','${sessions[1]}','${spare}',1,'Bank receipt checked')`,
    "aal2",
  );
  await as(
    admin,
    `select club_app.verify_spare('${c}','${sessions[1]}','${other}',1,'Bank receipt checked')`,
    "aal2",
  );
  expect(
    (
      await db.query<{ status: string }>(
        `select status from club_app.spare_requests order by user_id`,
      )
    ).rows.map((x) => x.status),
  ).toEqual(["confirmed", "reconciliation"]);
  expect(
    (
      await db.query<{ n: number }>(
        `select count(*)::int n from club_app.rsvps where session_id='${sessions[1]}' and placement='confirmed'`,
      )
    ).rows[0].n,
  ).toBe(1);
  await expect(as(adult, rsvp(sessions[1], "attending", 1, 4))).rejects.toThrow(
    "Place filled",
  );
});
it("prevents bypassing spare payment through ordinary RSVP and direct account writes", async () => {
  await expect(
    as(
      spare,
      `select club_app.submit_rsvp('${c}','${sessions[2]}','${spare}','attending','',0,gen_random_uuid())`,
    ),
  ).rejects.toThrow("Regular registration required");
  await expect(
    as(adult, `update club_app.session_accounts set status='settled'`),
  ).rejects.toThrow("permission denied");
  await expect(
    as(guardian, "select * from club_app.session_accounts"),
  ).resolves.toBeDefined();
  expect(
    (await as(guardian, "select * from club_app.session_accounts"))[0].rows,
  ).toHaveLength(0);
});
let waiver: string, hash: string;
it("publishes immutable reviewed agreements containing the confirmed rules", async () => {
  await expect(
    as(
      adult,
      `select club_app.publish_agreement('${c}','${se}',repeat('Reviewed synthetic text. ',10),'Synthetic counsel review',0)`,
    ),
  ).rejects.toThrow("Administrator MFA");
  await as(
    admin,
    `select club_app.publish_agreement('${c}','${se}',repeat('Reviewed synthetic text. ',10),'Synthetic counsel review',0)`,
    "aal2",
  );
  const {
    rows: [w],
  } = await db.query<{ id: string; body: string; sha256: string }>(
    "select id,body,sha256 from club_app.waiver_versions",
  );
  waiver = w.id;
  hash = w.sha256;
  expect(w.body).toContain("$14");
  expect(w.body).toContain("two physical shuttlecocks");
  expect(hash).toHaveLength(64);
});
it("routes a 17-year-old to the designated verified guardian and blocks forged/self signatures", async () => {
  await as(
    minor,
    `select club_app.save_eligibility('${c}','${se}',(current_date-interval '17 years')::date,'person3@example.invalid',0,true)`,
  );
  expect(
    (await as(minor, "select * from club_app.signing_options()"))[0].rows,
  ).toHaveLength(0);
  expect(
    (await as(other, "select * from club_app.signing_options()"))[0].rows,
  ).toHaveLength(0);
  expect(
    (await as(guardian, "select * from club_app.signing_options()"))[0].rows,
  ).toHaveLength(1);
  const sign = (h: string) =>
    `select club_app.sign_agreement('${c}','${se}','${minor}','${waiver}','${h}','Guardian Name','Parent',true,true)`;
  await expect(as(minor, sign(hash))).rejects.toThrow("authorized signer");
  await expect(as(guardian, sign("bad"))).rejects.toThrow("authorized signer");
  await as(guardian, sign(hash));
  await as(guardian, sign(hash));
  expect(
    (await db.query("select * from club_app.signature_receipts")).rows,
  ).toHaveLength(1);
  expect(
    (await as(other, "select * from club_app.signature_receipts"))[0].rows,
  ).toHaveLength(0);
  await expect(
    as(
      minor,
      `select club_app.register_member('${c}','${se}','Person 2','${waiver}')`,
    ),
  ).rejects.toThrow("verified participant");
});
it("requires explicit adult acceptance and exports a complete receipt", async () => {
  await as(
    adult,
    `select club_app.save_eligibility('${c}','${se}',(current_date-interval '30 years')::date,null,0,true)`,
  );
  await expect(
    as(
      adult,
      `select club_app.sign_agreement('${c}','${se}','${adult}','${waiver}','${hash}','Person 1',null,true,false)`,
    ),
  ).rejects.toThrow("explicit acceptance");
  await as(
    adult,
    `select club_app.sign_agreement('${c}','${se}','${adult}','${waiver}','${hash}','Person 1',null,true,true)`,
  );
  const saved = (
    await as(adult, "select * from club_app.signature_receipts")
  )[0].rows as { body: string; participant_name: string }[];
  expect(saved).toHaveLength(1);
  expect(saved[0].body).toContain("Organizer: Christy");
  expect(saved[0].participant_name).toBe("Person 1");
});
it("queues reminder once for an unresolved regular and never allows a member to run scheduler", async () => {
  await db.exec(
    `update club_app.sessions set starts_at=now()+interval '90 hours',ends_at=now()+interval '92 hours',rsvp_deadline=now()+interval '88 hours' where id='${sessions[2]}'`,
  );
  await as(adult, `select club_app.set_preference('${c}',true)`);
  await expect(
    as(adult, "select club_app.queue_due_reminders()"),
  ).rejects.toThrow("permission denied");
  await db.exec(
    "set role service_role;select club_app.queue_due_reminders();select club_app.queue_due_reminders();reset role;",
  );
  expect(
    (
      await db.query(
        `select * from club_app.notification_deliveries where template='attendance.reminder'`,
      )
    ).rows,
  ).toHaveLength(1);
});

it("suppresses a reminder after a response and promotes the next paid spare on withdrawal", async () => {
  await as(adult, rsvp(sessions[2], "attending", 0, 5));
  const {
    rows: [job],
  } = await db.query<{ id: string }>(
    `select id from club_app.notification_deliveries where template='attendance.reminder' limit 1`,
  );
  await db.exec("set role service_role");
  const target = await db.query<{ target: { enabled: boolean } }>(
    `select club_app.delivery_target('${job.id}') target`,
  );
  await db.exec("reset role");
  expect(target.rows[0].target.enabled).toBe(false);
  await as(
    spare,
    `select club_app.withdraw_spare('${c}','${sessions[1]}',2,'Cannot attend')`,
  );
  expect(
    (
      await db.query<{ status: string }>(
        `select status from club_app.spare_requests where user_id='${other}'`,
      )
    ).rows[0].status,
  ).toBe("confirmed");
  expect(
    (
      await db.query<{ status: string }>(
        `select status from club_app.session_accounts where kind='spare_reconciliation' and user_id='${other}'`,
      )
    ).rows[0].status,
  ).toBe("void");
});
it("requires actual absence, supports attendance correction and no-show reversal", async () => {
  await db.exec(
    `delete from club_app.rate_limits;update club_app.sessions set starts_at=now()-interval '2 hours',ends_at=now(),rsvp_deadline=now()-interval '4 hours',status='active' where id='${sessions[2]}'`,
  );
  await expect(
    as(
      admin,
      `select club_app.record_no_show('${c}','${sessions[2]}','${adult}',0,false,'Checked absent at venue')`,
      "aal2",
    ),
  ).rejects.toThrow("verified absence");
  await as(
    admin,
    `select club_app.correct_attendance('${c}','${sessions[2]}','${adult}','absent',null,'Checked venue attendance')`,
    "aal2",
  );
  await as(
    admin,
    `select club_app.record_no_show('${c}','${sessions[2]}','${adult}',0,false,'Checked absent at venue')`,
    "aal2",
  );
  await as(
    admin,
    `select club_app.record_no_show('${c}','${sessions[2]}','${adult}',1,true,'Corrected organizer error')`,
    "aal2",
  );
  expect(
    (
      await db.query<{ status: string }>(
        `select status from club_app.no_show_penalties where user_id='${adult}'`,
      )
    ).rows[0].status,
  ).toBe("void");
});
it("operational permission audit has no direct writes or browser helper access", async () => {
  const checks = await db.exec(
    readFileSync("scripts/verify-operations.sql", "utf8"),
  );
  expect(checks[0].rows).toEqual(
    expect.arrayContaining([
      { check_name: "RLS disabled", failures: 0 },
      { check_name: "Anonymous table privileges", failures: 0 },
      { check_name: "Member direct table writes", failures: 0 },
      { check_name: "Browser private helper execution", failures: 0 },
    ]),
  );
  expect(checks[1].rows).toEqual([
    {
      reviewed_assignment_ready: true,
      signatures_ready: true,
      undo_ready: true,
      spare_release_ready: true,
    },
  ]);
});
it("requires MFA and a current revision for club settings and season creation", async () => {
  const change = `select club_app.save_club_settings('${c}',0,'Synthetic updated','contact@example.invalid','#146b4c','Reviewed contact change')`;
  await expect(as(adult, change)).rejects.toThrow("MFA");
  await as(admin, change, "aal2");
  await expect(as(admin, change, "aal2")).rejects.toThrow("Revision");
  const create = `select club_app.create_season('${c}','Another synthetic season','Another gym','Synthetic street','A',3,12,8,10,'America/Toronto',21,15,'Reviewed new booking setup')`;
  await as(admin, create, "aal2");
  expect(
    (
      await db.query<{ n: number }>(
        `select count(*)::int n from club_app.courts where club_id='${c}'`,
      )
    ).rows[0].n,
  ).toBe(3);
  await expect(as(admin, create, "aal2")).rejects.toThrow("already exists");
});
it("only explicitly public announcements appear in the anonymous projection", async () => {
  const privateText = `select club_app.save_announcement('${c}',null,0,'Private notice','Members only',false,false,'Review synthetic notice')`;
  await as(admin, privateText, "aal2");
  const pub = await as(
    admin,
    `select club_app.save_announcement('${c}',null,0,'Public notice','<script>text only</script>',true,false,'Review synthetic notice') id`,
    "aal2",
  );
  const id = (pub[0].rows[0] as { id: string }).id;
  await db.exec("set role anon");
  try {
    const result = await db.query<{
      c: { announcements: { title: string }[] };
    }>(`select club_app.public_club('operations') c`);
    expect(result.rows[0].c.announcements.map((a) => a.title)).toEqual([
      "Public notice",
    ]);
  } finally {
    await db.exec("reset role");
  }
  await expect(
    as(
      adult,
      `select club_app.save_announcement('${c}','${id}',1,'Hacked','Wrong',true,false,'Unauthorized edit')`,
    ),
  ).rejects.toThrow("MFA");
  await as(
    admin,
    `select club_app.save_announcement('${c}','${id}',1,'Updated','Revised public text',true,false,'Reviewed correction')`,
    "aal2",
  );
  await expect(
    as(
      admin,
      `select club_app.save_announcement('${c}','${id}',1,'Stale','Stale public text',true,false,'Stale correction')`,
      "aal2",
    ),
  ).rejects.toThrow("Revision");
});
it("unsubscribe service disables only the authorized channel and is not browser callable", async () => {
  await db.exec(
    `insert into club_app.notification_preferences values('${c}','${adult}','sms',true,now()) on conflict(club_id,user_id,channel) do update set enabled=true,consented_at=now();`,
  );
  await expect(
    as(adult, `select club_app.unsubscribe_channel('${c}','${adult}','email')`),
  ).rejects.toThrow();
  await db.exec("set role service_role");
  try {
    await db.exec(
      `select club_app.unsubscribe_channel('${c}','${adult}','email')`,
    );
  } finally {
    await db.exec("reset role");
  }
  expect(
    (
      await db.query<{ channel: string; enabled: boolean }>(
        `select channel,enabled from club_app.notification_preferences where club_id='${c}' and user_id='${adult}' order by channel`,
      )
    ).rows,
  ).toEqual([
    { channel: "email", enabled: false },
    { channel: "sms", enabled: true },
  ]);
});
it("club-scoped privacy review never erases member or signed records", async () => {
  await as(adult, "select club_app.request_my_deletion()");
  await expect(
    as(adult, `select * from club_app.privacy_review_queue('${c}')`),
  ).rejects.toThrow("MFA");
  const queue = await as(
    admin,
    `select * from club_app.privacy_review_queue('${c}')`,
    "aal2",
  );
  expect(queue[0].rows).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ user_id: adult, revision: 0 }),
    ]),
  );
  await as(
    admin,
    `select club_app.record_privacy_review('${c}','${adult}',0,'Await retention review of signed season records')`,
    "aal2",
  );
  expect(
    (
      await db.query<{ n: number }>(
        `select count(*)::int n from club_app.signature_receipts where participant_id='${adult}'`,
      )
    ).rows[0].n,
  ).toBe(1);
  expect(
    (
      await db.query<{ status: string }>(
        `select status from club_app.deletion_requests where user_id='${adult}'`,
      )
    ).rows[0].status,
  ).toBe("pending");
});
it("live rollback rehearsal leaves no synthetic accounts or league records", async () => {
  const before = (await db.query("select count(*)::int n from auth.users"))
    .rows;
  await db.exec(readFileSync("scripts/live-test-rollback.sql", "utf8"));
  expect(
    (await db.query("select count(*)::int n from auth.users")).rows,
  ).toEqual(before);
  expect(
    (
      await db.query(
        "select count(*)::int n from club_app.clubs where slug like 'rollback-%'",
      )
    ).rows,
  ).toEqual([{ n: 0 }]);
});
it("allows a younger participant but still requires their separate verified guardian", async () => {
  await db.exec("begin");
  try {
    const young = "22000000-0000-0000-0000-000000000099";
    await db.exec(
      `insert into auth.users values('${young}','young@example.invalid',now());insert into club_app.members(id,display_name,email) values('${young}','Synthetic child','young@example.invalid');insert into club_app.memberships(club_id,user_id,role,status) values('${c}','${young}','member','pending');insert into club_app.member_intake(club_id,season_id,user_id,legal_name,kind,emergency_contact) values('${c}','${se}','${young}','Synthetic child','regular','Synthetic contact');`,
    );
    await as(
      young,
      `select club_app.save_eligibility('${c}','${se}',(current_date-interval '12 years')::date,'person3@example.invalid',0,true)`,
    );
    expect(
      (await as(young, "select * from club_app.signing_options()"))[0].rows,
    ).toHaveLength(0);
    expect(
      (
        await as(
          guardian,
          `select * from club_app.signing_options() where participant_id='${young}'`,
        )
      )[0].rows,
    ).toHaveLength(1);
    expect(
      (
        await db.query<{ terms: string }>(
          "select club_app.agreement_terms() terms",
        )
      ).rows[0].terms,
    ).toContain("no minimum participant age");
  } finally {
    await db.exec("rollback");
  }
});
it("archives old games without granting membership and exposes only explicitly linked history", async () => {
  const { createHash } = await import("node:crypto");
  const source = JSON.stringify({
    players: [
      {
        id: 10,
        name: "Legacy Adult",
        email: "person1@example.invalid",
        medical: "DO NOT EXPOSE",
      },
      { id: 11, name: "Legacy Opponent", email: "person2@example.invalid" },
    ],
    sessions: [
      {
        date: "April 2026",
        scores: {
          c1_y1_g1: { a1: 10, a2: null, b1: 11, b2: null, sA: 21, sB: 15 },
          c1_y1_g2: { a1: 10, a2: null, b1: 11, b2: null, sA: 15, sB: 15 },
        },
      },
    ],
  });
  const digest = createHash("sha256").update(source).digest("hex");
  const quote = (s: string) => "'" + s.replaceAll("'", "''") + "'";
  await expect(
    as(
      adult,
      `select club_app.archive_legacy_history('${c}','Legacy season',${quote(source)},'${digest}')`,
    ),
  ).rejects.toThrow("MFA");
  const result = await as(
    admin,
    `select club_app.archive_legacy_history('${c}','Legacy season',${quote(source)},'${digest}') id`,
    "aal2",
  );
  const archive = result[0].rows[0].id;
  expect(
    (await as(adult, "select * from club_app.my_legacy_matches()"))[0].rows,
  ).toHaveLength(0);
  await expect(
    as(
      admin,
      `select club_app.link_legacy_identity('${c}','${se}','${archive}','10','${other}','Synthetic identity review')`,
      "aal2",
    ),
  ).rejects.toThrow("matching verified email");
  await as(
    admin,
    `select club_app.link_legacy_identity('${c}','${se}','${archive}','10','${adult}','Synthetic reviewed email match')`,
    "aal2",
  );
  const history = (
    await as(adult, "select * from club_app.my_legacy_matches()")
  )[0].rows;
  expect(history).toHaveLength(2);
  expect(JSON.stringify(history)).not.toContain("DO NOT EXPOSE");
  expect(JSON.stringify(history)).not.toContain("person1@");
  expect(history.map((x) => x.needs_review)).toEqual([false, true]);
  expect(
    (await as(other, "select * from club_app.my_legacy_matches()"))[0].rows,
  ).toHaveLength(0);
  expect(
    (await as(adult, "select * from club_app.legacy_archives"))[0].rows,
  ).toHaveLength(0);
  const replay = await as(
    admin,
    `select club_app.archive_legacy_history('${c}','Legacy season',${quote(source)},'${digest}') id`,
    "aal2",
  );
  expect(replay[0].rows[0].id).toBe(archive);
});
