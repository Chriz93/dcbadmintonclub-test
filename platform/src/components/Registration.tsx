import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "../services/auth";
const optionSchema = z.object({
  club_id: z.string(),
  season_id: z.string(),
  season_name: z.string(),
  waiver_id: z.string(),
  waiver_body: z.string(),
});
export function Registration() {
  const [options, setOptions] = useState<z.infer<typeof optionSchema>[]>([]),
    [selected, setSelected] = useState(""),
    [accepted, setAccepted] = useState(false),
    [name, setName] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    void (async () => {
      const { data, error } = await supabase!.rpc("registration_options", {
        club_slug: import.meta.env.VITE_CLUB_SLUG || "dc-badminton",
      });
      if (error) throw error;
      const rows = z.array(optionSchema).parse(data);
      if (alive) {
        setOptions(rows);
        setSelected(rows[0]?.season_id ?? "");
      }
    })().catch(() =>
      setMessage("Registration information could not be loaded."),
    );
    return () => {
      alive = false;
    };
  }, []);
  const choice = options.find((o) => o.season_id === selected);
  return (
    <section>
      <h3>Accept your participant waiver</h3>
      {!choice ? (
        <p>
          You can save your details above now. Waiver signing becomes available
          after the club publishes its reviewed participant waiver. Facility
          rules are not a substitute.
        </p>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!supabase || !accepted) return;
            setBusy(true);
            try {
              const { error } = await supabase.rpc("register_member", {
                c: choice.club_id,
                s: choice.season_id,
                display_name: name,
                waiver: choice.waiver_id,
              });
              if (error) throw error;
              setMessage(
                "Registration and waiver acceptance recorded. Your application awaits administrator review.",
              );
            } catch {
              setMessage(
                "Registration not confirmed. Verify your sign-in and try again.",
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
              onChange={(e) => {
                setSelected(e.target.value);
                setAccepted(false);
              }}
            >
              {options.map((o) => (
                <option key={o.season_id} value={o.season_id}>
                  {o.season_name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Display name
            <input
              required
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <div className="waiver-text">{choice.waiver_body}</div>
          <label className="check-label">
            <input
              type="checkbox"
              required
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
            />
            I have read and accept this version of the club waiver.
          </label>
          <button
            className="button primary"
            disabled={busy || !accepted || !navigator.onLine}
          >
            Submit registration and acceptance
          </button>
        </form>
      )}
      <p role="status">{message}</p>
    </section>
  );
}
