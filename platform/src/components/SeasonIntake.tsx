import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "../services/auth";
const option = z.object({
  club_id: z.string(),
  season_id: z.string(),
  season_name: z.string(),
});
export function SeasonIntake({ onSaved }: { onSaved?: () => void }) {
  const [options, setOptions] = useState<z.infer<typeof option>[]>([]),
    [selected, setSelected] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [name, setName] = useState(""),
    [display, setDisplay] = useState(""),
    [phone, setPhone] = useState(""),
    [emergency, setEmergency] = useState(""),
    [kind, setKind] = useState("regular"),
    [reference, setReference] = useState(""),
    [amount, setAmount] = useState("0"),
    [revision, setRevision] = useState(0),
    [email, setEmail] = useState(""),
    [loaded, setLoaded] = useState(false),
    [reviewed, setReviewed] = useState(false),
    [reload, setReload] = useState(0),
    [setupRetry, setSetupRetry] = useState(0);
  useEffect(() => {
    let alive = true;
    void (async () => {
      if (!supabase) return;
      const { data, error } = await supabase
        .rpc("intake_options", {
          club_slug: import.meta.env.VITE_CLUB_SLUG || "dc-badminton",
        })
        .abortSignal(AbortSignal.timeout(12000));
      if (error) throw error;
      const rows = z.array(option).parse(data);
      if (alive) {
        setOptions(rows);
        setSelected((current) =>
          rows.some((r) => r.season_id === current)
            ? current
            : (rows[0]?.season_id ?? ""),
        );
        setMessage(
          rows.length ? "" : "No season is available for registration yet.",
        );
      }
    })().catch(() => {
      if (alive)
        setMessage(
          "Member details are not available yet. Please retry after the club finishes setup.",
        );
    });
    return () => {
      alive = false;
    };
  }, [setupRetry]);
  const choice = options.find((o) => o.season_id === selected);
  useEffect(() => {
    if (!supabase || !choice) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
      setBusy(false);
      setMessage(
        "Loading your details timed out. Reload saved details to retry.",
      );
    }, 12000);
    setLoaded(false);
    setBusy(true);
    setReviewed(false);
    setRevision(0);
    setName("");
    setDisplay("");
    setPhone("");
    setEmergency("");
    setReference("");
    setAmount("0");
    setKind("regular");
    void (async () => {
      const auth = await supabase!.auth.getUser();
      if (auth.error || !auth.data.user) throw new Error();
      const user = auth.data.user;
      const [intake, profile, registration] = await Promise.all([
        supabase!
          .from("member_intake")
          .select(
            "legal_name,kind,emergency_contact,payment_reference,claimed_amount_cents,revision,payment_status",
          )
          .eq("club_id", choice.club_id)
          .eq("season_id", choice.season_id)
          .eq("user_id", user.id)
          .abortSignal(controller.signal)
          .maybeSingle(),
        supabase!
          .from("members")
          .select("display_name,phone")
          .eq("id", user.id)
          .abortSignal(controller.signal)
          .maybeSingle(),
        supabase!
          .from("registrations")
          .select("status")
          .eq("club_id", choice.club_id)
          .eq("season_id", choice.season_id)
          .eq("user_id", user.id)
          .abortSignal(controller.signal)
          .maybeSingle(),
      ]);
      if (controller.signal.aborted) return;
      if (intake.error || profile.error || registration.error)
        throw new Error();
      const row = z
        .object({
          legal_name: z.string(),
          kind: z.string(),
          emergency_contact: z.string(),
          payment_reference: z.string(),
          claimed_amount_cents: z.number(),
          revision: z.number(),
          payment_status: z.string(),
        })
        .nullable()
        .parse(intake.data);
      const person = z
        .object({ display_name: z.string(), phone: z.string().nullable() })
        .nullable()
        .parse(profile.data);
      const status = z
        .object({ status: z.string() })
        .nullable()
        .parse(registration.data)?.status;
      setEmail(user.email ?? "");
      setDisplay(person?.display_name ?? "");
      setPhone(person?.phone ?? "");
      if (row) {
        setName(row.legal_name);
        setKind(row.kind);
        setEmergency(row.emergency_contact);
        setReference(row.payment_reference);
        setAmount(String(row.claimed_amount_cents / 100));
        setRevision(row.revision);
      }
      setReviewed(
        (!!status && status !== "pending") ||
          row?.payment_status === "verified",
      );
      setLoaded(true);
      setMessage(
        status === "approved"
          ? "Your registration is approved. Contact Christy if your details need changing."
          : row
            ? "Your registration request is saved. Christy will review it after your season agreement and required checks are complete."
            : "",
      );
    })()
      .catch(() => {
        if (!controller.signal.aborted)
          setMessage(
            "Could not load your details. Retry before submitting so an earlier request is not overwritten.",
          );
      })
      .finally(() => {
        clearTimeout(timeout);
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [choice, reload]);
  const disabled = busy || !loaded || reviewed;
  return (
    <section>
      <h2>Complete your league details</h2>
      <p>
        We collect contact details for league operations and emergencies. Your
        legal name, contact and payment details are private to you and
        authorized administrators. Fellow members see your chosen display name
        and results.
      </p>
      <p>
        Maplewood Advanced League · 25 regular players · $400 season · $20 per
        spare session. Submit your information for Christy’s review. A request
        does not reserve a place or mark you paid.
      </p>
      <p>
        E-transfer: Christygeorge993@gmail.com. Enter only the payment reference
        and amount; never bank passwords or security answers. Christy verifies
        payments separately. Waiver acceptance is a separate step.
      </p>
      {!choice && (
        <button className="button" onClick={() => setSetupRetry((n) => n + 1)}>
          Retry registration setup
        </button>
      )}
      {choice && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!supabase || disabled) return;
            const cents = Number(amount) * 100;
            if (
              !Number.isSafeInteger(Math.round(cents)) ||
              Math.abs(cents - Math.round(cents)) > 0.000001 ||
              cents < 0 ||
              cents > 100000
            ) {
              setMessage(
                "Enter a valid amount with at most two decimal places.",
              );
              return;
            }
            setBusy(true);
            try {
              const { data, error } = await supabase
                .rpc("submit_intake", {
                  c: choice.club_id,
                  s: choice.season_id,
                  legal_name: name,
                  display_name: display,
                  phone,
                  emergency_contact: emergency,
                  kind,
                  payment_reference: reference,
                  claimed_amount_cents: Math.round(cents),
                  expected_revision: revision,
                })
                .abortSignal(AbortSignal.timeout(15000));
              if (error) throw error;
              setRevision(z.number().parse(data));
              onSaved?.();
              setMessage(
                "Registration request submitted. Complete the season agreement; Christy will review your request.",
              );
            } catch {
              setMessage(
                "Details not confirmed. If you already submitted, load your saved details before trying again.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Season
            <select
              value={selected}
              disabled={busy}
              onChange={(e) => {
                setLoaded(false);
                setBusy(true);
                setSelected(e.target.value);
                setRevision(0);
              }}
            >
              {options.map((o) => (
                <option key={o.season_id} value={o.season_id}>
                  {o.season_name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={() => {
              setLoaded(false);
              setBusy(true);
              setMessage("Loading your saved details…");
              setReload((n) => n + 1);
            }}
          >
            Reload saved details
          </button>
          <label>
            Signed-in email
            <input type="email" value={email} readOnly autoComplete="email" />
          </label>
          <label>
            Full legal name
            <input
              required
              maxLength={150}
              value={name}
              disabled={disabled}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            Name shown in standings
            <input
              required
              maxLength={100}
              value={display}
              disabled={disabled}
              onChange={(e) => setDisplay(e.target.value)}
            />
          </label>
          <label>
            Phone
            <input
              type="tel"
              required
              minLength={5}
              maxLength={40}
              value={phone}
              disabled={disabled}
              onChange={(e) => setPhone(e.target.value)}
            />
          </label>
          <label>
            Emergency contact name and phone
            <input
              required
              maxLength={200}
              value={emergency}
              disabled={disabled}
              onChange={(e) => setEmergency(e.target.value)}
            />
          </label>
          <label>
            Player type
            <select
              value={kind}
              disabled={disabled}
              onChange={(e) => setKind(e.target.value)}
            >
              <option value="regular">Regular player — $400 season</option>
              <option value="spare">Spare applicant — $20 per session</option>
            </select>
          </label>
          <label>
            Amount already sent (CAD)
            <input
              type="number"
              min={0}
              max={1000}
              step="0.01"
              required
              value={amount}
              disabled={disabled}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <label>
            E-transfer reference (optional)
            <input
              maxLength={200}
              value={reference}
              disabled={disabled}
              onChange={(e) => setReference(e.target.value)}
            />
          </label>
          <button
            className="button primary"
            disabled={disabled || !navigator.onLine}
          >
            {busy
              ? "Loading…"
              : revision
                ? "Save registration changes"
                : "Submit registration request"}
          </button>
        </form>
      )}
      <p role="status">{message}</p>
    </section>
  );
}
