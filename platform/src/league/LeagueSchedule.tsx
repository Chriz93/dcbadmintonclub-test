import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "../services/auth";
import { dateLabel, type LeagueData } from "./data";
import { calendar, type Session } from "../domain/schedule";
const venuesSchema = z.array(
  z.object({
    id: z.string(),
    name: z.string(),
    address: z.string(),
    rooms: z.string(),
  }),
);
export function LeagueSchedule({
  data,
  club,
  onOpen,
}: {
  data: LeagueData;
  club: string;
  onOpen: (id: string) => void;
}) {
  const [metadata, setMetadata] = useState<{
      venues: z.infer<typeof venuesSchema>;
      sessions: { id: string; calendar_uid: string }[];
      slug: string;
    } | null>(null),
    [venueError, setVenueError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    setMetadata(null);
    setVenueError("");
    void Promise.all([
      supabase!
        .from("venues")
        .select("id,name,address,rooms")
        .eq("club_id", club)
        .abortSignal(controller.signal),
      supabase!
        .from("sessions")
        .select("id,calendar_uid")
        .eq("club_id", club)
        .eq("season_id", data.season.id)
        .abortSignal(controller.signal),
      supabase!
        .from("clubs")
        .select("slug")
        .eq("id", club)
        .abortSignal(controller.signal)
        .single(),
    ])
      .then(([venues, sessions, selectedClub]) => {
        if (controller.signal.aborted) return;
        try {
          if (venues.error || sessions.error || selectedClub.error)
            throw new Error();
          setMetadata({
            venues: venuesSchema.parse(venues.data),
            sessions: z
              .array(z.object({ id: z.string(), calendar_uid: z.string() }))
              .parse(sessions.data),
            slug: z.object({ slug: z.string() }).parse(selectedClub.data).slug,
          });
        } catch {
          setVenueError("Venue and calendar details could not be loaded.");
        }
      })
      .finally(() => clearTimeout(timeout));
    const onAbort = () =>
      setVenueError("Venue and calendar lookup timed out. Please retry.");
    controller.signal.addEventListener("abort", onAbort);
    return () => {
      clearTimeout(timeout);
      controller.signal.removeEventListener("abort", onAbort);
      controller.abort();
    };
  }, [club, data.season.id, retry]);
  const venues = metadata?.venues ?? [];
  const calendarReady =
    !!metadata &&
    data.sessions.length > 0 &&
    data.sessions.every(
      (s) =>
        metadata.sessions.some((row) => row.id === s.id) &&
        venues.some((v) => v.id === s.venue_id),
    );
  const time = (iso: string) =>
    new Date(iso).toLocaleTimeString("en-CA", {
      timeZone: "America/Toronto",
      hour: "numeric",
      minute: "2-digit",
    });
  const download = () => {
    if (!calendarReady || !metadata) return;
    const local = (iso: string) => {
      const p = Object.fromEntries(
        new Intl.DateTimeFormat("en-CA", {
          timeZone: "America/Toronto",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        })
          .formatToParts(new Date(iso))
          .map((p) => [p.type, p.value]),
      );
      return {
        date: `${p.year}-${p.month}-${p.day}`,
        time: `${p.hour}:${p.minute}`,
      };
    };
    const rows: Session[] = data.sessions.map((s) => {
      const venue = venues.find((v) => v.id === s.venue_id)!;
      return {
        id: metadata.sessions.find((row) => row.id === s.id)!.calendar_uid,
        date: local(s.starts_at).date,
        start: local(s.starts_at).time,
        end: local(s.ends_at).time,
        venue: venue.name,
        room: venue.rooms,
        permit: "",
        status: s.status === "cancelled" ? "cancelled" : "active",
        revision: s.revision,
      };
    });
    const content = calendar(rows, metadata.slug, new Date().toISOString());
    const url = URL.createObjectURL(
      new Blob([content], { type: "text/calendar;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "maplewood-season.ics";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <section className="lp-schedule">
      <h1>Season schedule</h1>
      <p>{data.season.name} · Times in Ottawa (America/Toronto).</p>
      <button className="button" disabled={!calendarReady} onClick={download}>
        Download season calendar
      </button>
      <p className="lp-muted">
        Calendar downloads are a snapshot. Check this page for later changes.
      </p>
      {venueError && (
        <p role="status">
          {venueError}{" "}
          <button className="button" onClick={() => setRetry((n) => n + 1)}>
            Retry calendar details
          </button>
        </p>
      )}
      {!data.sessions.length && (
        <p>No sessions published for this season yet.</p>
      )}
      {data.sessions.map((s) => (
        <article className="lp-card" key={s.id}>
          <h2>{dateLabel(s.starts_at)}</h2>
          <p>
            {time(s.starts_at)}–{time(s.ends_at)} ·{" "}
            <strong>
              {s.status === "cancelled"
                ? "Cancelled · No play"
                : s.status === "completed"
                  ? "Completed"
                  : s.status === "active"
                    ? "In progress"
                    : "Scheduled"}
            </strong>
          </p>
          <p>
            {venues.find((v) => v.id === s.venue_id)?.name ??
              (venueError
                ? "Venue details unavailable"
                : metadata
                  ? "Venue not published"
                  : "Venue details loading…")}
          </p>
          {s.status === "cancelled" ? (
            <p>
              Facility cancellation: regular players receive two physical
              shuttlecocks; confirmed paid spares receive a $20 refund.
            </p>
          ) : (
            <button className="button" onClick={() => onOpen(s.id)}>
              View courts for {dateLabel(s.starts_at)}
            </button>
          )}
        </article>
      ))}
    </section>
  );
}
