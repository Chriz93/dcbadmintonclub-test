import { z } from "zod";
const booking = z
  .object({
    calendar_uid: z.string().uuid(),
    club_name: z.string(),
    venue_name: z.string(),
    starts_at: z.string().datetime({ offset: true }),
    ends_at: z.string().datetime({ offset: true }),
    status: z.enum(["scheduled", "active", "completed", "cancelled"]),
    revision: z.number().int().nonnegative(),
  })
  .refine((s) => Date.parse(s.ends_at) > Date.parse(s.starts_at));
export type PublicBooking = z.infer<typeof booking>;
function escape(text: string) {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}
function stamp(value: string) {
  return new Date(value)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}
function fold(line: string) {
  let result = "",
    size = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (size + n > 74) {
      result += "\r\n ";
      size = 1;
    }
    result += ch;
    size += n;
  }
  return result;
}
export async function calendarResponse(
  request: Request,
  load: (slug: string) => Promise<unknown>,
) {
  const path = new URL(request.url).pathname.match(
    /^\/calendar\/([a-z0-9][a-z0-9-]{0,79})\.ics$/,
  );
  if (!path) return new Response("Not found", { status: 404 });
  if (!["GET", "HEAD"].includes(request.method))
    return new Response("Method not allowed", {
      status: 405,
      headers: { Allow: "GET, HEAD" },
    });
  try {
    const rows = z
      .array(booking)
      .max(1000)
      .parse(await load(path[1]));
    const hash = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(JSON.stringify(rows)),
    );
    const etag =
      'W/"' +
      Array.from(new Uint8Array(hash))
        .map((x) => x.toString(16).padStart(2, "0"))
        .join("") +
      '"';
    const headers = {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "public, max-age=60",
      "Access-Control-Allow-Origin": "*",
      "X-Content-Type-Options": "nosniff",
      ETag: etag,
    };
    if (request.headers.get("If-None-Match") === etag)
      return new Response(null, { status: 304, headers });
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Club Court//Live calendar v1//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
    ];
    const now = new Date().toISOString();
    for (const s of rows)
      lines.push(
        "BEGIN:VEVENT",
        `UID:${encodeURIComponent(path[1])}-${s.calendar_uid}@clubcourt`,
        `DTSTAMP:${stamp(now)}`,
        `SEQUENCE:${s.revision}`,
        `DTSTART:${stamp(s.starts_at)}`,
        `DTEND:${stamp(s.ends_at)}`,
        `SUMMARY:${escape(s.club_name)}`,
        `LOCATION:${escape(s.venue_name)}`,
        `STATUS:${s.status === "cancelled" ? "CANCELLED" : "CONFIRMED"}`,
        "END:VEVENT",
      );
    lines.push("END:VCALENDAR");
    return new Response(
      request.method === "HEAD" ? null : lines.map(fold).join("\r\n") + "\r\n",
      { headers },
    );
  } catch {
    return new Response("Calendar temporarily unavailable. Please retry.", {
      status: 503,
      headers: { "Cache-Control": "no-store", "Retry-After": "60" },
    });
  }
}
