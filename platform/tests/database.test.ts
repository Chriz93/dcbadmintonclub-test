import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
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
  await db.exec(
    readFileSync(
      new URL("../migrations/001_platform.sql", import.meta.url),
      "utf8",
    ),
  );
  await db.exec(readFileSync(new URL("../migrations/002_operations.sql", import.meta.url), "utf8"));
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

describe.sequential('operations, queue and rate limits',()=>{
 it('public schedule contains no member fields',async()=>{await db.exec('set role anon');try{const rows=await db.query("select * from club_app.public_schedule('a')");expect(Object.keys(rows.rows[0])).not.toContain('email');expect(rows.rows).toHaveLength(1);}finally{await db.exec('reset role');}});
 it('member cannot cancel or claim delivery jobs',async()=>{await expect(as(u,`select club_app.cancel_session('${c}','${s}',0)`)).rejects.toThrow();await expect(as(u,'select * from club_app.claim_deliveries(10)')).rejects.toThrow();});
 it('score validation and competing stale submissions',async()=>{
  const court='80000000-0000-0000-0000-000000000001',match='90000000-0000-0000-0000-000000000001';
  await db.exec(`insert into club_app.courts(id,club_id,venue_id,number) values('${court}','${c}','${venueId}',1);update club_app.sessions set status='active' where id='${s}';insert into club_app.matches(id,club_id,session_id,court_id,round,game,target,side_a,side_b) values('${match}','${c}','${s}','${court}',1,1,15,array['${u}']::uuid[],array['${v}']::uuid[]);`);
  await expect(as(u,`select club_app.submit_score('${c}','${match}',15,12,0)`)).rejects.toThrow('Forbidden');
  await expect(as(admin,`select club_app.submit_score('${c}','${match}',14,12,0)`,'aal2')).rejects.toThrow('Invalid completed score');
  await as(admin,`select club_app.submit_score('${c}','${match}',15,12,0)`,'aal2');
  await expect(as(admin,`select club_app.submit_score('${c}','${match}',15,10,0)`,'aal2')).rejects.toThrow('Revision conflict');
 });
 it('cancellation requires MFA, audits and queues consented notices',async()=>{await as(admin,`select club_app.cancel_session('${c}','${s}',0)`,'aal2');expect((await db.query<{status:string}>(`select status from club_app.sessions where id='${s}'`)).rows[0].status).toBe('cancelled');await expect(as(u,request(u,'attending',2,50))).rejects.toThrow('RSVP closed');});
 it('queue leases do not claim same jobs twice; failure retries',async()=>{await db.exec('set role service_role');try{const jobs=await db.query<{id:string;attempts:number}>('select * from club_app.claim_deliveries(10)');expect(jobs.rows.length).toBeGreaterThan(0);expect((await db.query('select * from club_app.claim_deliveries(10)')).rows).toHaveLength(0);const job=jobs.rows[0];await db.query('select club_app.finish_delivery($1,$2,$3,$4)',[job.id,job.attempts,'pending',null]);await expect(db.query('select club_app.finish_delivery($1,$2,$3,$4)',[job.id,job.attempts,'delivered','x'])).rejects.toThrow('Stale delivery lease');}finally{await db.exec('reset role');}});
 it('unsubscribe suppresses future notification enqueue',async()=>{await as(u,`select club_app.set_preference('${c}',false)`);expect((await db.query<{enabled:boolean}>(`select enabled from club_app.notification_preferences where user_id='${u}'`)).rows[0].enabled).toBe(false);});
 it('rate limits successful mutation attempts',async()=>{await db.exec(`delete from club_app.rate_limits where user_id='${u}'`);for(let i=0;i<30;i++)await as(u,`select club_app.set_preference('${c}',false)`);await expect(as(u,`select club_app.set_preference('${c}',false)`)).rejects.toThrow('Rate limit');});
});
