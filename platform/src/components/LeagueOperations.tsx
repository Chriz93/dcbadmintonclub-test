import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "../services/auth";
const seasonSchema = z.object({
  id: z.string(),
  name: z.string(),
  rules: z.record(z.string(), z.unknown()),
});
const sessionSchema = z.object({
  id: z.string(),
  starts_at: z.string(),
  status: z.string(),
});
const person = z.object({
  user_id: z.string(),
  display_name: z.string(),
  kind: z.string(),
});
const accountSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  kind: z.string(),
  cents: z.number(),
  shuttles: z.number(),
  status: z.string(),
  revision: z.number(),
});
const spareSchema = z.object({
  user_id: z.string(),
  status: z.string(),
  payment_reference: z.string(),
  revision: z.number(),
  voted_at: z.string(),
  expires_at: z.string(),
});
const attendanceSchema = z.object({
  user_id: z.string(),
  display_name: z.string(),
  response: z.string(),
  attendance: z.string(),
  kind: z.string(),
});
const penaltySchema = z.object({
  user_id: z.string(),
  status: z.string(),
  revision: z.number(),
});
export function LeagueOperations({ club }: { club: string }) {
  const [seasons, setSeasons] = useState<z.infer<typeof seasonSchema>[]>([]),
    [season, setSeason] = useState(""),
    [sessions, setSessions] = useState<z.infer<typeof sessionSchema>[]>([]),
    [session, setSession] = useState(""),
    [people, setPeople] = useState<z.infer<typeof person>[]>([]),
    [order, setOrder] = useState<string[]>([]);
  const [accounts, setAccounts] = useState<z.infer<typeof accountSchema>[]>([]),
    [spares, setSpares] = useState<z.infer<typeof spareSchema>[]>([]),
    [attendance, setAttendance] = useState<z.infer<typeof attendanceSchema>[]>(
      [],
    ),
    [penalties, setPenalties] = useState<z.infer<typeof penaltySchema>[]>([]);
  const [reason, setReason] = useState(""),
    [body, setBody] = useState(""),
    [review, setReview] = useState(""),
    [version, setVersion] = useState(0),
    [reviewed, setReviewed] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [loaded, setLoaded] = useState("");
  const name = (id: string) =>
    people.find((p) => p.user_id === id)?.display_name ?? "Member";
  const current = seasons.find((s) => s.id === season);
  useEffect(() => {
    setLoaded("");
    setSessions([]);
    setSession("");
    setSeason("");
    let alive = true;
    void (async () => {
      if (!supabase) return;
      const [se, roster, waiver] = await Promise.all([
        supabase.from("seasons").select("id,name,rules").eq("club_id", club),
        supabase.rpc("club_roster", { c: club }),
        supabase
          .from("waiver_versions")
          .select("version")
          .eq("club_id", club)
          .order("version", { ascending: false })
          .limit(1),
      ]);
      if (se.error || roster.error || waiver.error) throw new Error();
      if (alive) {
        const rows = z.array(seasonSchema).parse(se.data);
        setSeasons(rows);
        setSeason(rows[0]?.id ?? "");
        setPeople(z.array(person).parse(roster.data));
        setVersion(
          z.array(z.object({ version: z.number() })).parse(waiver.data)[0]
            ?.version ?? 0,
        );
      }
    })().catch(() => {
      if (alive)
        setMessage(
          "Could not load league operations. Check administrator MFA.",
        );
    });
    return () => {
      alive = false;
    };
  }, [club]);
  useEffect(() => {
    if (!season || !supabase) return;
    let alive = true;
    setLoaded("");
    void (async () => {
      const [s, seeds] = await Promise.all([
        supabase!
          .from("sessions")
          .select("id,starts_at,status")
          .eq("club_id", club)
          .eq("season_id", season)
          .order("starts_at"),
        supabase!
          .from("initial_seeds")
          .select("user_id,seed")
          .eq("club_id", club)
          .eq("season_id", season)
          .order("seed"),
      ]);
      if (s.error || seeds.error) throw new Error();
      if (alive) {
        const rows = z.array(sessionSchema).parse(s.data);
        setSessions(rows);
        setSession(
          rows.find((x) => x.status === "active")?.id ??
            rows.find((x) => x.status === "scheduled")?.id ??
            "",
        );
        const ids = z
          .array(z.object({ user_id: z.string(), seed: z.number() }))
          .parse(seeds.data)
          .map((x) => x.user_id);
        setOrder([
          ...ids,
          ...people.map((p) => p.user_id).filter((id) => !ids.includes(id)),
        ]);
      }
    })().catch(() => {
      if (alive) setMessage("Could not load season or seeding.");
    });
    return () => {
      alive = false;
    };
  }, [club, season, people]);
  async function load() {
    if (!supabase || !session) return;
    setBusy(true);
    setLoaded("");
    try {
      const result = await Promise.all([
        supabase
          .from("session_accounts")
          .select("id,user_id,kind,cents,shuttles,status,revision")
          .eq("club_id", club)
          .eq("session_id", session),
        supabase
          .from("spare_requests")
          .select(
            "user_id,status,payment_reference,revision,voted_at,expires_at",
          )
          .eq("club_id", club)
          .eq("session_id", session)
          .order("voted_at"),
        supabase.rpc("attendance_overview", { c: club, s: session }),
        supabase
          .from("no_show_penalties")
          .select("user_id,status,revision")
          .eq("club_id", club)
          .eq("session_id", session),
      ]);
      if (result.some((r) => r.error)) throw new Error();
      setAccounts(z.array(accountSchema).parse(result[0].data));
      setSpares(z.array(spareSchema).parse(result[1].data));
      setAttendance(z.array(attendanceSchema).parse(result[2].data));
      setPenalties(z.array(penaltySchema).parse(result[3].data));
      setLoaded(`${club}/${session}`);
      setMessage("Operations refreshed.");
    } catch {
      setMessage("Could not load operations.");
    } finally {
      setBusy(false);
    }
  }
  async function mutate(rpc: string, args: Record<string, unknown>) {
    if (!supabase) return;
    setBusy(true);
    setLoaded("");
    try {
      const { error } = await supabase.rpc(rpc, args);
      if (error) throw error;
      setMessage("Saved. Refresh to see the latest records.");
    } catch (error) {
      setMessage(
        `Not confirmed: ${(error as { message?: string }).message ?? "refresh before retrying"}`,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <h3>League operations</h3>
      <label>
        Operations season
        <select
          value={season}
          disabled={busy}
          onChange={(e) => setSeason(e.target.value)}
        >
          {seasons.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <details>
        <summary>Initial seeding and ELO</summary>
        <p>
          Order strongest first. New initial ratings differ by 15 points per
          seed. Corrections rebuild all completed-session ELO chronologically.
          No-show penalties do not change ELO.
        </p>
        {order.map((id, index) => (
          <div className="admin-record" key={id}>
            <span>
              {index + 1}. {name(id)}
            </span>
            <button
              className="button"
              disabled={busy || index === 0}
              aria-label={`Move ${name(id)} up`}
              onClick={() =>
                setOrder((ids) => {
                  const next = [...ids];
                  [next[index - 1], next[index]] = [
                    next[index],
                    next[index - 1],
                  ];
                  return next;
                })
              }
            >
              ↑
            </button>
            <button
              className="button"
              disabled={busy || index === order.length - 1}
              aria-label={`Move ${name(id)} down`}
              onClick={() =>
                setOrder((ids) => {
                  const next = [...ids];
                  [next[index + 1], next[index]] = [
                    next[index],
                    next[index + 1],
                  ];
                  return next;
                })
              }
            >
              ↓
            </button>
          </div>
        ))}
        <button
          className="button"
          disabled={busy || !order.length || reason.trim().length < 5}
          onClick={async () => {
            await mutate("set_seeding", {
              c: club,
              se: season,
              ordered: order,
              expected_revision: Number(current?.rules.seedingRevision ?? 0),
              reason,
            });
            if (supabase) {
              const { data } = await supabase
                .from("seasons")
                .select("id,name,rules")
                .eq("club_id", club);
              if (data) setSeasons(z.array(seasonSchema).parse(data));
            }
          }}
        >
          Save reviewed seeding
        </button>
      </details>
      <details>
        <summary>Publish reviewed participant/guardian agreement</summary>
        <p>
          The fixed season rules are automatically included. Paste the complete
          reviewed liability/participation text. Publishing creates an immutable
          new version; nobody is signed automatically.
        </p>
        <label>
          Reviewed agreement text
          <textarea
            minLength={100}
            maxLength={30000}
            rows={12}
            value={body}
            disabled={busy}
            onChange={(e) => {
              setBody(e.target.value);
              setReviewed(false);
            }}
          />
        </label>
        <label>
          Legal review reference
          <input
            value={review}
            minLength={5}
            maxLength={500}
            disabled={busy}
            onChange={(e) => setReview(e.target.value)}
          />
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={reviewed}
            disabled={busy}
            onChange={(e) => setReviewed(e.target.checked)}
          />
          I confirm this text has been reviewed for this league, including
          guardian participation.
        </label>
        <button
          className="button"
          disabled={
            busy ||
            !reviewed ||
            body.trim().length < 100 ||
            review.trim().length < 5
          }
          onClick={async () => {
            await mutate("publish_agreement", {
              c: club,
              s: season,
              liability_text: body,
              review_reference: review,
              expected_version: version,
            });
            setReviewed(false);
            if (supabase) {
              const { data } = await supabase
                .from("waiver_versions")
                .select("version")
                .eq("club_id", club)
                .order("version", { ascending: false })
                .limit(1);
              if (data)
                setVersion(
                  z.array(z.object({ version: z.number() })).parse(data)[0]
                    ?.version ?? 0,
                );
            }
          }}
        >
          Publish reviewed version
        </button>
      </details>
      <label>
        Operations session
        <select
          value={session}
          disabled={busy}
          onChange={(e) => {
            setSession(e.target.value);
            setLoaded("");
          }}
        >
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {new Date(s.starts_at).toLocaleString("en-CA", {
                timeZone: "America/Toronto",
              })}{" "}
              · {s.status}
            </option>
          ))}
        </select>
      </label>
      <label>
        Reason / bank verification note
        <input
          value={reason}
          minLength={5}
          maxLength={500}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <button
        className="button"
        disabled={busy || !session || !navigator.onLine}
        onClick={() => void load()}
      >
        Refresh attendance and accounts
      </button>
      {loaded === `${club}/${session}` && (
        <>
          <h4>Attendance and nonresponders</h4>
          {attendance.map((p) => (
            <div className="admin-record" key={p.user_id}>
              <span>
                {p.display_name} · {p.response.replaceAll("_", " ")} ·{" "}
                {p.attendance}
              </span>
              <button
                className="button"
                disabled={busy || reason.trim().length < 5}
                onClick={() =>
                  void mutate("correct_attendance", {
                    c: club,
                    s: session,
                    u: p.user_id,
                    new_status:
                      p.attendance === "absent" ? "present" : "absent",
                    expected_status:
                      p.attendance === "not_checked" ? null : p.attendance,
                    reason,
                  })
                }
              >
                {p.attendance === "absent"
                  ? "Correct to present"
                  : "Mark verified absence"}
              </button>
              <button
                className="button"
                disabled={busy || reason.trim().length < 5}
                onClick={() =>
                  void mutate("record_no_show", {
                    c: club,
                    s: session,
                    u: p.user_id,
                    expected_revision:
                      penalties.find((x) => x.user_id === p.user_id)
                        ?.revision ?? 0,
                    void_penalty: penalties.some(
                      (x) => x.user_id === p.user_id && x.status !== "void",
                    ),
                    reason,
                  })
                }
              >
                {penalties.some(
                  (x) => x.user_id === p.user_id && x.status !== "void",
                )
                  ? "Void no-show penalty"
                  : "Record verified no-show"}
              </button>
            </div>
          ))}
          <h4>Spare votes and payment</h4>
          {spares.map((p) => (
            <div key={p.user_id} className="admin-record">
              <p>
                {name(p.user_id)} · {p.status} · reference {p.payment_reference}
                <br />
                Voted {new Date(p.voted_at).toLocaleString()} · expires{" "}
                {new Date(p.expires_at).toLocaleString()}
              </p>
              <button
                className="button"
                disabled={
                  busy ||
                  reason.trim().length < 5 ||
                  ["confirmed", "reconciliation"].includes(p.status)
                }
                onClick={() =>
                  void mutate("verify_spare", {
                    c: club,
                    s: session,
                    u: p.user_id,
                    expected_revision: p.revision,
                    reason,
                  })
                }
              >
                Verify $20 received and allocate if available
              </button>
            </div>
          ))}
          <h4>Refund and shuttle ledger</h4>
          {accounts.length ? (
            accounts.map((a) => (
              <AccountEditor
                key={`${a.id}/${a.revision}`}
                entry={a}
                name={name(a.user_id)}
                disabled={busy || reason.trim().length < 5}
                save={(status, cents, shuttles) =>
                  mutate("adjust_account", {
                    c: club,
                    entry: a.id,
                    expected_revision: a.revision,
                    new_status: status,
                    new_cents: cents,
                    new_shuttles: shuttles,
                    reason,
                  })
                }
              />
            ))
          ) : (
            <p>No ledger entries for this session.</p>
          )}
        </>
      )}
      <p role="status">{message}</p>
    </section>
  );
}
function AccountEditor({
  entry: e,
  name,
  disabled,
  save,
}: {
  entry: z.infer<typeof accountSchema>;
  name: string;
  disabled: boolean;
  save: (s: string, c: number, q: number) => Promise<void>;
}) {
  const [status, setStatus] = useState(e.status),
    [cents, setCents] = useState(e.cents),
    [shuttles, setShuttles] = useState(e.shuttles);
  return (
    <form
      className="admin-record"
      onSubmit={async (event) => {
        event.preventDefault();
        await save(status, cents, shuttles);
      }}
    >
      <p>
        {name} · {e.kind.replaceAll("_", " ")}
      </p>
      <label>
        Cash amount (cents)
        <input
          type="number"
          min={0}
          max={100000}
          value={cents}
          disabled={disabled}
          onChange={(x) => setCents(Number(x.target.value))}
        />
      </label>
      <label>
        Physical shuttlecocks
        <input
          type="number"
          min={0}
          max={100}
          value={shuttles}
          disabled={disabled}
          onChange={(x) => setShuttles(Number(x.target.value))}
        />
      </label>
      <label>
        Ledger status
        <select
          value={status}
          disabled={disabled}
          onChange={(x) => setStatus(x.target.value)}
        >
          <option value="pending">Pending</option>
          <option value="settled">Paid / handed over</option>
          <option value="void">Void</option>
        </select>
      </label>
      <button className="button" disabled={disabled}>
        Save ledger correction
      </button>
    </form>
  );
}
