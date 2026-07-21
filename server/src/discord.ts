import { prisma } from "./db.js";
import { logger } from "./logger.js";
import { env } from "./env.js";

const log = logger.child({ mod: "discord" });

// Human labels for mutation field names (fallback: the raw name).
const LABELS: Record<string, string> = {
  createProject: "Project created",
  updateProject: "Project updated",
  deleteProject: "Project deleted",
  createFeature: "Feature created",
  updateFeature: "Feature updated",
  deleteFeature: "Feature deleted",
  createTestCase: "Test case created",
  updateTestCase: "Test case updated",
  deleteTestCase: "Test case deleted",
  createRecordTest: "Record test added",
  deleteRecordTest: "Record test deleted",
  createIssue: "Issue created",
  updateIssue: "Issue updated",
  deleteIssue: "Issue deleted",
  issueAccept: "Issue accepted",
  issueReject: "Issue rejected",
  issueNeedClarify: "Issue needs clarification",
  issueSolve: "Issue solved (need review)",
  issueHold: "Issue on hold",
  issueResume: "Issue resumed",
  issueClarifyRespond: "Clarification provided",
  issueReview: "Issue reviewed",
  setIssueArchived: "Issue archive toggled",
};

// Mutations worth broadcasting (project-domain actions). Excludes login/logout,
// user management, settings, and notification reads.
export const NOTIFIABLE = new Set(Object.keys(LABELS));

// Post a formatted embed to the admin-configured Discord webhook.
// Fire-and-forget: never throws into the caller. No-op when disabled/unset.
export async function notifyDiscord(field: string, actor: string | null): Promise<void> {
  try {
    const s = await prisma.setting.findUnique({ where: { id: "singleton" } });
    if (!s?.discordEnabled || !s.discordWebhookUrl) return;
    const title = LABELS[field] ?? field;
    // Pick an accent color by action kind for quick scanning.
    const color = field.startsWith("delete")
      ? 0xe03131 // red
      : field.startsWith("create") || field === "issueSolve" || field === "issueReview"
        ? 0x2f9e44 // green
        : 0x1971c2; // blue (updates / workflow)
    const body = {
      embeds: [
        {
          title,
          url: env.frontendBaseUrl,
          color,
          fields: [
            { name: "Actor", value: actor ?? "system", inline: true },
            { name: "Action", value: `\`${field}\``, inline: true },
          ],
          footer: { text: "QA Reporting" },
          timestamp: new Date().toISOString(),
        },
      ],
    };
    const res = await fetch(s.discordWebhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) log.warn({ status: res.status }, "discord webhook failed");
  } catch (err) {
    log.error({ err }, "discord notify error");
  }
}

// Send a plain test message (admin "Test send" button).
export async function sendDiscordTest(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "✅ QA Reporting — Discord webhook test OK" }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
