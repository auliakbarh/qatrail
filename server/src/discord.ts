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
  approveTestCase: "Test case approved",
  approveTestCases: "Test cases approved (bulk)",
  rejectTestCase: "Test case rejected",
  setTestCaseActive: "Test case active flag change requested",
  approveApprovalRequest: "Change approved",
  approveApprovalRequests: "Changes approved (bulk)",
  rejectApprovalRequest: "Change rejected",
  cancelApprovalRequest: "Change request withdrawn",
  setProjectActive: "Project active flag change requested",
  setFeatureActive: "Feature active flag change requested",
  createRecordTest: "Record test added",
  createRecordTests: "Test results recorded (bulk)",
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
  bulkRetest: "Issues retested (bulk)",
  setIssueArchived: "Issue archive toggled",
  setProductionIssue: "Production issue flag toggled",
  setIssueScope: "Issue app test / session changed",
  createUserTest: "User test created",
  createPublicApiClient: "Public API client created",
  updatePublicApiClient: "Public API client updated",
  revokePublicApiClient: "Public API client revoked",
  updateUserTest: "User test updated",
  deleteUserTest: "User test deleted",
  createSessionTest: "Testing session created",
  updateSessionTest: "Testing session updated",
  deleteSessionTest: "Testing session deleted",
  closeSessionTest: "Testing session closed",
  moveAppTestProject: "App test moved to another project",
};

// Mutations worth broadcasting (project-domain actions). Excludes login/logout,
// user management, settings, and notification reads.
export const NOTIFIABLE = new Set(Object.keys(LABELS));

// Non-mutation events that reuse the same embed. Deliberately outside LABELS so
// they never join NOTIFIABLE — nothing here is a GraphQL field.
const EVENT_LABELS: Record<string, string> = {
  jiraCommentFailed: "⚠️ JIRA comment failed",
  ssoUserProvisioned: "👤 New account from Microsoft sign-in",
};

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
    const title = LABELS[field] ?? EVENT_LABELS[field] ?? field;
    // Pick an accent color by action kind for quick scanning.
    const color = EVENT_LABELS[field] || field.startsWith("delete") || field === "issueReject"
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
