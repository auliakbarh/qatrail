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
  createUserTest: "User test created",
  updateUserTest: "User test updated",
  deleteUserTest: "User test deleted",
};

// Mutations worth broadcasting (project-domain actions). Excludes login/logout,
// user management, settings, and notification reads.
export const NOTIFIABLE = new Set(Object.keys(LABELS));

export interface DiscordDetail {
  name?: string | null; // entity name/title
  note?: string | null; // reason / note / clarification
  url?: string | null; // deep link (e.g. issue)
  extra?: { name: string; value: string }[]; // extra inline fields
}

// Post a formatted embed to the admin-configured Discord webhook.
// Fire-and-forget: never throws into the caller. No-op when disabled/unset.
export async function notifyDiscord(field: string, actor: string | null, detail: DiscordDetail = {}): Promise<void> {
  try {
    const s = await prisma.setting.findUnique({ where: { id: "singleton" } });
    if (!s?.discordEnabled || !s.discordWebhookUrl) return;
    const title = LABELS[field] ?? field;
    // Pick an accent color by action kind for quick scanning.
    const color = field.startsWith("delete") || field === "issueReject"
      ? 0xe03131 // red
      : field.startsWith("create") || field === "issueSolve"
        ? 0x2f9e44 // green
        : 0x1971c2; // blue (updates / workflow)

    const fields: { name: string; value: string; inline?: boolean }[] = [
      { name: "Actor", value: actor ?? "system", inline: true },
    ];
    if (detail.name) fields.push({ name: "Item", value: detail.name.slice(0, 256), inline: true });
    fields.push({ name: "Action", value: `\`${field}\``, inline: true });
    for (const e of detail.extra ?? []) fields.push({ name: e.name, value: e.value.slice(0, 256), inline: true });
    if (detail.note) fields.push({ name: "Note", value: detail.note.slice(0, 512) });
    if (detail.url) fields.push({ name: "Link", value: detail.url });

    const body = {
      embeds: [
        {
          title: detail.name ? `${title}: ${detail.name.slice(0, 100)}` : title,
          url: detail.url || env.frontendBaseUrl,
          color,
          fields,
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
