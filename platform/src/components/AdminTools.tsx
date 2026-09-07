import { LegacyAdministration } from "./LegacyAdministration";
import { PrivacyReview } from "./PrivacyReview";
import { ClubSetup } from "./ClubSetup";
import { LeagueOperations } from "./LeagueOperations";
import { useEffect, useState } from "react";
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
const intakeSchema = z.object({
  user_id: z.string(),
  season_id: z.string(),
  legal_name: z.string(),
  kind: z.string(),
  payment_reference: z.string(),
  claimed_amount_cents: z.number(),
  payment_status: z.string(),
  revision: z.number(),
});
const audit = z.object({ action: z.string(), created_at: z.string() });
const delivery = z.object({
  status: z.string(),
  template: z.string(),
  attempts: z.number(),
});
export function AdminTools() {
  const [intakes, setIntakes] = useState<z.infer<typeof intakeSchema>[]>([]);
  const [paymentReason, setPaymentReason] = useState("");
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
  useEffect(() => {
    let alive = true;
    void (async () => {
      if (!supabase) return;
      const assurance =
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (assurance.error || assurance.data.currentLevel !== "aal2") return;
      const result = await supabase.from("clubs").select("id,name");
      if (result.error) return;
      const candidates = z
        .array(z.object({ id: z.string(), name: z.string() }))
        .parse(result.data);
      const allowed = await Promise.all(
        candidates.map(async (c) => ({
          club: c,
          access: await supabase!.rpc("is_admin", { c: c.id }),
        })),
      );
      const rows = allowed
        .filter((r) => !r.access.error && r.access.data === true)
        .map((r) => r.club);
      if (alive && rows.length) {
        setClubs(rows);
        setClub(rows[0].id);
        setIsAdmin(true);
        setMessage("Your existing verified administrator session is ready.");
      }
    })().catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
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
        supabase
          .from("member_intake")
          .select(
            "user_id,season_id,legal_name,kind,payment_reference,claimed_amount_cents,payment_status,revision",
          )
          .eq("club_id", club),
      ]);
      if (results.some((r) => r.error)) throw new Error();
      setIntakes(z.array(intakeSchema).parse(results[4].data));
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
          <LeagueOperations club={club} />
          <ClubSetup club={club} />
          <PrivacyReview club={club} />
          <LegacyAdministration key={club} club={club} />
          <h3>Payment review</h3>
          <p>
            Check your bank record before verifying. A payment claim does not
            prove receipt or approve membership.
          </p>
          <label>
            Verification note
            <input
              value={paymentReason}
              minLength={5}
              maxLength={500}
              disabled={busy}
              onChange={(e) => setPaymentReason(e.target.value)}
            />
          </label>
          {intakes.map((i) => (
            <div className="admin-record" key={`${i.season_id}/${i.user_id}`}>
              <p>
                {i.legal_name} · {i.kind} · $
                {(i.claimed_amount_cents / 100).toFixed(2)} claimed ·{" "}
                {i.payment_status}
                <br />
                Reference: {i.payment_reference || "Not supplied"}
              </p>
              <button
                className="button"
                disabled={
                  busy ||
                  i.payment_status === "verified" ||
                  paymentReason.trim().length < 5 ||
                  !navigator.onLine
                }
                onClick={async () => {
                  if (!supabase) return;
                  setBusy(true);
                  try {
                    const { error } = await supabase.rpc(
                      "verify_intake_payment",
                      {
                        c: club,
                        s: i.season_id,
                        u: i.user_id,
                        expected_revision: i.revision,
                        reason: paymentReason.trim(),
                      },
                    );
                    if (error) throw error;
                    setIntakes((rows) =>
                      rows.map((r) =>
                        r === i
                          ? {
                              ...r,
                              payment_status: "verified",
                              revision: r.revision + 1,
                            }
                          : r,
                      ),
                    );
                    setMessage(
                      "Payment verified. Review the waiver and membership separately.",
                    );
                  } catch {
                    setMessage(
                      "Verification not confirmed. Reload records before retrying.",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Confirm bank payment received
              </button>
            </div>
          ))}
          <h3>Pending registrations</h3>
          {pending.length === 0 ? (
            <p>No pending registrations loaded.</p>
          ) : (
            pending.map((p) => (
              <div key={`${p.season_id}/${p.user_id}`} className="admin-record">
                <span>
                  {intakes.find(
                    (i) =>
                      i.user_id === p.user_id && i.season_id === p.season_id,
                  )?.legal_name ?? `Member ${p.user_id}`}
                </span>
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
