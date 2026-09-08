import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
let db: PGlite;
const c = "10000000-0000-0000-0000-000000000001",
  other = "10000000-0000-0000-0000-000000000002",
  u = "20000000-0000-0000-0000-000000000001",
  v = "20000000-0000-0000-0000-000000000002",
  admin = "20000000-0000-0000-0000-000000000003",
  s = "30000000-0000-0000-0000-000000000001",
  seasonId = "40000000-0000-0000-0000-000000000001",
  venueId = "50000000-0000-0000-0000-000000000001";
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
const request = (
  user: string,
  response: string,
  revision: number,
  key: number,
) =>
  `select club_app.submit_rsvp('${c}','${s}','${user}','${response}','',${revision},'60000000-0000-0000-0000-${String(key).padStart(12, "0")}')`;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;grant usage on schema auth to authenticated;grant execute on all functions in schema auth to authenticated;`,
  );
  for (const migration of readdirSync("migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync("migrations/" + migration, "utf8"));
  await db.exec(
    `insert into auth.users(id) values('${u}'),('${v}'),('${admin}');insert into club_app.clubs(id,slug,name) values('${c}','a','Club A'),('${other}','b','Club B');insert into club_app.members(id,display_name,email) values('${u}','A','a@example.invalid'),('${v}','B','b@example.invalid'),('${admin}','Admin','admin@example.invalid');insert into club_app.memberships(club_id,user_id,role,status) values('${c}','${u}','member','active'),('${c}','${v}','member','active'),('${c}','${admin}','club_admin','active');insert into club_app.venues(id,club_id,name,address,rooms) values('${venueId}','${c}','Gym','Street','A');insert into club_app.seasons(id,club_id,name,regular_capacity) values('${seasonId}','${c}','Test',25);insert into club_app.sessions(id,club_id,season_id,venue_id,starts_at,ends_at,rsvp_deadline,capacity) values('${s}','${c}','${seasonId}','${venueId}',now()+interval '2 days',now()+interval '2 days 2 hours',now()+interval '1 day',1);`,
  );
}, 60000);
afterAll(async () => {
  await db?.close();
});
describe.sequential("actual PostgreSQL policies and transactions", () => {
  it("anonymous cannot read member tables or call RSVP", async () => {
    await db.exec("set role anon");
    try {
      await expect(db.exec("select * from club_app.members")).rejects.toThrow();
      await expect(db.exec(request(u, "attending", 0, 1))).rejects.toThrow();
    } finally {
      await db.exec("reset role");
    }
  });
  it("member sees only own private profile", async () => {
    const result = await as(u, "select id from club_app.members");
    expect(result[0].rows).toEqual([{ id: u }]);
  });
  it("tenant read isolates Club B", async () => {
    const result = await as(u, "select id from club_app.clubs");
    expect(result[0].rows).toEqual([{ id: c }]);
  });
  it("cannot directly escalate own membership", async () => {
    await expect(
      as(
        u,
        `update club_app.memberships set role='club_owner' where user_id='${u}'`,
      ),
    ).rejects.toThrow();
  });
  it("cannot forge another member RSVP", async () =>
    await expect(as(u, request(v, "attending", 0, 2))).rejects.toThrow(
      "Forbidden",
    ));
  it("admin requires AAL2 for delegated RSVP", async () =>
    await expect(as(admin, request(v, "attending", 0, 3))).rejects.toThrow(
      "Forbidden",
    ));
  it("writes RSVP and exactly one opt-in notification atomically", async () => {
    await as(u, `select club_app.set_preference('${c}',true)`);
    await as(u, request(u, "attending", 0, 4));
    const counts = await db.query<{ n: number }>(
      "select count(*)::int n from club_app.notification_deliveries",
    );
    expect(counts.rows[0].n).toBe(1);
  });
  it("same request retry returns old result without duplicate notice", async () => {
    await as(u, request(u, "attending", 0, 4));
    expect(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from club_app.notification_deliveries",
        )
      ).rows[0].n,
    ).toBe(1);
  });
  it("rejects idempotency payload mismatch", async () =>
    await expect(as(u, request(u, "maybe", 0, 4))).rejects.toThrow(
      "Idempotency",
    ));
  it("rejects stale revision without changing state", async () => {
    await expect(as(u, request(u, "maybe", 0, 5))).rejects.toThrow(
      "Revision conflict",
    );
    const r = await db.query<{ response: string }>(
      `select response from club_app.rsvps where user_id='${u}'`,
    );
    expect(r.rows[0].response).toBe("attending");
  });
  it("enforces capacity; promotes waiter when a place opens", async () => {
    await as(v, request(v, "attending", 0, 6));
    expect(
      (
        await db.query<{ placement: string }>(
          `select placement from club_app.rsvps where user_id='${v}'`,
        )
      ).rows[0].placement,
    ).toBe("waitlisted");
    await as(u, request(u, "not_attending", 1, 7));
    expect(
      (
        await db.query<{ placement: string }>(
          `select placement from club_app.rsvps where user_id='${v}'`,
        )
      ).rows[0].placement,
    ).toBe("confirmed");
  });
  it("denies direct audit or outbox tampering", async () => {
    await expect(as(u, "delete from club_app.audit_events")).rejects.toThrow();
    await expect(
      as(u, "delete from club_app.notification_deliveries"),
    ).rejects.toThrow();
  });
  it("compound foreign keys reject cross-club session references", async () =>
    await expect(
      db.exec(
        `insert into club_app.sessions(club_id,season_id,venue_id,starts_at,ends_at,rsvp_deadline,capacity) values('${other}','${seasonId}','${venueId}',now()+interval '3 days',now()+interval '4 days',now(),10)`,
      ),
    ).rejects.toThrow());
  it("admin AAL2 can act on behalf and is audited", async () => {
    await as(admin, request(v, "maybe", 2, 8), "aal2");
    expect(
      (
        await db.query<{ actor: string }>(
          `select actor from club_app.audit_events where subject='${v}' and action='rsvp.changed' order by id desc limit 1`,
        )
      ).rows[0].actor,
    ).toBe(admin);
  });
});

describe.sequential("operations, queue and rate limits", () => {
  it("public schedule contains no member fields", async () => {
    await db.exec("set role anon");
    try {
      const rows = await db.query(
        "select * from club_app.public_schedule('a')",
      );
      expect(
        Object.keys(rows.rows[0] as Record<string, unknown>),
      ).not.toContain("email");
      expect(rows.rows).toHaveLength(1);
    } finally {
      await db.exec("reset role");
    }
  });
  it("member cannot cancel or claim delivery jobs", async () => {
    await expect(
      as(u, `select club_app.cancel_session('${c}','${s}',0)`),
    ).rejects.toThrow();
    await expect(
      as(u, "select * from club_app.claim_deliveries(10)"),
    ).rejects.toThrow();
  });
  it("score validation and competing stale submissions", async () => {
    const court = "80000000-0000-0000-0000-000000000001",
      match = "90000000-0000-0000-0000-000000000001";
    await db.exec(
      `insert into club_app.courts(id,club_id,venue_id,number) values('${court}','${c}','${venueId}',1);update club_app.sessions set status='active' where id='${s}';insert into club_app.matches(id,club_id,session_id,court_id,round,game,target,side_a,side_b) values('${match}','${c}','${s}','${court}',1,1,15,array['${u}']::uuid[],array['${v}']::uuid[]);`,
    );
    await expect(
      as(u, `select club_app.submit_score('${c}','${match}',15,12,0)`),
    ).rejects.toThrow("Forbidden");
    await expect(
      as(
        admin,
        `select club_app.submit_score('${c}','${match}',14,12,0)`,
        "aal2",
      ),
    ).rejects.toThrow("Invalid completed score");
    await as(
      admin,
      `select club_app.submit_score('${c}','${match}',15,12,0)`,
      "aal2",
    );
    await expect(
      as(
        admin,
        `select club_app.submit_score('${c}','${match}',15,10,0)`,
        "aal2",
      ),
    ).rejects.toThrow("Revision conflict");
  });
  it("recorded scores cannot be overwritten through ordinary score entry", async () => {
    const match = "90000000-0000-0000-0000-000000000001";
    await expect(
      as(
        admin,
        `select club_app.submit_score('${c}','${match}',15,0,1)`,
        "aal2",
      ),
    ).rejects.toThrow("administrator correction");
    expect(
      (
        await db.query(
          `select score_a,score_b,revision from club_app.matches where id='${match}'`,
        )
      ).rows,
    ).toEqual([{ score_a: 15, score_b: 12, revision: 1 }]);
  });
  it("cancellation requires MFA, audits and queues consented notices", async () => {
    await as(admin, `select club_app.cancel_session('${c}','${s}',0)`, "aal2");
    expect(
      (
        await db.query<{ status: string }>(
          `select status from club_app.sessions where id='${s}'`,
        )
      ).rows[0].status,
    ).toBe("cancelled");
    await expect(as(u, request(u, "attending", 2, 50))).rejects.toThrow(
      "RSVP closed",
    );
  });
  it("queue leases do not claim same jobs twice; failure retries", async () => {
    await db.exec("set role service_role");
    try {
      const jobs = await db.query<{ id: string; attempts: number }>(
        "select * from club_app.claim_deliveries(10)",
      );
      expect(jobs.rows.length).toBeGreaterThan(0);
      expect(
        (await db.query("select * from club_app.claim_deliveries(10)")).rows,
      ).toHaveLength(0);
      const job = jobs.rows[0];
      await db.query("select club_app.finish_delivery($1,$2,$3,$4)", [
        job.id,
        job.attempts,
        "pending",
        null,
      ]);
      await expect(
        db.query("select club_app.finish_delivery($1,$2,$3,$4)", [
          job.id,
          job.attempts,
          "delivered",
          "x",
        ]),
      ).rejects.toThrow("Stale delivery lease");
    } finally {
      await db.exec("reset role");
    }
  });
  it("unsubscribe suppresses future notification enqueue", async () => {
    await as(u, `select club_app.set_preference('${c}',false)`);
    expect(
      (
        await db.query<{ enabled: boolean }>(
          `select enabled from club_app.notification_preferences where user_id='${u}'`,
        )
      ).rows[0].enabled,
    ).toBe(false);
  });
  it("rate limits successful mutation attempts", async () => {
    await db.exec(`delete from club_app.rate_limits where user_id='${u}'`);
    for (let i = 0; i < 30; i++)
      await as(u, `select club_app.set_preference('${c}',false)`);
    await expect(
      as(u, `select club_app.set_preference('${c}',false)`),
    ).rejects.toThrow("Rate limit");
  });
});

describe.sequential("court session lifecycle and permit import", () => {
  const s2 = "30000000-0000-0000-0000-000000000002";
  const memberIds = Array.from(
    { length: 25 },
    (_, i) => `21000000-0000-0000-0000-${String(i + 1).padStart(12, "0")}`,
  );
  const courtIds = Array.from(
    { length: 6 },
    (_, i) => `81000000-0000-0000-0000-${String(i + 1).padStart(12, "0")}`,
  );
  const plan = courtIds.map((court_id, i) => ({
    court_id,
    players: memberIds.slice(i * 4, i === 5 ? 25 : (i + 1) * 4),
  }));
  it("atomically assigns 25 players and generates the five-player games", async () => {
    await db.exec(
      `delete from club_app.rate_limits;update club_app.sessions set status='scheduled' where id='${s}';insert into club_app.sessions(id,club_id,season_id,venue_id,starts_at,ends_at,rsvp_deadline,capacity) values('${s2}','${c}','${seasonId}','${venueId}',now()+interval '5 days',now()+interval '5 days 2 hours',now()+interval '4 days',25);`,
    );
    for (const id of memberIds)
      await db.exec(
        `insert into auth.users(id) values('${id}');insert into club_app.members(id,display_name,email) values('${id}','Synthetic','synthetic@example.invalid');insert into club_app.memberships(club_id,user_id,role,status) values('${c}','${id}','member','active');`,
      );
    for (let i = 0; i < 6; i++)
      await db.exec(
        `insert into club_app.courts(id,club_id,venue_id,number) values('${courtIds[i]}','${c}','${venueId}',${i + 2});`,
      );
    await as(
      admin,
      `select club_app.assign_courts('${c}','${s2}',1,'${JSON.stringify(plan)}',0,'Initial synthetic assignment')`,
      "aal2",
    );
    const games = await db.query<{
      target: number;
      side_a: string[];
      side_b: string[];
    }>(
      `select target,side_a,side_b from club_app.matches where session_id='${s2}' and court_id='${courtIds[5]}'`,
    );
    expect(games.rows).toHaveLength(5);
    expect(games.rows.every((g) => g.target === 15)).toBe(true);
    for (const id of memberIds.slice(20))
      expect(
        games.rows.filter((g) => [...g.side_a, ...g.side_b].includes(id)),
      ).toHaveLength(4);
  });
  it("rejects impossible duplicate assignment with rollback", async () => {
    const broken = structuredClone(plan);
    broken[0].players[0] = broken[1].players[0];
    await expect(
      as(
        admin,
        `select club_app.assign_courts('${c}','${s2}',1,'${JSON.stringify(broken)}',1,'Invalid duplicate override')`,
        "aal2",
      ),
    ).rejects.toThrow("Duplicate players");
    expect(
      (
        await db.query<{ n: number }>(
          `select count(*)::int n from club_app.assignments where session_id='${s2}'`,
        )
      ).rows[0].n,
    ).toBe(25);
  });
  it("checks attendance and rejects incomplete session completion", async () => {
    await as(
      admin,
      `select club_app.check_in('${c}','${s2}','${memberIds[0]}','present')`,
      "aal2",
    );
    await expect(
      as(admin, `select club_app.complete_session('${c}','${s2}',1)`, "aal2"),
    ).rejects.toThrow("All scheduled games");
  });
  it("completes games and normalizes season statistics without repeated completion", async () => {
    const games = await db.query<{ id: string; target: number }>(
      `select id,target from club_app.matches where session_id='${s2}'`,
    );
    for (const game of games.rows)
      await as(
        admin,
        `select club_app.submit_score('${c}','${game.id}',${game.target},0,0)`,
        "aal2",
      );
    await as(
      admin,
      `select club_app.complete_session('${c}','${s2}',1)`,
      "aal2",
    );
    expect(
      (
        await db.query(
          `select * from club_app.rankings where season_id='${seasonId}'`,
        )
      ).rows,
    ).toHaveLength(25);
    await expect(
      as(admin, `select club_app.complete_session('${c}','${s2}',1)`, "aal2"),
    ).rejects.toThrow();
  });
  it("requires explicit confirmation and imports idempotently", async () => {
    await db.exec("delete from club_app.rate_limits");
    const rows = JSON.stringify([
      {
        starts_at: "2028-09-05T00:15:00Z",
        ends_at: "2028-09-05T02:15:00Z",
        status: "active",
      },
    ]);
    const sql = (confirm: boolean) =>
      `select club_app.import_permit('${c}','${seasonId}','${venueId}','test-permit','synthetic.pdf','${"a".repeat(64)}','${rows}',1,2,${confirm})`;
    await expect(as(admin, sql(false), "aal2")).rejects.toThrow("Confirmed");
    await as(admin, sql(true), "aal2");
    await as(admin, sql(true), "aal2");
    expect(
      (
        await db.query(
          `select * from club_app.sessions where starts_at='2028-09-05T00:15:00Z'`,
        )
      ).rows,
    ).toHaveLength(1);
  });
  it("restores an isolated Postgres database archive with data and policies intact", async () => {
    const dump = await db.dumpDataDir();
    const restored = new PGlite({ loadDataDir: dump });
    try {
      const before = await db.query(
        "select club_id,user_id,played,wins,points from club_app.rankings order by user_id",
      );
      const after = await restored.query(
        "select club_id,user_id,played,wins,points from club_app.rankings order by user_id",
      );
      expect(after.rows).toEqual(before.rows);
      await restored.exec("set role anon");
      await expect(
        restored.query("select * from club_app.members"),
      ).rejects.toThrow();
    } finally {
      await restored.close();
    }
  }, 60000);
});

it("private export and deletion request are limited to the authenticated person", async () => {
  await db.exec("delete from club_app.rate_limits");
  const result = await as(u, "select club_app.export_my_data() as export");
  const exported = (
    result[0].rows[0] as { export: { profile: { id: string } } }
  ).export;
  expect(exported.profile.id).toBe(u);
  await as(u, "select club_app.request_my_deletion()");
  expect(
    (
      await db.query<{ user_id: string }>(
        "select user_id from club_app.deletion_requests",
      )
    ).rows,
  ).toEqual([{ user_id: u }]);
});

it("verified registration records versioned waiver and requires admin approval", async () => {
  const newUser = "22000000-0000-0000-0000-000000000001",
    waiver = "23000000-0000-0000-0000-000000000001";
  await db.exec(
    `insert into auth.users values('${newUser}','new@example.invalid',now());insert into club_app.waiver_versions(id,club_id,version,body,sha256) values('${waiver}','${c}',1,'Synthetic test waiver only','test-hash');delete from club_app.rate_limits;`,
  );
  await as(
    newUser,
    `select club_app.register_member('${c}','${seasonId}','Synthetic member','${waiver}')`,
  );
  expect(
    (
      await db.query<{ status: string }>(
        `select status from club_app.memberships where user_id='${newUser}'`,
      )
    ).rows[0].status,
  ).toBe("pending");
  expect(
    (
      await db.query(
        `select * from club_app.waiver_acceptances where user_id='${newUser}'`,
      )
    ).rows,
  ).toHaveLength(1);
  await expect(
    as(
      newUser,
      `select club_app.approve_member('${c}','${seasonId}','${newUser}')`,
    ),
  ).rejects.toThrow();
  await as(
    admin,
    `select club_app.approve_member('${c}','${seasonId}','${newUser}')`,
    "aal2",
  );
  expect(
    (
      await db.query<{ status: string }>(
        `select status from club_app.memberships where user_id='${newUser}'`,
      )
    ).rows[0].status,
  ).toBe("active");
});

describe("minimal club roster", () => {
  it("exposes names only within the authorized club", async () => {
    const rows = await as(u, `select * from club_app.club_roster('${c}')`);
    expect(rows[0].rows.length).toBeGreaterThan(0);
    expect(Object.keys(rows[0].rows[0]).sort()).toEqual([
      "display_name",
      "kind",
      "user_id",
    ]);
    await expect(
      as(u, `select * from club_app.club_roster('${other}')`),
    ).rejects.toThrow("Forbidden");
    await db.exec("set role anon");
    try {
      await expect(
        db.exec(`select * from club_app.club_roster('${c}')`),
      ).rejects.toThrow();
    } finally {
      await db.exec("reset role");
    }
  });
});

describe("nullable RPC concurrency guards", () => {
  it("rejects null revisions and keeps implementations private", async () => {
    for (const sql of [
      `select club_app.submit_score('${c}','${s}',15,12,null)`,
      `select club_app.assign_courts('${c}','${s}',1,'[]',null,'test reason')`,
      `select club_app.complete_session('${c}','${s}',null)`,
      `select club_app.cancel_session('${c}','${s}',null)`,
    ])
      await expect(as(admin, sql, "aal2")).rejects.toThrow(
        "Valid revision required",
      );
    await expect(
      as(
        admin,
        `select club_app.submit_score_impl('${c}','${s}',15,12,0)`,
        "aal2",
      ),
    ).rejects.toThrow("permission denied");
  });
  it("requires non-null permit preview totals", async () => {
    await expect(
      as(
        admin,
        `select club_app.import_permit('${c}','${seasonId}','${venueId}','p','file.pdf',repeat('a',64),'[]',null,null,true)`,
        "aal2",
      ),
    ).rejects.toThrow("Confirmed totals required");
  });
});

it("rejects permit rows with an omitted booking status", async () => {
  await expect(
    as(
      admin,
      `select club_app.import_permit('${c}','${seasonId}','${venueId}','p','file.pdf',repeat('b',64),'[{"starts_at":"2030-01-02T20:00:00Z","ends_at":"2030-01-02T22:00:00Z"}]',0,0,true)`,
      "aal2",
    ),
  ).rejects.toThrow("Invalid booking");
});

describe.sequential("league recovery and intake", () => {
  const completed = "30000000-0000-0000-0000-000000000002";
  it("restricts standings to club members", async () => {
    const r = await as(
      u,
      `select * from club_app.league_standings('${c}','${seasonId}')`,
    );
    expect(r[0].rows.length).toBeGreaterThan(0);
    expect(Object.keys(r[0].rows[0])).not.toContain("email");
    await expect(
      as(
        u,
        `select * from club_app.league_standings('${other}','${seasonId}')`,
      ),
    ).rejects.toThrow("Club membership required");
  });
  it("corrects completed scores only with MFA and current revision", async () => {
    await db.exec("delete from club_app.rate_limits");
    const {
      rows: [m],
    } = await db.query<{ id: string; revision: number; target: number }>(
      `select id,revision,target from club_app.matches where session_id='${completed}' limit 1`,
    );
    const sql = `select club_app.correct_score('${c}','${m.id}',0,${m.target},${m.revision},'Correct transposed score')`;
    await expect(as(u, sql)).rejects.toThrow("Administrator MFA required");
    await expect(as(admin, sql)).rejects.toThrow("Administrator MFA required");
    await as(admin, sql, "aal2");
    await expect(as(admin, sql, "aal2")).rejects.toThrow("Revision conflict");
    expect(
      (
        await db.query<{ n: number }>(
          `select count(*)::int n from club_app.audit_events where action='score.corrected'`,
        )
      ).rows[0].n,
    ).toBe(1);
  });
  it("rejects stale restart previews and retains old rounds in audit", async () => {
    const {
      rows: [ss],
    } = await db.query<{ revision: number }>(
      `select revision from club_app.sessions where id='${completed}'`,
    );
    const {
      rows: [snapshot],
    } = await db.query<{ versions: unknown }>(
      `select jsonb_object_agg(id::text,revision) versions from club_app.matches where session_id='${completed}'`,
    );
    await expect(
      as(
        admin,
        `select club_app.restart_round('${c}','${completed}',1,${ss.revision},'{}','Fix wrong initial seeding')`,
        "aal2",
      ),
    ).rejects.toThrow("Match revision conflict");
    await as(
      admin,
      `select club_app.restart_round('${c}','${completed}',1,${ss.revision},'${JSON.stringify(snapshot.versions)}','Fix wrong initial seeding')`,
      "aal2",
    );
    expect(
      (
        await db.query<{ n: number }>(
          `select count(*)::int n from club_app.matches where session_id='${completed}'`,
        )
      ).rows[0].n,
    ).toBe(0);
    expect(
      (
        await db.query<{ status: string }>(
          `select status from club_app.sessions where id='${completed}'`,
        )
      ).rows[0].status,
    ).toBe("active");
    expect(
      (
        await db.query<{ n: number }>(
          `select jsonb_array_length(before_value->'matches') n from club_app.audit_events where action='round.restarted'`,
        )
      ).rows[0].n,
    ).toBe(20);
  });
  it("keeps payment claims unverified, private and protected by revisions", async () => {
    await db.exec(
      `update auth.users set email='a@example.invalid',email_confirmed_at=now() where id='${u}'`,
    );
    const sql = `select club_app.submit_intake('${c}','${seasonId}','Legal Name','Display Name','555-0100','Emergency 555-0101','regular','TEST-REFERENCE',40000,0)`;
    await as(u, sql);
    expect(
      (
        await as(
          u,
          `select payment_status,revision from club_app.member_intake`,
        )
      )[0].rows,
    ).toEqual([{ payment_status: "unverified", revision: 1 }]);
    expect(
      (await as(v, `select * from club_app.member_intake`))[0].rows,
    ).toHaveLength(0);
    await expect(
      as(u, `update club_app.member_intake set payment_status='verified'`),
    ).rejects.toThrow("permission denied");
    await expect(as(u, sql)).rejects.toThrow("Revision conflict");
    await expect(
      as(
        u,
        `select club_app.verify_intake_payment('${c}','${seasonId}','${u}',1,'Bank payment checked')`,
      ),
    ).rejects.toThrow("Administrator MFA required");
    await as(
      admin,
      `select club_app.verify_intake_payment('${c}','${seasonId}','${u}',1,'Bank payment checked')`,
      "aal2",
    );
    await expect(as(u, sql.replace("40000,0", "40000,2"))).rejects.toThrow(
      "Ask administrator",
    );
  });
});

it("requires the current participant waiver before approving paid intake", async () => {
  await db.exec(
    `delete from club_app.rate_limits;update club_app.seasons set rules=rules||'{"requireIntake":true,"regularFeeCents":40000}' where id='${seasonId}'`,
  );
  await expect(
    as(
      admin,
      `select club_app.approve_member('${c}','${seasonId}','${u}')`,
      "aal2",
    ),
  ).rejects.toThrow("Latest participant waiver acceptance required");
  const {
    rows: [w],
  } = await db.query<{ id: string }>(
    `select id from club_app.waiver_versions where club_id='${c}' order by version desc limit 1`,
  );
  await as(
    u,
    `select club_app.register_member('${c}','${seasonId}','Display Name','${w.id}')`,
  );
  await as(
    admin,
    `select club_app.approve_member('${c}','${seasonId}','${u}')`,
    "aal2",
  );
  expect(
    (
      await db.query<{ status: string }>(
        `select status from club_app.registrations where season_id='${seasonId}' and user_id='${u}'`,
      )
    ).rows[0].status,
  ).toBe("approved");
  const result = await as(u, "select club_app.export_my_data() data");
  expect(
    (result[0].rows[0] as { data: { intake: unknown[] } }).data.intake,
  ).toHaveLength(1);
});

it("rebuilds doubles ELO with equal round weight and reverses a score correction", async () => {
  const sid = "33000000-0000-0000-0000-000000000001";
  const court = "81000000-0000-0000-0000-000000000001";
  const players = Array.from(
    { length: 4 },
    (_, i) => `21000000-0000-0000-0000-${String(i + 1).padStart(12, "0")}`,
  );
  await db.exec(
    `delete from club_app.rate_limits;insert into club_app.sessions(id,club_id,season_id,venue_id,starts_at,ends_at,rsvp_deadline,capacity) values('${sid}','${c}','${seasonId}','${venueId}',now()+interval '15 days',now()+interval '15 days 2 hours',now()+interval '14 days',4);`,
  );
  await as(
    admin,
    `select club_app.assign_courts('${c}','${sid}',1,'${JSON.stringify([{ court_id: court, players }])}',0,'Synthetic ELO rehearsal')`,
    "aal2",
  );
  await db.exec(
    `update club_app.matches set score_a=21,score_b=0 where session_id='${sid}'`,
  );
  await as(
    admin,
    `select club_app.complete_session('${c}','${sid}',1)`,
    "aal2",
  );
  let rating = await db.query<{ rating: string }>(
    `select rating from club_app.elo_ratings where club_id='${c}' and season_id='${seasonId}' and user_id='${players[0]}'`,
  );
  expect(Number(rating.rows[0].rating)).toBeCloseTo(1016);
  const game = await db.query<{ id: string }>(
    `select id from club_app.matches where session_id='${sid}' and game=1`,
  );
  await as(
    admin,
    `select club_app.correct_score('${c}','${game.rows[0].id}',0,21,0,'Correct synthetic result')`,
    "aal2",
  );
  rating = await db.query<{ rating: string }>(
    `select rating from club_app.elo_ratings where club_id='${c}' and season_id='${seasonId}' and user_id='${players[0]}'`,
  );
  expect(Number(rating.rows[0].rating)).toBeCloseTo(1005.33333);
  const versions = await db.query<{ value: unknown }>(
    `select jsonb_object_agg(id::text,revision) value from club_app.matches where session_id='${sid}'`,
  );
  await as(
    admin,
    `select club_app.restart_round('${c}','${sid}',1,2,'${JSON.stringify(versions.rows[0].value)}','Synthetic recovery test')`,
    "aal2",
  );
  const event = await db.query<{ id: number }>(
    `select max(id)::int id from club_app.audit_events where action='round.restarted'`,
  );
  await as(
    admin,
    `select club_app.undo_round_restart('${c}',${event.rows[0].id},3,'Restore synthetic snapshot')`,
    "aal2",
  );
  expect(
    (await db.query(`select * from club_app.matches where session_id='${sid}'`))
      .rows,
  ).toHaveLength(3);
  expect(
    (
      await db.query<{ status: string }>(
        `select status from club_app.sessions where id='${sid}'`,
      )
    ).rows[0].status,
  ).toBe("completed");
  await expect(
    as(
      admin,
      `select club_app.undo_round_restart('${c}',${event.rows[0].id},4,'Repeat forbidden restore')`,
      "aal2",
    ),
  ).rejects.toThrow();
});
