/** Synthetic data only. Operator must target the approved TEST project. No delivery consent. */
import {
  allocate,
  rotation,
  rankings,
  moveCourts,
} from "../src/domain/courts.ts";
export const fixtureId = (kind: number, n = 1) =>
  `f0260907-${String(kind).padStart(4, "0")}-4000-8000-${String(n).padStart(12, "0")}`;
export const club = fixtureId(1),
  seasonId = fixtureId(2),
  sessionId = fixtureId(3),
  venueId = fixtureId(4);
export const players = Array.from({ length: 25 }, (_, i) =>
  fixtureId(5, i + 1),
);
export const admins = [fixtureId(6, 1), fixtureId(6, 2)];
export const courts = Array.from({ length: 6 }, (_, i) => fixtureId(7, i + 1));
const q = (s: string) => `'${s.replaceAll("'", "''")}'`;
export const identity = (id: string, aal = "aal2") =>
  `select set_config('request.jwt.claim.sub',${q(id)},true);select set_config('request.jwt.claims',${q(JSON.stringify({ sub: id, aal }))},true);`;
export function matchdayFixture(owner?: string) {
  if (owner && !/^[0-9a-f-]{36}$/.test(owner)) throw new Error("Invalid owner");
  const sql = [
    `-- TEST ONLY: fictitious players, simulated signatures/payment and scored matches. No actual legal acceptance or payment.
insert into club_app.clubs(id,slug,name) values('${club}','test-matchday-rehearsal','TEST ONLY — Match-day rehearsal');
insert into club_app.seasons(id,club_id,name,regular_capacity,rules) values('${seasonId}','${club}','Synthetic 25-player rehearsal',25,'{"operationsEnabled":true,"requireIntake":true,"normalTarget":21,"fiveTarget":15}');
insert into club_app.venues(id,club_id,name,address,rooms) values('${venueId}','${club}','Synthetic gym','TEST ONLY','Six courts');
insert into club_app.sessions(id,club_id,season_id,venue_id,starts_at,ends_at,rsvp_deadline,capacity) values('${sessionId}','${club}','${seasonId}','${venueId}','2026-09-01T00:15:00Z','2026-09-01T02:15:00Z','2026-08-29T00:15:00Z',25);`,
  ];
  courts.forEach((id, i) =>
    sql.push(
      `insert into club_app.courts(id,club_id,venue_id,number) values('${id}','${club}','${venueId}',${i + 1});`,
    ),
  );
  [...admins, ...players].forEach((id, i) =>
    sql.push(`insert into auth.users(id,email,email_confirmed_at) values('${id}','rehearsal-${i}@example.invalid',now());
 insert into club_app.members(id,display_name,email) values('${id}','TEST ${i < 2 ? "Operator " + (i + 1) : "Player " + String(i - 1).padStart(2, "0")}','rehearsal-${i}@example.invalid');
 insert into club_app.memberships(club_id,user_id,role,status) values('${club}','${id}','${i < 2 ? "club_admin" : i < 8 ? "scorekeeper" : "member"}','active');`),
  );
  if (owner)
    sql.push(
      `insert into club_app.memberships(club_id,user_id,role,status) select '${club}',id,'club_owner','active' from club_app.members where id='${owner}';`,
    );
  sql.push(
    identity(admins[0]),
    `select club_app.publish_agreement('${club}','${seasonId}',repeat('TEST ONLY. Fictitious rehearsal agreement. Not a real waiver or legal review. ',4),'Synthetic fixture only',0);`,
  );
  players.forEach((id, i) => {
    sql.push(
      `insert into club_app.registrations(club_id,season_id,user_id,status) values('${club}','${seasonId}','${id}','pending');
 insert into club_app.member_intake(club_id,season_id,user_id,legal_name,kind,emergency_contact,payment_status,claimed_amount_cents) values('${club}','${seasonId}','${id}','TEST Player ${String(i + 1).padStart(2, "0")}','regular','Synthetic emergency contact','verified',40000);`,
      identity(id, "aal1"),
      `select club_app.save_eligibility('${club}','${seasonId}','1990-01-01',null,0,true);
 select club_app.sign_agreement('${club}','${seasonId}','${id}',id,sha256,'TEST Player ${i + 1}',null,true,true) from club_app.waiver_versions where club_id='${club}';`,
      identity(admins[i % 2]),
      `select club_app.approve_member('${club}','${seasonId}','${id}');`,
    );
  });
  sql.push(
    identity(admins[0]),
    `select club_app.set_seeding('${club}','${seasonId}',array[${players.map(q).join(",")}]::uuid[],0,'Synthetic organizer initial order');`,
  );
  let plan = allocate(players, 6);
  for (let round = 1; round <= 4; round++) {
    sql.push(
      identity(admins[0]),
      `select club_app.assign_reviewed_courts('${club}','${sessionId}',${round},${q(JSON.stringify(plan.map((p, i) => ({ court_id: courts[i], players: p }))))}::jsonb,${round - 1},'Synthetic reviewed round ${round}',array[]::uuid[]);`,
    );
    const ordered = plan.map((p, i) => {
      const results = rotation(p).map((game, g) => {
        const loss = (g * 3 + i + round) % game.target;
        const a = (g + i + round) % 2 ? game.target : loss,
          b = a === game.target ? loss : game.target;
        sql.push(
          identity(players[i]),
          `select club_app.submit_score('${club}',id,${a},${b},0) from club_app.matches where session_id='${sessionId}' and court_id='${courts[i]}' and round=${round} and game=${g + 1};`,
        );
        return { game, a, b };
      });
      return rankings(p, results).map((r) => r.id);
    });
    if (round < 4) plan = moveCourts(plan, ordered);
  }
  sql.push(
    identity(admins[0]),
    `select club_app.complete_session('${club}','${sessionId}',4);`,
  );
  return sql.join("\n");
}
