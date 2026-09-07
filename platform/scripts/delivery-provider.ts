/** Server only. Provider acceptance is not proof of delivery. */
export interface ProviderConfig {
  mode: "provider-sandbox" | "live";
  mailKey?: string;
  mailFrom?: string;
  twilioSid?: string;
  twilioToken?: string;
  smsFrom?: string;
  appUrl: string;
  allowRealRecipients: boolean;
  unsubscribeUrl?: string;
  senderContact?: string;
}
export interface ProviderJob {
  id: string;
  idempotency_key: string;
  template: string;
  channel: "email" | "sms";
}
export interface Target {
  email?: string;
  phone?: string;
  enabled: boolean;
}
export function notificationText(template: string, appUrl: string) {
  const messages: Record<string, string> = {
    "attendance.open":
      "Please confirm attendance for your upcoming badminton session.",
    "attendance.reminder":
      "Your attendance response is still missing or uncertain. Please respond before the 72-hour refund deadline.",
    "attendance.final":
      "Final reminder: please update attendance before the 72-hour refund deadline.",
    "spare.available":
      "A spare place may be available. Vote and submit your $20 payment reference in the app; confirmation requires verified payment and availability.",
    "spare.confirmed":
      "Your spare place is confirmed. Open the app for session details.",
    "spare.reconciliation":
      "Your payment needs administrator reconciliation; a place has not been confirmed.",
    "session.cancelled":
      "The school session has been cancelled. Check the app for your physical shuttlecock credit.",
  };
  return `${messages[template] ?? "Your league record has changed. Open the app for details."}\n${appUrl}\nManage reminders in Member hub. Reply STOP to stop texts.`;
}
export async function sendProvider(
  job: ProviderJob,
  target: Target,
  config: ProviderConfig,
  fetcher: typeof fetch = fetch,
) {
  if (!target.enabled) return { status: "suppressed" as const };
  if (config.mode === "live" && !config.allowRealRecipients)
    throw new Error("Live recipients are not enabled");
  if (
    config.mode === "live" &&
    (!config.unsubscribeUrl || !config.senderContact)
  )
    throw new Error("Sender contact and unsubscribe endpoint required");
  const text =
    notificationText(job.template, config.appUrl) +
    (config.senderContact ? `\n${config.senderContact}` : "") +
    (job.channel === "email" && config.unsubscribeUrl
      ? `\nUnsubscribe without signing in: ${config.unsubscribeUrl}`
      : "");
  if (job.channel === "sms") {
    if (config.mode !== "live") return { status: "suppressed" as const };
    if (
      !config.twilioSid ||
      !config.twilioToken ||
      !config.smsFrom ||
      !target.phone
    )
      throw new Error("SMS configuration missing");
    const response = await fetcher(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.twilioSid)}/Messages.json`,
      {
        method: "POST",
        signal: AbortSignal.timeout(15000),
        headers: {
          Authorization: `Basic ${Buffer.from(`${config.twilioSid}:${config.twilioToken}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: target.phone.startsWith("+") ? target.phone : `+${target.phone}`,
          From: config.smsFrom,
          Body: text,
        }),
      },
    );
    if (!response.ok) throw new Error("SMS provider did not accept message");
    const receipt = (await response.json()) as { sid?: string };
    if (!receipt.sid) throw new Error("Missing provider ID");
    return { status: "accepted" as const, id: receipt.sid };
  }
  if (!config.mailKey || !config.mailFrom)
    throw new Error("Email configuration missing");
  const to =
    config.mode === "provider-sandbox" ? "delivered@resend.dev" : target.email;
  if (!to) throw new Error("Missing email recipient");
  const response = await fetcher("https://api.resend.com/emails", {
    method: "POST",
    signal: AbortSignal.timeout(15000),
    headers: {
      Authorization: `Bearer ${config.mailKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": job.idempotency_key,
    },
    body: JSON.stringify({
      from: config.mailFrom,
      to: [to],
      subject: "Maplewood league update",
      ...(config.unsubscribeUrl
        ? {
            headers: {
              "List-Unsubscribe": `<${config.unsubscribeUrl}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
          }
        : {}),
      text,
    }),
  });
  if (!response.ok) throw new Error("Email provider did not accept message");
  const receipt = (await response.json()) as { id?: string };
  if (!receipt.id) throw new Error("Missing provider ID");
  return { status: "accepted" as const, id: receipt.id };
}
