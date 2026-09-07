import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "../services/auth";
const option = z.object({
  club_id: z.string(),
  season_id: z.string(),
  season_name: z.string(),
});
export function SeasonIntake() {
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
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let alive = true;
    void (async () => {
      if (!supabase) return;
      const { data, error } = await supabase.rpc("intake_options", {
        club_slug: import.meta.env.VITE_CLUB_SLUG || "dc-badminton",
      });
      if (error) throw error;
      const rows = z.array(option).parse(data);
      if (alive) {
        setOptions(rows);
        setSelected(rows[0]?.season_id ?? "");
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
  }, []);
  const choice = options.find((o) => o.season_id === selected);
  return (
    <section>
      <h3>Complete your league details</h3>
      <p>
        We collect contact details for league operations and emergencies. Your
        legal name, contact and payment details are private to you and
        authorized administrators. Fellow members see your chosen display name
        and results.
      </p>
      <p>
        Maplewood Advanced League · 25 regular players · $400 season · $20 per
        spare session. Regular registration is closed; this form is for players
        already accepted by Christy and spare applicants. Submitting does not
        reserve a place.
      </p>
      <p>
        E-transfer: Christygeorge993@gmail.com. Enter only the payment reference
        and amount; never bank passwords or security answers. Christy verifies
        payments separately. Waiver acceptance is a separate step.
      </p>
      {choice && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!supabase) return;
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
              const { data, error } = await supabase.rpc("submit_intake", {
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
              });
              if (error) throw error;
              setRevision(z.number().parse(data));
              setMessage(
                "Details saved. Your place, payment and waiver still require review; you are not marked paid automatically.",
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
            onClick={async () => {
              if (!supabase) return;
              setBusy(true);
              try {
                const {
                  data: { user },
                } = await supabase.auth.getUser();
                if (!user) throw new Error();
                const { data, error } = await supabase
                  .from("member_intake")
                  .select(
                    "legal_name,kind,emergency_contact,payment_reference,claimed_amount_cents,revision,payment_status",
                  )
                  .eq("club_id", choice.club_id)
                  .eq("season_id", choice.season_id)
                  .eq("user_id", user.id)
                  .maybeSingle();
                if (error) throw error;
                if (!data) {
                  setRevision(0);
                  setMessage("No saved intake yet.");
                  return;
                }
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
                  .parse(data);
                const profileResult = await supabase
                  .from("members")
                  .select("display_name,phone")
                  .eq("id", user.id)
                  .single();
                if (profileResult.error) throw profileResult.error;
                const profile = z
                  .object({
                    display_name: z.string(),
                    phone: z.string().nullable(),
                  })
                  .parse(profileResult.data);
                setDisplay(profile.display_name);
                setPhone(profile.phone ?? "");
                setName(row.legal_name);
                setKind(row.kind);
                setEmergency(row.emergency_contact);
                setReference(row.payment_reference);
                setAmount(String(row.claimed_amount_cents / 100));
                setRevision(row.revision);
                setMessage(
                  `Saved details loaded. Payment: ${row.payment_status}.`,
                );
              } catch {
                setMessage("Unable to load saved details. Sign in and retry.");
              } finally {
                setBusy(false);
              }
            }}
          >
            Load saved details
          </button>
          <label>
            Full legal name
            <input
              required
              maxLength={150}
              value={name}
              disabled={busy}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            Name shown in standings
            <input
              required
              maxLength={100}
              value={display}
              disabled={busy}
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
              disabled={busy}
              onChange={(e) => setPhone(e.target.value)}
            />
          </label>
          <label>
            Emergency contact name and phone
            <input
              required
              maxLength={200}
              value={emergency}
              disabled={busy}
              onChange={(e) => setEmergency(e.target.value)}
            />
          </label>
          <label>
            Player type
            <select
              value={kind}
              disabled={busy}
              onChange={(e) => setKind(e.target.value)}
            >
              <option value="regular">
                Accepted regular player — $400 season
              </option>
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
              disabled={busy}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <label>
            E-transfer reference (optional)
            <input
              maxLength={200}
              value={reference}
              disabled={busy}
              onChange={(e) => setReference(e.target.value)}
            />
          </label>
          <button
            className="button primary"
            disabled={busy || !navigator.onLine}
          >
            Save my details for review
          </button>
        </form>
      )}
      <p role="status">{message}</p>
    </section>
  );
}
