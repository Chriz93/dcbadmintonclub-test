import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "../services/auth";
const row = z.object({
  session_id: z.string(),
  starts_at: z.string(),
  ends_at: z.string(),
  status: z.string(),
  rsvp_deadline: z.string(),
  refund_cutoff: z.string(),
  response: z.string(),
  placement: z.string(),
  rsvp_revision: z.number(),
  kind: z.string(),
  spare_status: z.string().nullable(),
  courts: z.array(z.object({ round: z.number(), court: z.number() })),
});
const toronto = (iso: string, withZone = false) =>
  new Date(iso).toLocaleString("en-CA", {
    timeZone: "America/Toronto",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    ...(withZone ? { timeZoneName: "short" as const } : {}),
  });
const responseText: Record<string, string> = {
  attending: "Attending",
  late: "Attending (late)",
  not_attending: "Not attending",
  maybe: "Maybe — please decide",
  need_spare: "Need a spare",
  no_response: "No response yet",
};
/** One glance: next club night, your answer, your court. Reads only the signed-in member's records. */
export function NextSession({
  club,
  refreshKey,
}: {
  club: string;
  refreshKey: number;
}) {
  const [rows, setRows] = useState<z.infer<typeof row>[]>([]),
    [message, setMessage] = useState("");
  useEffect(() => {
    if (!supabase || !club) return;
    let alive = true;
    void supabase.rpc("my_upcoming", { c: club }).then(({ data, error }) => {
      if (!alive) return;
      if (error) {
        setMessage("Your next session could not be loaded.");
        return;
      }
      setRows(z.array(row).parse(data));
      setMessage("");
    });
    return () => {
      alive = false;
    };
  }, [club, refreshKey]);
  const next = rows[0];
  if (!next)
    return (
      <section className="next-session-panel" aria-label="Your next session">
        <p>{message || "No upcoming session yet."}</p>
      </section>
    );
  const now = Date.now();
  const inPlay = next.status === "active";
  const refundOpen = now <= Date.parse(next.refund_cutoff);
  const court = next.courts.at(-1);
  return (
    <section className="next-session-panel" aria-label="Your next session">
      <p className="eyebrow">
        {inPlay ? "TONIGHT · IN PLAY" : "YOUR NEXT CLUB NIGHT"}
      </p>
      <h3>{toronto(next.starts_at, true)}</h3>
      <p>
        {next.kind === "spare" ? (
          <>
            Spare booking: <strong>{next.spare_status ?? "no vote yet"}</strong>
          </>
        ) : (
          <>
            Your answer:{" "}
            <strong>{responseText[next.response] ?? next.response}</strong>
            {next.placement === "waitlisted" ? " · waitlisted" : ""}
          </>
        )}
      </p>
      {court ? (
        <p>
          Your court: <strong>Court {court.court}</strong>
          {next.courts.length > 1 ? ` (round ${court.round})` : ""}
          {next.courts.length > 1
            ? ` · earlier: ${next.courts
                .slice(0, -1)
                .map((c) => `R${c.round} C${c.court}`)
                .join(", ")}`
            : ""}
        </p>
      ) : (
        <p>Courts are posted by the organizer at the session.</p>
      )}
      {!inPlay && next.kind !== "spare" && (
        <p className="quiet">
          {refundOpen
            ? `$14 absence refund if you decline by ${toronto(next.refund_cutoff)}.`
            : `The 72-hour refund window closed ${toronto(next.refund_cutoff)}; you can still update your answer until ${toronto(next.rsvp_deadline)}.`}
        </p>
      )}
      {rows.length > 1 && (
        <p className="quiet">
          After that:{" "}
          {rows
            .slice(1)
            .map((r) => toronto(r.starts_at))
            .join(" · ")}
        </p>
      )}
    </section>
  );
}
