import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "../services/auth";
import { Card } from "./ui";
import { SeasonIntake } from "./SeasonIntake";
import { AgreementSigning } from "./AgreementSigning";

export function RegistrationFlow({ onRefresh }: { onRefresh: () => void }) {
  const [step, setStep] = useState("details");
  const [agreementOpened, setAgreementOpened] = useState(false);
  const [agreementKey, setAgreementKey] = useState(0);
  function showStep(next: string) {
    if (next === "agreement") setAgreementOpened(true);
    setStep(next);
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">SIGNED IN · LET’S GET YOU READY</p>
          <h1>Your registration</h1>
        </div>
      </div>
      <p>
        Enter your information and submit a registration request. Sign this
        season’s agreement, then wait for Christy to approve your place. Christy
        sets your initial ladder seed after approval.
      </p>
      <nav className="registration-steps" aria-label="Registration steps">
        {[
          ["details", "1", "Player details"],
          ["agreement", "2", "Season agreement"],
          ["review", "3", "Approval status"],
        ].map(([key, number, label]) => (
          <button
            key={key}
            aria-current={step === key ? "step" : undefined}
            onClick={() => showStep(key)}
          >
            <span>{number}</span>
            {label}
          </button>
        ))}
      </nav>
      <div hidden={step !== "details"}>
        <Card>
          <p>
            Here to sign for your child?{" "}
            <button
              className="text-button"
              onClick={() => showStep("agreement")}
            >
              Go to guardian signing
            </button>
          </p>
          <SeasonIntake
            onSaved={() => {
              setAgreementKey((k) => k + 1);
              showStep("agreement");
            }}
          />
        </Card>
      </div>
      {agreementOpened && (
        <div hidden={step !== "agreement"}>
          <Card>
            <AgreementSigning key={agreementKey} />
            <button
              className="button primary"
              onClick={() => showStep("review")}
            >
              View approval status
            </button>
          </Card>
        </div>
      )}
      {step === "review" && (
        <RegistrationStatus
          onRefresh={onRefresh}
          onDetails={() => showStep("details")}
        />
      )}
    </>
  );
}

function RegistrationStatus({
  onRefresh,
  onDetails,
}: {
  onRefresh: () => void;
  onDetails: () => void;
}) {
  const [rows, setRows] = useState<{ season: string; status: string }[]>([]);
  const [retry, setRetry] = useState(0);
  const [message, setMessage] = useState("Loading your registration status…");
  useEffect(() => {
    let alive = true;
    setMessage("Loading your registration status…");
    void (async () => {
      const {
        data: { user },
        error,
      } = await supabase!.auth.getUser();
      if (error || !user) throw new Error();
      const result = await supabase!
        .from("registrations")
        .select("status,season:seasons(name)")
        .eq("user_id", user.id)
        .abortSignal(AbortSignal.timeout(12000));
      if (result.error) throw result.error;
      const data = z
        .array(
          z.object({
            status: z.string(),
            season: z.object({ name: z.string() }).nullable(),
          }),
        )
        .parse(result.data);
      if (alive) {
        setRows(
          data.map((r) => ({
            season: r.season?.name ?? "League season",
            status: r.status,
          })),
        );
        setMessage(
          data.length
            ? ""
            : "No player registration is recorded yet. Guardians do not need a player registration to sign for a child.",
        );
      }
    })().catch(() => {
      if (alive)
        setMessage(
          "Registration status could not be loaded. Refresh and try again.",
        );
    });
    return () => {
      alive = false;
    };
  }, [retry]);
  return (
    <Card>
      <h2>Approval status</h2>
      {rows.map((r, i) => (
        <p key={i}>
          <strong>{r.season}</strong> ·{" "}
          {r.status === "pending" ? "Awaiting Christy’s review" : r.status}
        </p>
      ))}
      <p role="status">{message}</p>
      <p>
        Submitting details or signing does not automatically confirm a place.
        Christy verifies payment and the current season agreement, reviews
        guardian details where needed, and approves eligible players.
      </p>
      <p>
        Once approved, Home shows your sessions and previous matches. Standings
        shows your ELO once Christy saves the initial seeding.
      </p>
      <button
        className="button primary"
        onClick={() => {
          setRetry((n) => n + 1);
          onRefresh();
        }}
      >
        Refresh my membership
      </button>
      <button className="text-button" onClick={onDetails}>
        Review my details
      </button>
    </Card>
  );
}
