import { it, expect, vi } from "vitest";
import { sendGmail, gmailTransport } from "../scripts/gmail-provider";
const job = {
  id: "synthetic",
  idempotency_key: "synthetic-1",
  template: "attendance.reminder",
  channel: "email" as const,
};
const config = {
  user: "league@gmail.com",
  password: "abcdefghijklmnop",
  appUrl: "https://example.invalid",
  unsubscribeUrl: "https://example.invalid/unsubscribe?token=synthetic",
  senderContact: "Christy — synthetic contact",
  allowRealRecipients: true,
};
const target = { email: "player@example.invalid", enabled: true };
it("Gmail suppression and disabled live mode perform no network calls", async () => {
  const t = { sendMail: vi.fn() };
  expect(
    await sendGmail(job, { ...target, enabled: false }, config, t),
  ).toEqual({ status: "suppressed" });
  expect(
    await sendGmail({ ...job, channel: "sms" }, target, config, t),
  ).toEqual({ status: "suppressed" });
  await expect(
    sendGmail(job, target, { ...config, allowRealRecipients: false }, t),
  ).rejects.toThrow("not enabled");
  expect(t.sendMail).not.toHaveBeenCalled();
});
it("Gmail returns acceptance only with stable reconciliation ID and unsubscribe headers", async () => {
  const t = {
    sendMail: vi
      .fn()
      .mockResolvedValue({ accepted: [target.email], rejected: [] }),
  };
  const a = await sendGmail(job, target, config, t),
    b = await sendGmail(job, target, config, t);
  expect(a).toEqual(b);
  expect(a.status).toBe("accepted");
  const message = t.sendMail.mock.calls[0][0];
  expect(message.headers["List-Unsubscribe"]).toContain(
    "/unsubscribe?token=synthetic",
  );
  expect(message.from.address).toBe(config.user);
  expect(message.to).toBe(target.email);
  expect(message.text).not.toContain(config.password);
});
it("Gmail rejects unsafe links, header-injection recipients and incomplete sender details", async () => {
  const t = { sendMail: vi.fn() };
  for (const patch of [
    { appUrl: "http://example.invalid" },
    { unsubscribeUrl: "https://example.invalid/wrong" },
    { senderContact: "" },
  ])
    await expect(
      sendGmail(job, target, { ...config, ...patch }, t),
    ).rejects.toThrow();
  await expect(
    sendGmail(
      job,
      { ...target, email: "x@example.invalid\r\nBcc: other@example.invalid" },
      config,
      t,
    ),
  ).rejects.toThrow();
  expect(t.sendMail).not.toHaveBeenCalled();
});
it("Gmail ambiguous outcomes are errors requiring reconciliation", async () => {
  for (const result of [
    { accepted: [], rejected: [] },
    { accepted: [target.email], rejected: [target.email] },
  ])
    await expect(
      sendGmail(job, target, config, {
        sendMail: vi.fn().mockResolvedValue(result),
      }),
    ).rejects.toThrow("reconciliation");
  await expect(
    sendGmail(job, target, config, {
      sendMail: vi.fn().mockRejectedValue(new Error("timeout")),
    }),
  ).rejects.toThrow("timeout");
});
it("SMTP rejects malformed account/credentials before connecting", () => {
  expect(() =>
    gmailTransport("not-gmail@example.invalid", "abcdefghijklmnop"),
  ).toThrow();
  expect(() => gmailTransport("league@gmail.com", "wrong")).toThrow();
});
