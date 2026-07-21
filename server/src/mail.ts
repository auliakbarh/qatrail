import { logger } from "./logger.js";
import { env } from "./env.js";

const log = logger.child({ mod: "mail" });

// Password-reset email. Transport seam: integrate the Acacia email service here
// (see requirement doc). For now, when ACACIA_URL is unset it logs the reset
// link so the flow is testable in dev without an external service.
// ponytail: single email type — inline HTML, no template engine.
export async function sendPasswordResetEmail(to: string, resetUrl: string, name: string): Promise<boolean> {
  const acaciaUrl = process.env.ACACIA_URL;
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto">
      <h2>QA Reporting — Reset Password</h2>
      <p>Hi ${escapeHtml(name)},</p>
      <p>Click below to set a new password. This link expires in 1 hour.</p>
      <p><a href="${resetUrl}">Reset password</a></p>
      <p style="color:#999;font-size:12px;word-break:break-all">${resetUrl}</p>
    </div>`;

  if (!acaciaUrl) {
    log.warn({ to, resetUrl }, "ACACIA_URL unset — reset link logged instead of emailed (dev)");
    return false;
  }
  try {
    const res = await fetch(acaciaUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(process.env.ACACIA_API_KEY && { authorization: `Bearer ${process.env.ACACIA_API_KEY}` }),
      },
      body: JSON.stringify({
        to,
        subject: `${env.isProd ? "" : "[dev] "}Reset your QA Reporting password`,
        html,
      }),
    });
    if (!res.ok) {
      log.error({ status: res.status, to }, "acacia send failed");
      return false;
    }
    return true;
  } catch (err) {
    log.error({ err, to }, "acacia send error");
    return false;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
