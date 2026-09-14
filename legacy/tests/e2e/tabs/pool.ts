// The Spare Pool on Admin → Players and Admin → Attendance (p61, p62, p66). Before a session a spare who answered
// "coming" for the next session shows their status instead of Call In: a seat on Court N (from the independent
// starting-courts reference) or standby. During a session nobody is called in (p68: players are set before the
// session starts): a player seated tonight shows "✓ Playing · Court N" (p66), anyone else "Not playing tonight".
import type { Ctx } from "./harness";
import type { League } from "./gen";
import { upcoming, courtOf } from "./oracle";
import { fromDb } from "./checks";

export const COURT_LOCK = "Both rounds are finished. End the session to save the final courts, then change courts.";

/** A pool row: its Call In button, or a status tag (coming to the next session, or playing tonight). */
export const POOL_ROW = "div:has(> button[onclick^='callInSpare']), div:has(> span.tag[title*=' is coming to the next session']), div:has(> span.tag[title*=' is playing tonight']), div:has(> span.tag[title*=' is not playing tonight'])";

/** What the pool shows: "✓ Playing · Court N", "Not playing tonight", "✓ Coming · Court N", "Coming · standby" or "📲 Call In". */
export function poolAction(ctx: Ctx, L: League, id: number): string {
  if (L.current) { const c = courtOf(L.current.assignments, id); return c ? `✓ Playing · Court ${c}` : "Not playing tonight"; }
  const p = L.players.find((x) => x.id === id)!;
  const votes = L.rsvps.filter((v) => v.session_number === L.upcoming && v.player_id === id).sort((a, b) => a.updated_at.localeCompare(b.updated_at));
  if (p.membership_type !== "spare" || votes.at(-1)?.response !== "coming") return "📲 Call In";
  const c = courtOf(upcoming(fromDb(ctx, L)).assign, id);
  return c ? `✓ Coming · Court ${c}` : "Coming · standby";
}

/** The court Call In, Seat and the Players tag aim a player without a seat tonight at (p66): their earned court when it
 *  is in use tonight (or above the bottom court in use), otherwise the bottom court in use tonight. */
export function callInCourt(assignments: Record<string, number[]>, earned: number): number {
  const used = [1, 2, 3, 4, 5, 6].filter((c) => (assignments[c] || []).length);
  if (!used.length) return earned || 6;
  const bottom = Math.max(...used);
  return earned && (used.includes(earned) || earned < bottom) ? earned : bottom;
}

/** The action shown in each pool row, in order (the Call In button's text or the status tag). */
export const rowActions = (rows: Element[]) => rows.map((x) => ([...x.children].find((c) => c.matches("button[onclick^='callInSpare'], span.tag"))?.textContent || "").replace(/\s+/g, " ").trim());
