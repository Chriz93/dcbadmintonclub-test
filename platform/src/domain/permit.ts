import { parseScheduleText } from "./schedule";
export function proposeBookings(text: string) {
  const permit = text.match(/\b20\d{2}-\d{2}-\d{2}-\d{4}\b/)?.[0] ?? "";
  const proposals: string[] = [];
  const unresolved: string[] = [];
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  // Explicit row status is required, including for struck-through cancellations.
  for (const line of text.split(/\r?\n/)) {
    const printed = line.match(
      /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),\s*(20\d{2})\b/,
    );
    const date =
      line.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1] ??
      (printed
        ? `${printed[3]}-${String(months.indexOf(printed[1]) + 1).padStart(2, "0")}-${printed[2].padStart(2, "0")}`
        : undefined);
    if (!date || (line.includes(permit) && permit)) continue;
    const clock12 = [
      ...line.matchAll(/\b(1[0-2]|0?[1-9]):([0-5]\d)\s*(am|pm)\b/gi),
    ];
    const times = clock12.length
      ? clock12.map(
          (m) =>
            `${String((Number(m[1]) % 12) + (m[3].toLowerCase() === "pm" ? 12 : 0)).padStart(2, "0")}:${m[2]}`,
        )
      : [...line.matchAll(/\b([01]\d|2[0-3]):([0-5]\d)\b/g)].map((m) => m[0]);
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
