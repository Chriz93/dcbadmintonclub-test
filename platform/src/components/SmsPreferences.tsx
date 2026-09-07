import { useState } from "react";
import { supabase } from "../services/auth";
export function SmsPreferences({ club }: { club: string }) {
  const [phone, setPhone] = useState(""),
    [code, setCode] = useState(""),
    [busy, setBusy] = useState(false),
    [sent, setSent] = useState(false),
    [message, setMessage] = useState("");
  return (
    <details>
      <summary>Text-message reminders</summary>
      <p>
        Optional. Verify a phone number you control before enabling SMS. You can
        disable SMS here at any time. Text delivery requires the club’s SMS
        service to be configured.
      </p>
      <label>
        Mobile number with country code
        <input
          type="tel"
          placeholder="+16135550123"
          value={phone}
          disabled={busy || sent}
          onChange={(e) => setPhone(e.target.value)}
        />
      </label>
      <button
        className="button"
        disabled={busy || sent || !/^\+[1-9]\d{7,14}$/.test(phone)}
        onClick={async () => {
          if (!supabase) return;
          setBusy(true);
          try {
            const { error } = await supabase.auth.updateUser({ phone });
            if (error) throw error;
            setSent(true);
            setMessage(
              "Verification requested. Enter the code sent to your phone.",
            );
          } catch {
            setMessage(
              "SMS verification is unavailable or the request failed. Email reminders remain available.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        Send phone verification code
      </button>
      {sent && (
        <>
          <label>
            Phone verification code
            <input
              value={code}
              inputMode="numeric"
              autoComplete="one-time-code"
              disabled={busy}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          <button
            className="button"
            disabled={busy || !code}
            onClick={async () => {
              if (!supabase) return;
              setBusy(true);
              try {
                const { error } = await supabase.auth.verifyOtp({
                  phone,
                  token: code,
                  type: "phone_change",
                });
                if (error) throw error;
                setSent(false);
                setCode("");
                setMessage(
                  "Phone verified. Enable SMS below if you want text reminders.",
                );
              } catch {
                setMessage(
                  "Verification failed. Check the code or request a new one.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            Verify phone
          </button>
        </>
      )}
      {[true, false].map((enabled) => (
        <button
          key={String(enabled)}
          className="button"
          disabled={busy || !club || !navigator.onLine}
          onClick={async () => {
            if (!supabase) return;
            setBusy(true);
            const { error } = await supabase.rpc("set_sms_preference", {
              c: club,
              enabled,
            });
            setMessage(
              error
                ? "Preference not saved. Active membership and a verified phone are required."
                : enabled
                  ? "SMS reminders enabled."
                  : "SMS reminders disabled.",
            );
            setBusy(false);
          }}
        >
          {enabled ? "I opt in to SMS reminders" : "Disable SMS reminders"}
        </button>
      ))}
      <p role="status">{message}</p>
    </details>
  );
}
