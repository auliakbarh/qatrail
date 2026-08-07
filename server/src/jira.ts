// Minimal JIRA REST client: markdown → ADF + post/edit a formatted comment.
// Ported from the HQR reference project. JIRA is optional — every function
// degrades gracefully (returns null) when credentials are absent.
import { env, hasJiraCreds } from "./env.js";
import { logger } from "./logger.js";
import { notifyDiscord } from "./discord.js";

const log = logger.child({ mod: "jira" });

// A JIRA post failing is silent otherwise: both callers just get null and carry
// on, so the comment is simply missing. Report it on the same Discord webhook as
// the mutations. Fire-and-forget like notifyDiscord itself — never throws.
// ponytail: reuses the mutation embed; `field` is not a real mutation name, so
// it falls through to the raw-name title.
function reportJiraFailure(op: string, jiraKey: string, reason: string): void {
  void notifyDiscord("jiraCommentFailed", "system", {
    name: jiraKey,
    note: reason.slice(0, 512),
    extra: [{ name: "Operation", value: op }],
  });
}

function authHeader(): string {
  return "Basic " + Buffer.from(`${env.jira.email}:${env.jira.apiToken}`).toString("base64");
}

// JIRA localises error bodies to the authenticating account's profile language
// unless asked otherwise, which is how a failure reached Discord in Chinese.
// Pin English so the alert is readable regardless of whose token is configured.
function headers(): Record<string, string> {
  return {
    Authorization: authHeader(),
    Accept: "application/json",
    "Accept-Language": "en-US,en;q=0.9",
    "Content-Type": "application/json",
  };
}

/** Squad code = the ticket-key prefix (ATH-901 -> ATH). "" if no dash. */
export function squadFromKey(jiraKey: string): string {
  const m = jiraKey.trim().toUpperCase().match(/^([A-Z]+)-\d+/);
  return m ? m[1] : (jiraKey.trim().toUpperCase().split("-")[0] ?? "");
}

// --- Markdown -> ADF (Atlassian Document Format) -------------------------
interface ADFNode {
  type: string;
  [k: string]: unknown;
}
const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const LIST_RE = /^\s*[-*]\s+(.*)$/;
const TABLE_ROW_RE = /^\s*\|.*\|\s*$/;
const TABLE_SEP_RE = /^\s*\|?[\s:|-]+\|?\s*$/;

function inlineNodes(text: string): ADFNode[] {
  const nodes: ADFNode[] = [];
  const re = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push({ type: "text", text: text.slice(last, m.index) });
    if (m[1] !== undefined) nodes.push({ type: "text", text: m[1], marks: [{ type: "link", attrs: { href: m[2] } }] });
    else nodes.push({ type: "text", text: m[3], marks: [{ type: "strong" }] });
    last = re.lastIndex;
  }
  if (last < text.length) nodes.push({ type: "text", text: text.slice(last) });
  return nodes.filter((n) => (n as any).text !== "");
}
function paragraphFromLines(lines: string[]): ADFNode {
  const content: ADFNode[] = [];
  for (const line of lines) {
    const inline = inlineNodes(line);
    if (!inline.length) continue;
    if (content.length) content.push({ type: "hardBreak" });
    content.push(...inline);
  }
  return { type: "paragraph", content };
}
function splitCells(row: string): string[] {
  return row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
}

export function toADF(text: string): object {
  const lines = (text ?? "").replace(/\r\n/g, "\n").split("\n");
  const content: ADFNode[] = [];
  let i = 0;
  const isTableStart = (idx: number) =>
    TABLE_ROW_RE.test(lines[idx]) &&
    idx + 1 < lines.length &&
    TABLE_SEP_RE.test(lines[idx + 1]) &&
    lines[idx + 1].includes("-");

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") { i++; continue; }
    const h = line.match(HEADING_RE);
    if (h) { content.push({ type: "heading", attrs: { level: Math.min(h[1].length, 6) }, content: inlineNodes(h[2].trim()) }); i++; continue; }
    if (isTableStart(i)) {
      const header = splitCells(lines[i]);
      i += 2;
      const rows: ADFNode[] = [{ type: "tableRow", content: header.map((c) => ({ type: "tableHeader", content: [paragraphFromLines([c])] })) }];
      while (i < lines.length && TABLE_ROW_RE.test(lines[i])) {
        const cells = splitCells(lines[i]);
        rows.push({ type: "tableRow", content: cells.map((c) => ({ type: "tableCell", content: [paragraphFromLines([c])] })) });
        i++;
      }
      content.push({ type: "table", attrs: { isNumberColumnEnabled: false, layout: "default" }, content: rows });
      continue;
    }
    if (LIST_RE.test(line)) {
      const items: ADFNode[] = [];
      while (i < lines.length && LIST_RE.test(lines[i])) {
        items.push({ type: "listItem", content: [paragraphFromLines([lines[i].match(LIST_RE)![1]])] });
        i++;
      }
      content.push({ type: "bulletList", content: items });
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !HEADING_RE.test(lines[i]) && !LIST_RE.test(lines[i]) && !isTableStart(i)) {
      para.push(lines[i]); i++;
    }
    if (para.length) content.push(paragraphFromLines(para));
  }
  if (!content.length) content.push({ type: "paragraph", content: [] });
  return { type: "doc", version: 1, content };
}

