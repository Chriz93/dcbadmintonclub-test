import { parseScheduleText } from "./schedule";
export function proposeBookings(text: string) {
  const permit = text.match(/\b20\d{2}-\d{2}-\d{2}-\d{4}\b/)?.[0] ?? "";
  const proposals: string[] = [];
  const unresolved: string[] = [];
  // Only unambiguous machine-readable rows are auto-proposed. No inferred cancellations.
  for (const line of text.split(/\r?\n/)) {
    const date = line.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1];
    if (!date || (line.includes(permit) && permit)) continue;
    const times = [...line.matchAll(/\b([01]\d|2[0-3]):([0-5]\d)\b/g)].map(
      (m) => m[0],
    );
    const state = /\bcancelled\b/i.test(line)
      ? "cancelled"
      : /\b(approved|active|confirmed)\b/i.test(line)
        ? "active"
        : null;
    if (times.length === 2 && state)
      proposals.push(`${date} ${times[0]} ${times[1]} ${state}`);
    else unresolved.push(line.trim());
  }
  return {
    permit,
    proposals: [...new Set(proposals)],
    unresolved,
    requiresManualReview: true,
  };
}
export function validatePermitRows(
  text: string,
  permit: string,
  venue: string,
  rooms: string,
) {
  return parseScheduleText(text, permit, venue, rooms);
}
