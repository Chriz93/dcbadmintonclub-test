import { useState } from "react";
import { supabase } from "../services/auth";
import { z } from "zod";
const profileSchema = z.object({
  display_name: z.string(),
  phone: z.string().nullable(),
});
const resultSchema = z.object({
  season_id: z.string(),
  played: z.number(),
  wins: z.number(),
  points: z.number(),
  possible_points: z.number(),
});
export function PersonalRecords() {
  const [name, setName] = useState(""),
    [phone, setPhone] = useState(""),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(false),
    [message, setMessage] = useState("");
  const [results, setResults] = useState<z.infer<typeof resultSchema>[]>([]);
  const [waivers, setWaivers] = useState<
    { waiver_id: string; accepted_at: string }[]
  >([]);
  return (
    <section>
      <h3>Your profile and results</h3>
      <button
        className="button"
        disabled={busy || !navigator.onLine}
        onClick={async () => {
          if (!supabase) return;
          setBusy(true);
          setLoaded(false);
          try {
            const {
              data: { user },
              error,
            } = await supabase.auth.getUser();
            if (error || !user) throw new Error();
            const reads = await Promise.all([
              supabase
                .from("members")
                .select("display_name,phone")
                .eq("id", user.id)
                .maybeSingle(),
              supabase
                .from("rankings")
                .select("season_id,played,wins,points,possible_points")
                .eq("user_id", user.id),
              supabase
                .from("waiver_acceptances")
                .select("waiver_id,accepted_at")
                .eq("user_id", user.id),
            ]);
            if (reads.some((r) => r.error)) throw new Error();
            if (!reads[0].data) {
              setMessage("Submit a registration before editing your profile.");
              return;
            }
            const profile = profileSchema.parse(reads[0].data);
            setName(profile.display_name);
            setPhone(profile.phone ?? "");
            setResults(z.array(resultSchema).parse(reads[1].data));
            setWaivers(
              z
                .array(
                  z.object({ waiver_id: z.string(), accepted_at: z.string() }),
                )
                .parse(reads[2].data),
            );
            setLoaded(true);
            setMessage("Your records loaded.");
          } catch {
            setMessage("Your records could not be loaded. Please retry.");
          } finally {
            setBusy(false);
          }
        }}
      >
        Load my profile and results
      </button>
      {loaded && (
        <>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!supabase) return;
              setBusy(true);
              try {
                const { error } = await supabase.rpc("update_profile", {
                  display_name: name.trim(),
                  phone: phone.trim() || null,
                });
                if (error) throw error;
                setMessage("Profile saved.");
              } catch {
                setMessage(
                  "Profile not confirmed. Reload your records before retrying.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Display name
              <input
                required
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={busy}
              />
            </label>
            <label>
              Phone number
              <input
                type="tel"
                maxLength={40}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={busy}
              />
            </label>
            <button className="button" disabled={busy || !navigator.onLine}>
              Save my profile
            </button>
          </form>
          <h4>Season results</h4>
          {results.length ? (
            results.map((r) => (
              <p key={r.season_id}>
                {r.played} games · {r.wins} wins ·{" "}
                {r.played ? Math.round((r.wins / r.played) * 100) : 0}% win rate
                ·{" "}
                {r.possible_points
                  ? Math.round((r.points / r.possible_points) * 100)
                  : 0}
                % of available points
              </p>
            ))
          ) : (
            <p>No completed-session results yet.</p>
          )}
          <h4>Waiver acceptances</h4>
          {waivers.length ? (
            waivers.map((w) => (
              <p key={w.waiver_id}>
                Accepted {new Date(w.accepted_at).toLocaleString()}
              </p>
            ))
          ) : (
            <p>No waiver acceptance recorded.</p>
          )}
        </>
      )}
      <p role="status">{message}</p>
    </section>
  );
}
