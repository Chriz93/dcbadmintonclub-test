import { useState } from "react";
import { z } from "zod";
import { supabase } from "../services/auth";
const entry = z.object({
  id: z.string(),
  kind: z.string(),
  cents: z.number(),
  shuttles: z.number(),
  status: z.string(),
});
export function SessionAccounts({
  club,
  session,
  isSpare = false,
}: {
  club: string;
  session: string;
  isSpare?: boolean;
}) {
  const [rows, setRows] = useState<z.infer<typeof entry>[]>([]),
    [reference, setReference] = useState(""),
    [revision, setRevision] = useState(0),
    [spareStatus, setSpareStatus] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [loaded, setLoaded] = useState("");
  async function load() {
    if (!supabase || !club || !session) return;
    setBusy(true);
    setLoaded("");
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error();
      const [account, spare] = await Promise.all([
        supabase
          .from("session_accounts")
          .select("id,kind,cents,shuttles,status")
          .eq("club_id", club)
          .eq("session_id", session)
          .eq("user_id", user.id),
        supabase
          .from("spare_requests")
          .select("revision,status,payment_reference")
          .eq("club_id", club)
          .eq("session_id", session)
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);
      if (account.error || spare.error) throw new Error();
      setRows(z.array(entry).parse(account.data));
      const request = spare.data
        ? z
            .object({
              revision: z.number(),
              status: z.string(),
              payment_reference: z.string(),
            })
            .parse(spare.data)
        : null;
      setRevision(request?.revision ?? 0);
      setSpareStatus(request?.status ?? "No spare vote");
      setReference(request?.payment_reference ?? "");
      setLoaded(`${club}/${session}`);
      setMessage("Session account loaded.");
    } catch {
      setMessage("Session accounts could not be loaded.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <h3>Refunds, shuttle credits and spare booking</h3>
      <p>
        Eligible absence refund: $14 with at least 72 hours’ notice. School
        cancellations credit two physical shuttlecocks, with no cash refund.
      </p>
      <button
        className="button"
        disabled={busy || !session || !navigator.onLine}
        onClick={() => void load()}
      >
        Load my session account
      </button>
      {loaded === `${club}/${session}` && (
        <>
          {rows.length ? (
            rows.map((r) => (
              <p key={r.id}>
                {r.kind.replaceAll("_", " ")}: ${(r.cents / 100).toFixed(2)} ·{" "}
                {r.shuttles} physical shuttlecocks · {r.status}
              </p>
            ))
          ) : (
            <p>No refund or shuttle credit recorded for this session.</p>
          )}
          {isSpare && (
            <details>
              <summary>Book as an approved spare — $20</summary>
              <p>
                Current state: {spareStatus}. A vote and payment claim do not
                reserve a place. The first eligible vote with verified payment
                takes an available spot. Claims expire after 24 hours or at
                session start. If payment cannot secure a place, the
                administrator reconciles it.
              </p>
              <button
                className="button"
                disabled={
                  busy ||
                  spareStatus === "withdrawn" ||
                  spareStatus === "No spare vote"
                }
                onClick={async () => {
                  if (!supabase) return;
                  const note = window.prompt(
                    "Reason for withdrawing this spare vote or booking:",
                  );
                  if (!note) return;
                  setBusy(true);
                  try {
                    const { error } = await supabase.rpc("withdraw_spare", {
                      c: club,
                      s: session,
                      expected_revision: revision,
                      note,
                    });
                    if (error) throw error;
                    setMessage(
                      "Withdrawal recorded. Reload to see any eligible $14 refund.",
                    );
                  } catch {
                    setMessage(
                      "Withdrawal not confirmed. Reload or contact the organizer.",
                    );
                  } finally {
                    setLoaded("");
                    setBusy(false);
                  }
                }}
              >
                Withdraw spare vote or booking
              </button>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!supabase) return;
                  setBusy(true);
                  try {
                    const { error } = await supabase.rpc("request_spare", {
                      c: club,
                      s: session,
                      payment_reference: reference,
                      expected_revision: revision,
                    });
                    if (error) throw error;
                    setLoaded("");
                    setMessage(
                      "Spare vote recorded; payment verification and availability determine confirmation. Reload to see status.",
                    );
                  } catch {
                    setLoaded("");
                    setMessage(
                      "Spare vote not confirmed. Check spare approval, vacancy and payment status, then reload.",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <label>
                  E-transfer reference
                  <input
                    value={reference}
                    required
                    maxLength={200}
                    disabled={busy}
                    onChange={(e) => setReference(e.target.value)}
                  />
                </label>
                <button className="button" disabled={busy || !navigator.onLine}>
                  Submit spare vote and payment claim
                </button>
              </form>
            </details>
          )}
        </>
      )}
      <p role="status">{message}</p>
    </section>
  );
}