const base = () => env.jira.baseUrl.replace(/\/+$/, "");

/** Who pressed the button in QATrail, for the comment footer. */
export interface PostedBy {
  name: string;
  email: string;
  at: Date;
}

/**
 * Every comment ends with this line. JIRA shows the service account as author
 * and stamps its own timestamp in each reader's timezone, so without it a
 * comment cannot be traced to a person or to a moment the team agrees on.
 * Jakarta is the team's clock — printed reports do the same on the client.
 */
export function postedFooter(by: PostedBy, url: string, linkLabel = "QA Reporting"): string {
  const when = by.at.toLocaleString("en-GB", {
    timeZone: "Asia/Jakarta",
    dateStyle: "medium",
    timeStyle: "short",
  });
  return `Posted by **${by.name}** (${by.email}) on ${when} WIB via [${linkLabel}](${url})`;
}

export interface JiraTestResult {
  ok: boolean;
  message: string;
}

/**
 * Admin connectivity check. Without a ticket key it only asks JIRA who the
 * configured credentials belong to; with one it also posts a throwaway comment,
 * so an admin can prove the whole path (auth + project permission + ADF) works
 * without inventing an Issue first.
 */
export async function testJira(jiraKey: string | null | undefined, by: PostedBy): Promise<JiraTestResult> {
  if (!hasJiraCreds()) {
    return { ok: false, message: "JIRA is not configured (JIRA_BASE_URL / JIRA_EMAIL / JIRA_API_TOKEN)." };
  }
  let who: string;
  try {
    const res = await fetch(`${base()}/rest/api/3/myself`, { headers: headers() });
    if (!res.ok) {
      const body = (await res.text().catch(() => "")).slice(0, 200);
      log.warn({ status: res.status }, "jira test auth failed");
      return { ok: false, message: `Authentication failed — HTTP ${res.status}. ${body}` };
    }
    const me = await res.json();
    who = `${me?.displayName ?? "unknown"} (${me?.emailAddress ?? "no email"})`;
  } catch (err) {
    log.error({ err }, "jira test auth error");
    return { ok: false, message: `Could not reach ${base()} — ${String(err)}` };
  }
  const key = (jiraKey ?? "").trim().toUpperCase();
  if (!key) return { ok: true, message: `Connected to ${base()} as ${who}.` };

  const id = await addComment(key, toADF(testCommentMarkdown(by)));
  return id
    ? { ok: true, message: `Connected as ${who}. Test comment ${id} posted to ${key}.` }
    : {
        ok: false,
        // addComment already logged the JIRA body and fired the Discord alert.
        message: `Connected as ${who}, but posting to ${key} failed. Check the key and your project permission — the JIRA error is in the server log and the Discord alert.`,
      };
}

function testCommentMarkdown(by: PostedBy): string {
  return [
    "**QA Reporting — connection test**",
    "",
    "Sent from the admin settings page to verify the JIRA integration.",
    "Safe to delete.",
    "",
    postedFooter(by, env.frontendBaseUrl),
  ].join("\n");
}

/** Create a comment. Returns comment id or null. */
export async function addComment(jiraKey: string, adf: object): Promise<string | null> {
  if (!hasJiraCreds()) return null;
  try {
    const res = await fetch(`${base()}/rest/api/3/issue/${encodeURIComponent(jiraKey)}/comment`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ body: adf }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      log.warn({ status: res.status, jiraKey, body }, "jira addComment failed");
      reportJiraFailure("addComment", jiraKey, `HTTP ${res.status} ${body}`);
      return null;
    }
    return (await res.json())?.id ?? null;
  } catch (err) {
    log.error({ err, jiraKey }, "jira addComment error");
    reportJiraFailure("addComment", jiraKey, String(err));
    return null;
  }
}

