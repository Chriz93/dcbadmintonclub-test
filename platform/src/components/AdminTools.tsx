import { useState } from "react";
import { supabase } from "../services/auth";
import { Card } from "./ui";
import { z } from "zod";
const session = z.object({
  id: z.string(),
  starts_at: z.string(),
  status: z.string(),
  revision: z.number(),
});
const registration = z.object({
  user_id: z.string(),
  season_id: z.string(),
  status: z.string(),
});
const audit = z.object({ action: z.string(), created_at: z.string() });
const delivery = z.object({
  status: z.string(),
  template: z.string(),
  attempts: z.number(),
});
export function AdminTools() {
  const [club, setClub] = useState(""),
    [clubs, setClubs] = useState<{ id: string; name: string }[]>([]),
    [sessions, setSessions] = useState<z.infer<typeof session>[]>([]),
    [pending, setPending] = useState<z.infer<typeof registration>[]>([]),
    [events, setEvents] = useState<z.infer<typeof audit>[]>([]),
    [deliveries, setDeliveries] = useState<z.infer<typeof delivery>[]>([]),
    [message, setMessage] = useState(""),
    [factor, setFactor] = useState(""),
    [qr, setQR] = useState(""),
    [code, setCode] = useState(""),
    [isAdmin, setIsAdmin] = useState(false),
    [busy, setBusy] = useState(false);
  async function verify() {
    if (!supabase) return;
    try {
      setBusy(true);
      if (!factor) {
        const { data, error } = await supabase.auth.mfa.listFactors();
        if (error) throw error;
        const existing = data.totp.find((f) => f.status === "verified");
        if (existing) {
          setFactor(existing.id);
          setMessage("Enter the code from your authenticator.");
        } else {
          const { data, error } = await supabase.auth.mfa.enroll({
            factorType: "totp",
            friendlyName: "Club administrator",
          });
          if (error) throw error;
          setFactor(data.id);
          setQR(data.totp.qr_code);
          setMessage("Scan with your authenticator and verify the code.");
        }
        return;
      }
      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId: factor,
        code,
      });
      if (error) throw error;
      setQR("");
      const { data, error: loadError } = await supabase
        .from("clubs")
        .select("id,name");
      if (loadError) throw loadError;
      const rows = z
        .array(z.object({ id: z.string(), name: z.string() }))
        .parse(data);
      setClubs(rows);
      setClub(rows[0]?.id ?? "");
      setIsAdmin(true);
      setMessage(
        "Second factor verified. Database permissions still apply to every action.",
      );
    } catch {
      setMessage(
        "Verification failed. Sign in through Member hub first, then retry.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function load() {
    if (!supabase || !club) return;
    setBusy(true);
    try {
      const results = await Promise.all([
        supabase
          .from("sessions")
          .select("id,starts_at,status,revision")
          .eq("club_id", club)
          .order("starts_at"),
        supabase
          .from("registrations")
          .select("user_id,season_id,status")
          .eq("club_id", club)
          .eq("status", "pending"),
        supabase
          .from("audit_events")
          .select("action,created_at")
          .eq("club_id", club)
          .order("created_at", { ascending: false })
          .limit(30),
        supabase
          .from("notification_deliveries")
          .select("status,template,attempts")
          .eq("club_id", club)
          .order("created_at", { ascending: false })
          .limit(30),
      ]);
      if (results.some((r) => r.error)) throw new Error();
      setSessions(z.array(session).parse(results[0].data));
      setPending(z.array(registration).parse(results[1].data));
      setEvents(z.array(audit).parse(results[2].data));
      setDeliveries(z.array(delivery).parse(results[3].data));
      setMessage("Club records refreshed.");
    } catch {
      setMessage(
        "Unable to load administrator records. Check your club role and verification.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <h2>Verified administrator access</h2>
      <p>
        Sign in through Member hub, then verify your authenticator to manage
        club records.
      </p>
      {qr && (
        <img
          className="mfa-qr"
          src={
            qr.startsWith("data:image/")
              ? qr
              : `data:image/svg+xml,${encodeURIComponent(qr)}`
          }
          alt="Authenticator setup QR code"
        />
      )}
      {factor && (
        <label>
          Authenticator code
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
          />
        </label>
      )}
      <button
        className="button"
        disabled={!supabase || busy || !navigator.onLine}
        onClick={() => void verify()}
      >
        {factor ? "Verify second factor" : "Set up or verify authenticator"}
      </button>
      {isAdmin && (
        <>
          <label>
            Club
            <select value={club} onChange={(e) => setClub(e.target.value)}>
              {clubs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <button
            className="button"
            onClick={() => void load()}
            disabled={busy}
          >
            Load club records
          </button>
          <h3>Pending registrations</h3>
          {pending.length === 0 ? (
            <p>No pending registrations loaded.</p>
          ) : (
            pending.map((p) => (
              <div key={`${p.season_id}/${p.user_id}`} className="admin-record">
                <span>Member {p.user_id}</span>
                <button
                  className="button"
                  disabled={busy}
                  onClick={async () => {
                    if (!supabase) return;
                    setBusy(true);
                    const { error } = await supabase.rpc("approve_member", {
                      c: club,
                      s: p.season_id,
                      u: p.user_id,
                    });
                    setMessage(
                      error
                        ? "Review failed; verify waiver and capacity."
                        : "Membership reviewed. Refresh to see the result.",
                    );
                    setBusy(false);
                  }}
                >
                  Approve / waitlist by capacity
                </button>
              </div>
            ))
          )}
          <h3>Session management</h3>
          {sessions.map((s) => (
            <div className="admin-record" key={s.id}>
              <span>
                {new Date(s.starts_at).toLocaleString()} · {s.status}
              </span>
              <button
                className="button"
                disabled={
                  busy || s.status === "cancelled" || s.status === "completed"
                }
                onClick={async () => {
                  if (
                    !supabase ||
                    !window.confirm(
                      "Cancel this session and queue notices for opted-in members?",
                    )
                  )
                    return;
                  setBusy(true);
                  const { error } = await supabase.rpc("cancel_session", {
                    c: club,
                    s: s.id,
                    expected_revision: s.revision,
                  });
                  setMessage(
                    error
                      ? "Cancellation not confirmed. Refresh before retrying."
                      : "Session cancelled. Refresh to see the result.",
                  );
                  setBusy(false);
                }}
              >
                Cancel session
              </button>
            </div>
          ))}
          <h3>Recent notification deliveries</h3>
          {deliveries.length ? (
            deliveries.map((d, i) => (
              <p key={i}>
                {d.template} · {d.status} · {d.attempts} attempts
              </p>
            ))
          ) : (
            <p>No delivery records loaded.</p>
          )}
          <h3>Recent audit events</h3>
          {events.length ? (
            events.map((e, i) => (
              <p key={i}>
                {e.action} · {new Date(e.created_at).toLocaleString()}
              </p>
            ))
          ) : (
            <p>No audit events loaded.</p>
          )}
        </>
      )}
      <p role="status">{message}</p>
    </Card>
  );
}
