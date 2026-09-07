import { z } from "zod";
export const sessionSchema = z.object({
  id: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(["active", "cancelled"]),
  start: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .default("20:15"),
  end: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .default("22:15"),
  venue: z.string().min(1),
  room: z.string().min(1),
  permit: z.string().min(1),
  revision: z.number().int().nonnegative().default(0),
});
export type Session = z.infer<typeof sessionSchema>;
export const venue = "Maplewood Secondary School";
const active = [
  "2026-09-15",
  "2026-09-22",
  "2026-09-29",
  "2026-10-06",
  "2026-10-13",
  "2026-10-20",
  "2026-10-27",
  "2026-11-03",
  "2026-11-10",
  "2026-11-17",
  "2026-11-24",
  "2026-12-15",
  "2027-01-05",
  "2027-01-19",
  "2027-01-26",
  "2027-02-02",
  "2027-02-09",
  "2027-02-16",
  "2027-02-23",
  "2027-03-02",
  "2027-03-09",
  "2027-03-23",
  "2027-03-30",
  "2027-04-13",
  "2027-04-20",
  "2027-05-04",
  "2027-05-11",
  "2027-05-18",
];
const cancelled = [
  "2026-12-01",
  "2026-12-08",
  "2027-01-12",
  "2027-04-06",
  "2027-04-27",
  "2027-05-25",
];
export const season: Session[] = [
  ...active.map((date) => ({ date, status: "active" })),
  ...cancelled.map((date) => ({ date, status: "cancelled" })),
]
  .map((s) =>
    sessionSchema.parse({
      ...s,
      id: `2026-07-21-0001/${s.date}/127C-127D`,
      venue,
      room: "127C & 127D",
      permit: "2026-07-21-0001",
    }),
  )
  .sort((a, b) => a.date.localeCompare(b.date));
export function zonedUTC(date: string, time: string, zone = "America/Toronto") {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time))
    throw new Error("Invalid local date/time.");
  const [y, m, d] = date.split("-").map(Number),
    [h, min] = time.split(":").map(Number);
  const naive = Date.UTC(y, m - 1, d, h, min);
  if (new Date(naive).toISOString().slice(0, 10) !== date || h > 23 || min > 59)
    throw new Error("Invalid local date/time.");
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const matches = [];
  // UTC offsets include 15-minute increments; reject nonexistent and ambiguous wall times.
  for (let offset = -14 * 60; offset <= 14 * 60; offset += 15) {
    const t = naive + offset * 60000;
    const p = Object.fromEntries(
      fmt.formatToParts(new Date(t)).map((x) => [x.type, x.value]),
    );
    if (
      `${p.year}-${p.month}-${p.day}` === date &&
      `${p.hour}:${p.minute}` === time
    )
      matches.push(t);
  }
  if (matches.length !== 1)
    throw new Error(
      "Ambiguous or nonexistent local time; correct before import.",
    );
  return new Date(matches[0]).toISOString();
}
export function validateSchedule(rows: Session[]) {
  const seen = new Map<string, Session>();
  const errors: string[] = [];
  for (const input of rows) {
    try {
      const s = sessionSchema.parse(input);
      const start = zonedUTC(s.date, s.start),
        end = zonedUTC(s.date, s.end);
      if (end <= start) throw new Error("End must follow start.");
      const key = `${s.date}/${s.room}`;
      const prev = seen.get(key);
      if (prev && JSON.stringify(prev) !== JSON.stringify(s))
        throw new Error(`Conflicting duplicate ${s.date}`);
      seen.set(key, s);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : "Invalid row");
    }
  }
  const sessions = [...seen.values()].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  return {
    sessions,
    errors,
    active: sessions.filter((s) => s.status === "active").length,
    hours: sessions
      .filter((s) => s.status === "active")
      .reduce(
        (n, s) =>
          n +
          (Date.parse(zonedUTC(s.date, s.end)) -
            Date.parse(zonedUTC(s.date, s.start))) /
            3600000,
        0,
      ),
  };
}
const escapeICS = (s: string) =>
  s
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
const stamp = (s: string) => s.replace(/[-:]/g, "").replace(/\.\d{3}Z/, "Z");
export function calendar(
  rows: Session[],
  clubId = "dc-badminton",
  generatedAt = "2026-09-06T00:00:00Z",
) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Club Court//Schedule v1//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  for (const s of rows)
    lines.push(
      "BEGIN:VEVENT",
      `UID:${encodeURIComponent(clubId)}-${encodeURIComponent(s.id)}@clubcourt`,
      `DTSTAMP:${stamp(generatedAt)}`,
      `SEQUENCE:${s.revision}`,
      `DTSTART:${stamp(zonedUTC(s.date, s.start))}`,
      `DTEND:${stamp(zonedUTC(s.date, s.end))}`,
      `SUMMARY:${escapeICS("Badminton · " + s.venue)}`,
      `LOCATION:${escapeICS(s.venue + " · " + s.room)}`,
      `STATUS:${s.status === "active" ? "CONFIRMED" : "CANCELLED"}`,
      "END:VEVENT",
    );
  lines.push("END:VCALENDAR");
  // Fold by UTF-8 octets, never in the middle of a character.
  return (
    lines
      .map((line) => {
        let out = "",
          n = 0;
        for (const ch of line) {
          const size = new TextEncoder().encode(ch).length;
          if (n + size > 74) {
            out += "\r\n ";
            n = 1;
          }
          out += ch;
          n += size;
        }
        return out;
      })
      .join("\r\n") + "\r\n"
  );
}
export function googleCalendar(s: Session) {
  return (
    "https://calendar.google.com/calendar/render?" +
    new URLSearchParams({
      action: "TEMPLATE",
      text: "Badminton · " + s.venue,
      dates: `${stamp(zonedUTC(s.date, s.start))}/${stamp(zonedUTC(s.date, s.end))}`,
      location: s.venue,
      ctz: "America/Toronto",
    })
  );
}
// Conservative normalized interchange: actual PDF extraction requires operator review.
export function parseScheduleText(
  text: string,
  permit: string,
  venueName: string,
  room: string,
) {
  return text
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((line) => {
      const m = line.match(
        /^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\s+(\d{2}:\d{2})\s+(active|cancelled)$/,
      );
      if (!m)
        throw new Error(
          "Use YYYY-MM-DD HH:MM HH:MM active|cancelled, one booking per line.",
        );
      return sessionSchema.parse({
        id: `${permit}/${m[1]}/${room}`,
        date: m[1],
        start: m[2],
        end: m[3],
        status: m[4],
        permit,
        venue: venueName,
        room,
      });
    });
}
