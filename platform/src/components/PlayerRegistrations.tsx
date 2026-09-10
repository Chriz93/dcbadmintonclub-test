import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { supabase } from "../services/auth";
import "./player-registrations.css";
export const playerRegistrationSchema = z.object({
  user_id: z.string(),
  season_id: z.string(),
  season_name: z.string(),
  status: z.string(),
  legal_name: z.string(),
  display_name: z.string(),
  email: z.string(),
  phone: z.string(),
  kind: z.string(),
  emergency_contact: z.string(),
  payment_reference: z.string(),
  claimed_amount_cents: z.number(),
  payment_status: z.string(),
  intake_revision: z.number().nullable(),
  required_fee_cents: z.number(),
  agreement_signed: z.boolean(),
  identity_reviewed: z.boolean(),
  require_intake: z.boolean(),
  operations_enabled: z.boolean(),
});
type Entry = z.infer<typeof playerRegistrationSchema>;
const requirements = (p: Entry) => [
  ...(p.require_intake && p.intake_revision === null
    ? ["Player details are missing"]
    : []),
  ...(p.operations_enabled && !p.agreement_signed
    ? ["Current season agreement needs signing"]
    : []),
  ...(p.operations_enabled && !p.identity_reviewed
    ? ["Participant/guardian identity needs your review"]
    : []),
  ...(p.require_intake &&
  p.kind === "regular" &&
  (p.payment_status !== "verified" ||
    p.claimed_amount_cents < p.required_fee_cents)
    ? ["Full season payment needs verification"]
    : []),
];
export function PlayerRegistrations({
  club,
  refreshKey = 0,
  onPayments,
  onIdentity,
}: {
  club: string;
  refreshKey?: number;
  onPayments: () => void;
  onIdentity: () => void;
}) {
  const inFlight = useRef(false);
  const [rows, setRows] = useState<Entry[]>([]),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [filter, setFilter] = useState("all"),
    [season, setSeason] = useState(""),
    [search, setSearch] = useState(""),
    [selected, setSelected] = useState("");
  const load = useCallback(async () => {
    if (!supabase || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const { data, error } = await supabase
        .rpc("registration_review_list", {
          c: club,
        })
        .abortSignal(AbortSignal.timeout(12000));
      if (error) throw error;
      setRows(z.array(playerRegistrationSchema).parse(data));
      setLoaded(true);
    } catch {
      setError(
        "Player registrations could not be loaded. Verify administrator access and retry.",
      );
      setLoaded(false);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, [club]);
  useEffect(() => {
    void load();
  }, [load, refreshKey]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 30000);
    return () => clearInterval(timer);
  }, [load]);
  const scoped = rows.filter((p) => !season || p.season_id === season),
    visible = scoped.filter(
      (p) =>
        (filter === "all" || p.status === filter) &&
        `${p.legal_name} ${p.display_name} ${p.email}`
          .toLowerCase()
          .includes(search.trim().toLowerCase()),
    );
  const choices = Array.from(
    new Map(rows.map((p) => [p.season_id, p.season_name])),
  );
  return (
    <section aria-label="Player registrations" className="player-registrations">
      <h2>Players</h2>
      <p>
        New requests appear here after a player submits their details. Only your
        approval confirms their place.
      </p>
      <div className="player-list-controls">
        <label>
          Player season
          <select
            value={season}
            onChange={(e) => {
              setSeason(e.target.value);
              setSelected("");
            }}
          >
            <option value="">All seasons</option>
            {choices.map(([id, name]) => (
              <option value={id} key={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Find a registration
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name or email"
          />
        </label>
        <button className="button" disabled={busy} onClick={() => void load()}>
          Refresh players
        </button>
      </div>
      <div className="player-list-filters" aria-label="Registration filters">
        {[
          ["all", "All"],
          ["pending", "Pending"],
          ["approved", "Approved"],
          ["waitlisted", "Waitlisted"],
          ["rejected", "Rejected"],
        ].map(([key, label]) => (
          <button
            key={key}
            className={`button ${filter === key ? "primary" : ""}`}
            aria-pressed={filter === key}
            onClick={() => {
              setFilter(key);
              setSelected("");
            }}
          >
            {label} (
            {key === "all"
              ? scoped.length
              : scoped.filter((p) => p.status === key).length}
            )
          </button>
        ))}
      </div>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {!loaded && !error && <p role="status">Loading players…</p>}
      {loaded && visible.length === 0 && (
        <p>
          {rows.length
            ? "No players match this filter."
            : "No registrations yet. Share the website link; players sign in and submit their information."}
        </p>
      )}
      {loaded &&
        visible.map((p) => {
          const key = `${p.season_id}/${p.user_id}`,
            missing = requirements(p);
          return (
            <article
              key={key}
              className="player-registration"
              aria-label={`${p.legal_name} · ${p.season_name}`}
            >
              <header>
                <div>
                  <h3>{p.legal_name}</h3>
                  <p>
                    {p.season_name} ·{" "}
                    {p.kind === "regular" ? "Regular" : "Spare"}
                  </p>
                </div>
                <strong>
                  {p.status === "pending"
                    ? "Pending approval"
                    : p.status === "approved"
                      ? "Approved"
                      : p.status === "waitlisted"
                        ? "Waitlisted"
                        : "Rejected"}
                </strong>
              </header>
              <p>{p.email}</p>
              <p>
                {p.agreement_signed ? "Agreement signed" : "Agreement pending"}{" "}
                ·{" "}
                {p.payment_status === "verified"
                  ? "Payment verified"
                  : "Payment unverified"}
              </p>
              <button
                className="button"
                aria-expanded={selected === key}
                onClick={() => setSelected(selected === key ? "" : key)}
              >
                {selected === key ? "Hide details" : "Review player"}
              </button>
              {selected === key && (
                <div className="player-registration-details">
                  <dl>
                    <dt>Name in standings</dt>
                    <dd>{p.display_name}</dd>
                    <dt>Phone</dt>
                    <dd>{p.phone || "Not provided"}</dd>
                    <dt>Emergency contact</dt>
                    <dd>{p.emergency_contact || "Not provided"}</dd>
                    <dt>Payment claimed</dt>
                    <dd>
                      ${(p.claimed_amount_cents / 100).toFixed(2)} ·{" "}
                      {p.payment_status}
                    </dd>
                    <dt>E-transfer reference</dt>
                    <dd>{p.payment_reference || "Not provided"}</dd>
                  </dl>
                  {p.status === "pending" && (
                    <>
                      {missing.length ? (
                        <>
                          <p>Before approval:</p>
                          <ul>
                            {missing.map((m) => (
                              <li key={m}>{m}</li>
                            ))}
                          </ul>
                        </>
                      ) : (
                        <p>
                          Checks complete. Approval also checks available
                          capacity.
                        </p>
                      )}
                      <div className="player-list-filters">
                        <button className="button" onClick={onPayments}>
                          Review payment
                        </button>
                        <button className="button" onClick={onIdentity}>
                          Review participant / guardian
                        </button>
                        <button
                          className="button primary"
                          disabled={
                            busy ||
                            !!error ||
                            missing.length > 0 ||
                            !navigator.onLine
                          }
                          onClick={async () => {
                            if (!supabase || inFlight.current) return;
                            inFlight.current = true;
                            setBusy(true);
                            setNotice("");
                            try {
                              const { data, error } = await supabase
                                .rpc("approve_member", {
                                  c: club,
                                  s: p.season_id,
                                  u: p.user_id,
                                })
                                .abortSignal(AbortSignal.timeout(15000));
                              if (error) {
                                setNotice(
                                  error.message.includes("roster is full")
                                    ? "The regular roster is full. This request stays pending."
                                    : `Approval not saved: ${error.message}`,
                                );
                                return;
                              }
                              setNotice(
                                `${p.legal_name}: ${data === "waitlisted" ? "waitlisted" : "approved"}.`,
                              );
                            } catch {
                              setNotice(
                                "Approval could not be confirmed. Refresh players before retrying.",
                              );
                            } finally {
                              inFlight.current = false;
                              setBusy(false);
                            }
                            await load();
                          }}
                        >
                          Approve player
                        </button>
                      </div>
                    </>
                  )}
                  {p.status === "approved" && (
                    <p>
                      Approved for this season. Initial ELO follows your seeding
                      in Sessions &amp; seeding.
                    </p>
                  )}
                </div>
              )}
            </article>
          );
        })}
    </section>
  );
}