/** Edit an existing comment (idempotent re-post). Returns id on success, else null. */
export async function updateComment(jiraKey: string, commentId: string, adf: object): Promise<string | null> {
  if (!hasJiraCreds()) return null;
  try {
    const res = await fetch(`${base()}/rest/api/3/issue/${encodeURIComponent(jiraKey)}/comment/${commentId}`, {
      method: "PUT",
      headers: headers(),
      body: JSON.stringify({ body: adf }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      log.warn({ status: res.status, jiraKey, body }, "jira updateComment failed");
      // 404 = the comment we remember is gone (deleted in JIRA). That is a
      // recoverable state upsertComment handles by posting a fresh one, so it
      // must not raise an alert; anything else is a real problem.
      if (res.status !== 404) reportJiraFailure("updateComment", jiraKey, `HTTP ${res.status} ${body}`);
      return null;
    }
    return (await res.json())?.id ?? commentId;
  } catch (err) {
    log.error({ err, jiraKey }, "jira updateComment error");
    reportJiraFailure("updateComment", jiraKey, String(err));
    return null;
  }
}

/**
 * Re-post: edit the comment we wrote before, or create a fresh one when that
 * edit can't land. Someone deleting our comment in JIRA must not leave the
 * issue permanently unable to re-post, so the create is the fallback rather
 * than an error. Returns the id to store, or null when JIRA refused both.
 */
export async function upsertComment(
  jiraKey: string,
  commentId: string | null,
  adf: object,
): Promise<string | null> {
  if (commentId) {
    const id = await updateComment(jiraKey, commentId, adf);
    if (id) return id;
    log.info({ jiraKey, commentId }, "jira comment gone — posting a new one");
  }
  return addComment(jiraKey, adf);
}

export interface IssueComment {
  url: string; // deep link to the issue in this app
  type: string;
  environment: string;
  platform: string;
  appVersion?: string | null;
  backendVersion?: string | null;
  priority: string;
  testedAt: Date;
  testAccount: string;
  reporterName: string;
  assigneeName: string;
  title: string;
  steps: string;
  actualResult: string;
  expectedResult: string;
  note?: string | null;
  sessionKey?: string | null; // ST-<n> when found in a testing session
  postedBy: PostedBy;
}

export interface AppTestComment {
  url: string; // deep link to the app test in this app
  key: string; // APP-<n>
  status: string;
  projectName: string;
  environment: string;
  platform: string;
  appVersion?: string | null;
  backendVersion?: string | null;
  creatorName: string;
  downloadLink: string;
  createdAt: Date;
  doneAt?: Date | null;
  passPercent: number;
  assignedCount: number;
  issueCount: number;
  note?: string | null;
  postedBy: PostedBy;
  cases: { key: string; name: string; feature: string; status: string; issueCount: number }[];
}

export function appTestMarkdown(c: AppTestComment): string {
  const cell = (s: string) => (s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
  const platform = c.platform + (c.appVersion ? ` · app ${c.appVersion}` : "");
  const rows = [
    ["Project", c.projectName],
    ["Status", c.status],
    ["Environment", c.environment],
    ["Platform", platform],
    ...(c.backendVersion ? [["Backend version", c.backendVersion]] : []),
    ["Created by", c.creatorName],
    ["Created at", c.createdAt.toISOString()],
    ...(c.doneAt ? [["Done at", c.doneAt.toISOString()]] : []),
    ["Pass rate", `${c.passPercent}%`],
    ["Test cases", String(c.assignedCount)],
    ["Issues", String(c.issueCount)],
    ["Download", `[link](${c.downloadLink})`],
  ];
  const md = [
    `## 📱 App Test ${cell(c.key)}`,
    "",
    `| Field | Value |`,
    `| --- | --- |`,
    ...rows.map(([k, v]) => `| ${cell(k)} | ${cell(v)} |`),
  ];
  if (c.cases.length) {
    md.push(
      "",
      `**Test case results (${c.cases.length})**`,
      "",
      `| Test case | Feature | Status | Issues |`,
      `| --- | --- | --- | --- |`,
      ...c.cases.map((r) => `| ${cell(r.key)} — ${cell(r.name)} | ${cell(r.feature)} | ${cell(r.status)} | ${r.issueCount} |`),
    );
  }
  if (c.note) md.push("", `**Note**`, c.note);
  md.push("", postedFooter(c.postedBy, c.url));
  return md.join("\n");
}

export function issueMarkdown(c: IssueComment): string {
  const cell = (s: string) => (s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
  const platform = c.platform + (c.appVersion ? ` · app ${c.appVersion}` : "");
  const rows = [
    ["Type", c.type],
    ["Environment", c.environment],
    ["Platform", platform],
    ...(c.backendVersion ? [["Backend version", c.backendVersion]] : []),
    ["Priority", c.priority],
    ["Tested at", c.testedAt.toISOString()],
    ["Test account", c.testAccount],
    ["Reporter (QA)", c.reporterName],
    ["Assigned to", c.assigneeName],
    ...(c.sessionKey ? [["Testing session", c.sessionKey]] : []),
  ];
  return [
    `## 🐞 QA Issue: ${cell(c.title)}`,
    "",
    `| Field | Value |`,
    `| --- | --- |`,
    ...rows.map(([k, v]) => `| ${cell(k)} | ${cell(v)} |`),
    "",
    `**Steps to reproduce**`,
    c.steps,
    "",
    `**Actual result**`,
    c.actualResult,
    "",
    `**Expected result**`,
    c.expectedResult,
    ...(c.note ? ["", `**Note**`, c.note] : []),
    "",
    postedFooter(c.postedBy, c.url, "Open issue in QA Reporting"),
  ].join("\n");
}
