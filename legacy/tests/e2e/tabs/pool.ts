// The Spare Pool on Admin → Players and Admin → Attendance (p61, p62). Before a session a spare who answered "coming" for
// the next session shows their status instead of Call In: a seat on Court N (from the independent starting-courts
// reference) or standby. Everyone else has Call In, shown disabled with the reason once both rounds are finished.
import type { Ctx } from "./harness";
import type { League } from "./gen";
import { upcoming, courtOf } from "./oracle";
import { fromDb } from "./checks";

export const COURT_LOCK = "Both rounds are finished. End the session to save the final courts, then change courts.";

/** What the pool shows for a player: "✓ Coming · Court N", "Coming · standby" or "📲 Call In". */
export function poolAction(ctx: Ctx, L: League, id: number): string {
  if (L.current) return "📲 Call In";
  const p = L.players.find((x) => x.id === id)!;
  const votes = L.rsvps.filter((v) => v.session_number === L.upcoming && v.player_id === id).sort((a, b) => a.updated_at.localeCompare(b.updated_at));
  if (p.membership_type !== "spare" || votes.at(-1)?.response !== "coming") return "📲 Call In";
  const c = courtOf(upcoming(fromDb(ctx, L)).assign, id);
  return c ? `✓ Coming · Court ${c}` : "Coming · standby";
}

/** The action shown in each pool row, in order (the Call In button's text or the status tag). */
export const rowActions = (rows: Element[]) => rows.map((x) => ([...x.children].find((c) => c.matches("button[onclick^='callInSpare'], span.tag"))?.textContent || "").replace(/\s+/g, " ").trim());
