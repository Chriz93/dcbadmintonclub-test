import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "../services/auth";
import { SeasonAgreementRules } from "./SeasonAgreementRules";
const option = z.object({
  club_id: z.string(),
  season_id: z.string(),
  season_name: z.string(),
});
const signing = z.object({
  club_id: z.string(),
  season_id: z.string(),
  participant_id: z.string(),
  participant_name: z.string(),
  waiver_id: z.string(),
  version: z.number(),
  body: z.string(),
  sha256: z.string(),
  capacity: z.string(),
});
const receipt = z.object({
  id: z.string(),
  body: z.string(),
  sha256: z.string(),
  participant_name: z.string(),
  signer_name: z.string(),
  signer_capacity: z.string(),
  signed_at: z.string(),
});
export function AgreementSigning() {
  const [signingKey, setSigningKey] = useState("");
  const [options, setOptions] = useState<z.infer<typeof option>[]>([]),
    [selected, setSelected] = useState(""),
    [birth, setBirth] = useState(""),
    [guardian, setGuardian] = useState(""),
    [revision, setRevision] = useState(0),
    [ack, setAck] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [choices, setChoices] = useState<z.infer<typeof signing>[]>([]),
    [receipts, setReceipts] = useState<z.infer<typeof receipt>[]>([]),
    [signature, setSignature] = useState(""),
    [relationship, setRelationship] = useState(""),
    [accept, setAccept] = useState(false);
  const activeChoice =
    choices.find((o) => `${o.participant_id}/${o.waiver_id}` === signingKey) ??
    choices[0];
  const choice = options.find((x) => x.season_id === selected);
  async function refresh() {
    if (!supabase) return;
    setBusy(true);
    try {
      const result = await supabase.rpc("intake_options", {
        club_slug: import.meta.env.VITE_CLUB_SLUG || "dc-badminton",
      });
      if (result.error) throw result.error;
      const rows = z.array(option).parse(result.data);
      setOptions(rows);
      setSelected((s) => s || rows[0]?.season_id || "");
      const [signatures, saved] = await Promise.all([
        supabase.rpc("signing_options"),
        supabase
          .from("signature_receipts")
          .select(
            "id,body,sha256,participant_name,signer_name,signer_capacity,signed_at",
          ),
      ]);
      if (signatures.error || saved.error) throw new Error();
      setChoices(z.array(signing).parse(signatures.data));
      setReceipts(z.array(receipt).parse(saved.data));
      setAccept(false);
      setMessage(
        "Signing records refreshed. Christy must independently review a minor’s guardian identity before the guardian can see or sign the agreement.",
      );
    } catch {
      setMessage("Unable to load signing records. Sign in and retry.");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  useEffect(() => {
    let alive = true;
    if (!choice || !supabase) return;
    void (async () => {
      const {
        data: { user },
      } = await supabase!.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase!
        .from("participant_eligibility")
        .select("birth_date,guardian_email,revision")
        .eq("club_id", choice.club_id)
        .eq("season_id", choice.season_id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      if (alive) {
        const row = data
          ? z
              .object({
                birth_date: z.string(),
                guardian_email: z.string().nullable(),
                revision: z.number(),
              })
              .parse(data)
          : null;
        setBirth(row?.birth_date ?? "");
        setGuardian(row?.guardian_email ?? "");
        setRevision(row?.revision ?? 0);
        setAck(false);
      }
    })().catch(() => {
      if (alive)
        setMessage("Eligibility could not be loaded; refresh before saving.");
    });
    return () => {
      alive = false;
    };
  }, [choice]);
  return (
    <section id="participant-signing">
      <h2>Participant and guardian agreement</h2>
      <SeasonAgreementRules />
      <button
        className="button"
        disabled={busy || !navigator.onLine}
        onClick={() => void refresh()}
      >
        Refresh signing records
      </button>
      {choice && !choices.some((o) => o.capacity === "guardian") && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!supabase || !ack) return;
            setBusy(true);
            try {
              const { data, error } = await supabase.rpc("save_eligibility", {
                c: choice.club_id,
                s: choice.season_id,
                birth_date: birth,
                guardian_email: guardian || null,
                expected_revision: revision,
                acknowledged: ack,
              });
              if (error) throw error;
              setRevision(z.number().parse(data));
              await refresh();
              setMessage(
                "Eligibility saved. Adult players may sign below when the reviewed agreement is published. For minors, Christy must first confirm the guardian’s identity and relationship. The reviewed guardian then signs in using their own email on this website.",
              );
            } catch {
              setMessage(
                "Eligibility not saved. Complete your member details first; check birth date and a separate guardian email, then refresh.",
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
              onChange={(e) => setSelected(e.target.value)}
            >
              {options.map((o) => (
                <option key={o.season_id} value={o.season_id}>
                  {o.season_name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Participant date of birth
            <input
              type="date"
              required
              value={birth}
              disabled={busy}
              onChange={(e) => setBirth(e.target.value)}
            />
          </label>
          <label>
            Parent/legal-guardian email (required if under 18)
            <input
              type="email"
              value={guardian}
              disabled={busy}
              onChange={(e) => setGuardian(e.target.value)}
            />
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={ack}
              disabled={busy}
              onChange={(e) => setAck(e.target.checked)}
            />
            I have read the season rules and confirm these participant details.
          </label>
          <button
            className="button"
            disabled={busy || !ack || !navigator.onLine}
          >
            Save eligibility and rule acknowledgment
          </button>
        </form>
      )}
      {!choices.length && (
        <p>
          No agreement is available for you to sign yet. The organizer must
          publish the reviewed text and independently confirm a minor’s
          guardian; that guardian must sign in separately.
        </p>
      )}
      {choices.length > 1 && (
        <label>
          Agreement to sign
          <select
            value={
              activeChoice
                ? `${activeChoice.participant_id}/${activeChoice.waiver_id}`
                : ""
            }
            disabled={busy}
            onChange={(e) => {
              setSigningKey(e.target.value);
              setSignature("");
              setRelationship("");
              setAccept(false);
            }}
          >
            {choices.map((o) => (
              <option
                key={`${o.participant_id}/${o.waiver_id}`}
                value={`${o.participant_id}/${o.waiver_id}`}
              >
                {o.participant_name} · {o.capacity}
              </option>
            ))}
          </select>
        </label>
      )}
      {choices
        .filter((o) => o === activeChoice)
        .map((o) => (
          <form
            key={`${o.participant_id}/${o.waiver_id}`}
            onSubmit={async (e) => {
              e.preventDefault();
              if (!supabase || !accept) return;
              setBusy(true);
              try {
                const { error } = await supabase.rpc("sign_agreement", {
                  c: o.club_id,
                  s: o.season_id,
                  participant: o.participant_id,
                  waiver: o.waiver_id,
                  expected_hash: o.sha256,
                  signer_name: signature,
                  relationship: relationship || null,
                  adult_signer: accept,
                  accepted: accept,
                });
                if (error) throw error;
                await refresh();
                setMessage(
                  "Signature recorded. Download your exact signed agreement below. Membership approval remains separate.",
                );
              } catch {
                setMessage(
                  "Signature not confirmed. Refresh to check the current agreement and signing account.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <h3>
              {o.participant_name} · version {o.version} ·{" "}
              {o.capacity === "guardian"
                ? "Parent/legal guardian"
                : "Adult participant"}
            </h3>
            <pre
              className="waiver-text"
              style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
            >
              {o.body}
            </pre>
            <label>
              Signer’s full legal name
              <input
                required
                maxLength={150}
                value={signature}
                disabled={busy}
                onChange={(e) => {
                  setSignature(e.target.value);
                  setAccept(false);
                }}
              />
            </label>
            {o.capacity === "guardian" && (
              <label>
                Relationship to participant
                <input
                  required
                  minLength={2}
                  maxLength={100}
                  value={relationship}
                  disabled={busy}
                  onChange={(e) => setRelationship(e.target.value)}
                />
              </label>
            )}
            <label className="check-label">
              <input
                type="checkbox"
                checked={accept}
                disabled={busy}
                onChange={(e) => setAccept(e.target.checked)}
              />
              I am 18 or older, have read this complete agreement, and intend my
              typed name as my electronic signature
              {o.capacity === "guardian"
                ? " as the participant’s authorized parent/legal guardian"
                : ""}
              .
            </label>
            <button
              className="button primary"
              disabled={busy || !accept || !navigator.onLine}
            >
              Sign this agreement
            </button>
          </form>
        ))}
      {receipts.map((r) => (
        <p key={r.id}>
          <button
            className="button"
            onClick={() => {
              const content = `Signed agreement receipt ${r.id}\nParticipant: ${r.participant_name}\nSigner: ${r.signer_name}\nCapacity: ${r.signer_capacity}\nSigned: ${r.signed_at}\nSHA-256: ${r.sha256}\n\n${r.body}`;
              const url = URL.createObjectURL(
                new Blob([content], { type: "text/plain;charset=utf-8" }),
              );
              const a = document.createElement("a");
              a.href = url;
              a.download = `agreement-${r.id}.txt`;
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
          >
            Download signed agreement ·{" "}
            {new Date(r.signed_at).toLocaleDateString()}
          </button>
        </p>
      ))}
      <p role="status">{message}</p>
    </section>
  );
}
