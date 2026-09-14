// p71: before a session the organizer seats spares (the organizer, 14 September: "if I assign the court for the spare
// player under admin, it should be reflected under main courts"). A spare with a court and marked present before the
// night starts on that court, whatever their answer or payment; without the mark (or marked absent) they are not seated.
import { test } from "node:test";
import assert from "node:assert/strict";
import { load } from "./load-app.mjs";

const START = Date.parse("2026-09-15T20:00:00-04:00"), NOW = Date.parse("2026-09-14T18:00:00-04:00");
const FIXED_DATE = class extends Date { static now() { return NOW; } };
const { api } = load(["activePlayers", "isRegularMember", "isSpareMember", "spareSeats", "paidForSession", "autoAssign", "upcomingLineup", "organizerSeated", "seatingProblem"], { _lineupNotes: [], _lineupProblem: "", S_me:{organizer:true},FEES:{spareSession:20,voteDeadlineHours:46},FD:[new Date(START)],Date:FIXED_DATE,upcomingSessionNumber:()=>1 });
function run(players, pre = {}, votes = {}) {
  api.setS({ players: players.map((p) => ({ id: p.id, name: `P${p.id}`, currentCourt: p.court, membershipType: p.spare ? "spare" : "regular", approved: true, waitlisted: false })),
    rsvp: { ...votes }, rsvpRows: Object.entries(votes).map(([id, response], i) => ({ player_id: +id, response, updated_at: `2026-09-10T12:0${i}:00Z` })),
    preAttendance: pre, current: null, payments: [] });
  return api.upcomingLineup();
}
const courtOf = (a, id) => +Object.keys(a).find((c) => (a[c] || []).includes(id) ) || 0;

test("p71 · a spare the organizer assigned to Court 2 starts there: unpaid, no answer (the production case)", () => {
  const up = run([{ id: 107, court: 1 }, { id: 108, court: 2, spare: true }], { 108: "present" });
  assert.equal(courtOf(up.assign, 107) > 0, true);
  assert.equal(courtOf(up.assign, 108) > 0, true, "the organizer's spare is seated");
  assert.equal(up.problem, "", "two players: the night is not refused");
  assert.ok(up.notes.some((n) => n.includes("seated by the organizer")));
});
test("p71 · without the organizer's seat a spare's old court does not seat them", () => {
  const up = run([{ id: 1, court: 1 }, { id: 2, court: 1 }, { id: 9, court: 2, spare: true }]);
  assert.equal(courtOf(up.assign, 9), 0);
});
test("p71 · a seated spare marked absent is not seated; a spare with court 0 is not seated", () => {
  assert.equal(courtOf(run([{ id: 1, court: 1 }, { id: 2, court: 1 }, { id: 9, court: 2, spare: true }], { 9: "absent" }).assign, 9), 0);
  assert.equal(courtOf(run([{ id: 1, court: 1 }, { id: 2, court: 1 }, { id: 9, court: 0, spare: true }], { 9: "present" }).assign, 9), 0);
});
test("p71 · seated spares keep their court when it has room; regulars keep theirs", () => {
  const regs = [1, 2, 3, 4].map((id) => ({ id, court: 1 })).concat([5, 6, 7].map((id) => ({ id, court: 2 })));
  const up = run([...regs, { id: 20, court: 2, spare: true }], { 20: "present" });
  assert.deepEqual([courtOf(up.assign, 20), courtOf(up.assign, 1), courtOf(up.assign, 5)], [2, 1, 2]);
});
test("p71 · organizerSeated is empty during a session", () => {
  api.setS({ players: [{ id: 9, currentCourt: 2, membershipType: "spare", approved: true, waitlisted: false }], current: { number: 1 }, preAttendance: { 9: "present" } });
  assert.deepEqual(api.organizerSeated({ 9: "present" }), []);
});
