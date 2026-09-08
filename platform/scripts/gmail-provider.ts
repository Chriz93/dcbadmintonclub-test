/** Server-only Gmail transport. SMTP has no provider idempotency guarantee. */
import nodemailer from "nodemailer";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  notificationText,
  type ProviderJob,
  type Target,
} from "./delivery-provider.ts";
export interface GmailConfig {
  user: string;
  password: string;
  appUrl: string;
  unsubscribeUrl: string;
  senderContact: string;
  allowRealRecipients: boolean;
}
export function gmailTransport(user: string, password: string) {
  if (
    !z.email().safeParse(user).success ||
    !user.endsWith("@gmail.com") ||
    !/^[a-z]{16}$/.test(password)
  )
    throw new Error("Valid Gmail account and app password required");
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass: password },
    tls: { rejectUnauthorized: true, minVersion: "TLSv1.2" },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    logger: false,
    debug: false,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
}
/**
 * True only when nodemailer reports the failure at a stage before the message body was
 * transmitted (connection, greeting, TLS, authentication, envelope). Those attempts cannot
 * have produced a delivered email, so the worker may release the durable send marker and
 * retry later. Anything at or after DATA, or without a stage, stays "uncertain".
 */
export function isPreSubmissionFailure(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const command = (error as { command?: unknown }).command;
  if (typeof command !== "string") return false;
  return /^(CONN|API|EHLO|HELO|STARTTLS|AUTH\b.*|MAIL FROM|RCPT TO)$/.test(
    command,
  );
}
export async function sendGmail(
  job: ProviderJob,
  target: Target,
  config: GmailConfig,
  transport?: Pick<ReturnType<typeof gmailTransport>, "sendMail">,
) {
  if (!target.enabled || job.channel === "sms")
    return { status: "suppressed" as const };
  if (!config.allowRealRecipients)
    throw new Error("Real recipients are not enabled");
  const email = z.email().parse(target.email);
  for (const address of [config.appUrl, config.unsubscribeUrl]) {
    const url = new URL(address);
    if (url.protocol !== "https:" || url.username || url.password)
      throw new Error("HTTPS delivery links required");
  }
  if (
    new URL(config.unsubscribeUrl).pathname !== "/unsubscribe" ||
    !config.senderContact.trim()
  )
    throw new Error("Sender contact and unsubscribe required");
  // Stable Message-ID aids reconciliation; it does NOT make SMTP idempotent.
  const messageId = `<${createHash("sha256").update(job.idempotency_key).digest("hex")}@gmail.com>`;
  const sender = transport ?? gmailTransport(config.user, config.password);
  const receipt = await sender.sendMail({
    from: { name: "Maplewood Advanced Badminton League", address: config.user },
    to: email,
    subject: "Maplewood league update",
    messageId,
    text:
      notificationText(job.template, config.appUrl) +
      `\n${config.senderContact}\nUnsubscribe without signing in: ${config.unsubscribeUrl}`,
    headers: {
      "List-Unsubscribe": `<${config.unsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  if (!receipt.accepted?.length || receipt.rejected?.length)
    throw new Error("SMTP outcome requires reconciliation");
  return { status: "accepted" as const, id: messageId };
}
