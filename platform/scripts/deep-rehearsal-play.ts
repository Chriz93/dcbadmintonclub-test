/** Generates SQL for the existing isolated September 8 TEST fixture. No database connection. */
import { writeFileSync } from "node:fs";
import {
  allocate,
  rotation,
  rankings,
  moveCourts,
} from "../src/domain/courts.ts";
const id = (kind: number, n = 1) =>
  `f0260908-${String(kind).padStart(4, "0")}-4000-8000-${String(n).padStart(12, "0")}`;
const c = id(1),
  s = id(3),
  se = id(2),
  op = id(6),
  players = Array.from({ length: 25 }, (_, i) => id(5, i + 1));
const quote = (s: string) => `'${s.replaceAll("'", "''")}'`;
const identity = (u: string) =>
  `select set_config('request.jwt.claim.sub','${u}',true);select set_config('request.jwt.claims','{"sub":"${u}","aal":"aal2"}',true);`;
const sql = [
  `-- Only the previously created f0260908 TEST rehearsal. Aborts on any existing games.\nbegin;set local role authenticated;${identity(op)}\ndo $$begin if not exists(select 1 from club_app.sessions where id='${s}' and club_id='${c}' and revision=0 and status='scheduled') or exists(select 1 from club_app.matches where session_id='${s}') then raise exception 'Rehearsal is not an untouched scheduled session';end if;end $$;`,
];
for (const [i, u] of players.entries())
  sql.push(
    identity(players[i % 6]),
    `select club_app.check_in('${c}','${s}','${u}','present');`,
  );
let plan = allocate(players, 6);
const report = [];
for (let round = 1; round <= 4; round++) {
  sql.push(
    identity(op),
    `select club_app.assign_reviewed_courts('${c}','${s}',${round},${quote(JSON.stringify(plan.map((p, i) => ({ court_id: id(7, i + 1), players: p }))))}::jsonb,${round - 1},'Synthetic round ${round}: reviewed ladder movement',array[]::uuid[]);`,
  );
  const ordered = plan.map((p, i) => {
    const results = rotation(p).map((game, g) => {
      const loss =
        i === 5
          ? 10
          : g === 0
            ? game.target - 1
            : (g * 3 + i + round) % game.target;
      const a = i === 5 || (g + i + round) % 2 ? game.target : loss,
        b = a === game.target ? loss : game.target;
      sql.push(
        identity(players[i]),
        `select club_app.submit_score('${c}',id,${a},${b},0) from club_app.matches where session_id='${s}' and court_id='${id(7, i + 1)}' and round=${round} and game=${g + 1};`,
      );
      return { game, a, b };
    });
    return rankings(p, results).map((r) => r.id);
  });
  report.push({
    round,
    courts: plan.map((p, i) => ({
      court: i + 1,
      players: p.map((x) => Number(x.slice(-12))),
      firstRest: p.length === 5 ? Number(p[0].slice(-12)) : null,
    })),
    rankOrder: ordered.map((p) => p.map((x) => Number(x.slice(-12)))),
  });
  if (round < 4)
    plan = moveCourts(plan, ordered).map((p) =>
      p.length === 5 ? [...p.slice(1), p[0]] : p,
    );
}
sql.push(
  identity(op),
  `select club_app.complete_session('${c}','${s}',4);\ndo $$begin if (select count(*) from club_app.matches where session_id='${s}' and score_a is not null)<>80 or (select count(*) from club_app.rankings where season_id='${se}')<>25 or (select sum(played) from club_app.rankings where season_id='${se}')<>320 or (select sum(wins) from club_app.rankings where season_id='${se}')<>160 or (select count(*) from club_app.elo_ratings where season_id='${se}')<>25 then raise exception 'Completed rehearsal totals failed';end if;end $$;commit;\nselect status,revision,(select count(*) from club_app.matches where session_id='${s}') games,(select count(*) from club_app.rankings where season_id='${se}') ranked_players,(select sum(played) from club_app.rankings where season_id='${se}') appearances,(select sum(wins) from club_app.rankings where season_id='${se}') wins,(select count(*) from club_app.elo_ratings where season_id='${se}') elo_players from club_app.sessions where id='${s}';`,
);
writeFileSync("/tmp/maplewood-deep-play.sql", sql.join("\n"));
writeFileSync(
  "../docs/deep-rehearsal-rounds.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  "Generated isolated TEST rehearsal SQL and round-by-round expected assignments.",
);
