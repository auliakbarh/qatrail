import type { Context } from "../context.js";
import { requireAuth, requireQA } from "../context.js";
import { encryptSecret, decryptSecret } from "../crypto.js";
import { env } from "../env.js";
import { notify } from "../notify.js";
import { toADF, addComment, updateComment, issueMarkdown } from "../jira.js";
import { cachedSlaTargets, classifyResolve } from "../sla.js";

type AttachKind = "IMAGE" | "VIDEO" | "MARKDOWN" | "JSON" | "DOC" | "XLS" | "CSV" | "PDF" | "OTHER";

interface IssueInput {
  testCaseId: string;
  recordTestId?: string | null;
  recreatedFromId?: string | null;
  type: "DEFECT" | "BUG";
  title: string;
  description: string;
  environment: "STAGING" | "PRODUCTION";
  platform: "ANDROID" | "IOS" | "WEB";
  appVersion?: string | null;
  backendVersion?: string | null;
  testAccount: string;
  testPassword?: string | null;
  testedAt: string;
  preconditions?: string | null;
  steps: string;
  actualResult: string;
  expectedResult: string;
  priority: "LOW" | "MEDIUM" | "HIGH";
  note?: string | null;
  assigneeId: string;
  attachments: { url: string; kind: AttachKind; label?: string | null }[];
}

// appVersion is required for mobile platforms (per requirement).
function validate(input: IssueInput) {
  if ((input.platform === "IOS" || input.platform === "ANDROID") && !input.appVersion?.trim()) {
    throw new Error("App version is required for iOS/Android platforms.");
  }
}

function encPw(pw?: string | null): string | null {
  return pw && pw.trim() ? encryptSecret(pw, env.secretEncKey) : null;
}

// Scalar fields shared by create/update (excludes relations + attachments).
function scalarData(input: IssueInput) {
  return {
    type: input.type,
    title: input.title.trim(),
    description: input.description,
    environment: input.environment,
    platform: input.platform,
    appVersion: input.appVersion ?? null,
    backendVersion: input.backendVersion ?? null,
    testAccount: input.testAccount,
    testedAt: new Date(input.testedAt),
    preconditions: input.preconditions ?? null,
    steps: input.steps,
    actualResult: input.actualResult,
    expectedResult: input.expectedResult,
    priority: input.priority,
    note: input.note ?? null,
    assigneeId: input.assigneeId,
  };
}

export const issueResolvers = {
  Query: {
    async issues(_: unknown, args: { testCaseId?: string; archived?: boolean }, ctx: Context) {
      requireAuth(ctx);
      return ctx.prisma.issue.findMany({
        where: {
          ...(args.testCaseId ? { testCaseId: args.testCaseId } : {}),
          ...(args.archived === undefined ? {} : { archived: args.archived }),
        },
        orderBy: { createdAt: "desc" },
      });
    },
    async issue(_: unknown, args: { id: string }, ctx: Context) {
      requireAuth(ctx);
      return ctx.prisma.issue.findUnique({ where: { id: args.id } });
    },
    async assignedToMe(_: unknown, __: unknown, ctx: Context) {
      const userId = requireAuth(ctx);
      return ctx.prisma.issue.findMany({
        where: { assigneeId: userId, archived: false },
        orderBy: { createdAt: "desc" },
      });
    },
  },
  Mutation: {
    async createIssue(_: unknown, args: { input: IssueInput }, ctx: Context) {
      const user = await requireQA(ctx);
      const { input } = args;
      validate(input);
      const issue = await ctx.prisma.issue.create({
        data: {
          ...scalarData(input),
          testCaseId: input.testCaseId,
          recordTestId: input.recordTestId ?? null,
          recreatedFromId: input.recreatedFromId ?? null,
          testPassword: encPw(input.testPassword),
          reporterId: user.id,
          attachments: {
            create: input.attachments.map((a, i) => ({
              order: i + 1,
              url: a.url,
              kind: a.kind,
              label: a.label ?? null,
            })),
          },
          history: {
            create: { kind: "created", toVal: "OPEN", byId: user.id },
          },
        },
      });
      // Notify the assigned engineer.
      await notify(input.assigneeId, "ASSIGNED", `Issue assigned to you: ${issue.title}`, issue.id);
      return issue;
    },
    async updateIssue(_: unknown, args: { id: string; input: IssueInput }, ctx: Context) {
      await requireQA(ctx);
      const { input } = args;
      validate(input);
      // Replace attachments wholesale. Only overwrite the password when a new one is given.
      return ctx.prisma.issue.update({
        where: { id: args.id },
        data: {
          ...scalarData(input),
          ...(input.testPassword && input.testPassword.trim()
            ? { testPassword: encPw(input.testPassword) }
            : {}),
          attachments: {
            deleteMany: {},
            create: input.attachments.map((a, i) => ({
              order: i + 1,
              url: a.url,
              kind: a.kind,
              label: a.label ?? null,
            })),
          },
        },
      });
    },
    async deleteIssue(_: unknown, args: { id: string }, ctx: Context) {
      await requireQA(ctx);
      await ctx.prisma.issue.delete({ where: { id: args.id } });
      return true;
    },

    // Post (or re-post/edit) a formatted comment on a JIRA ticket, containing
    // the issue deep-link + all fields. Idempotent via stored jiraCommentId.
    async postIssueToJira(_: unknown, args: { id: string; jiraKey: string }, ctx: Context) {
      await requireQA(ctx);
      const issue = await ctx.prisma.issue.findUnique({
        where: { id: args.id },
        include: { reporter: true, assignee: true },
      });
      if (!issue) throw new Error("Issue not found");
      const jiraKey = args.jiraKey.trim().toUpperCase();
      const adf = toADF(
        issueMarkdown({
          url: `${env.frontendBaseUrl}/issues/${issue.id}`,
          type: issue.type,
          environment: issue.environment,
          platform: issue.platform,
          appVersion: issue.appVersion,
          backendVersion: issue.backendVersion,
          priority: issue.priority,
          testedAt: issue.testedAt,
          testAccount: issue.testAccount,
          reporterName: issue.reporter.name,
          assigneeName: issue.assignee.name,
          title: issue.title,
          steps: issue.steps,
          actualResult: issue.actualResult,
          expectedResult: issue.expectedResult,
          note: issue.note,
        }),
      );
      // Edit the same comment if we posted before to this key; else create.
      const commentId =
        issue.jiraCommentId && issue.jiraKey === jiraKey
          ? await updateComment(jiraKey, issue.jiraCommentId, adf)
          : await addComment(jiraKey, adf);
      if (!commentId) throw new Error("Failed to post to JIRA (check credentials / ticket key).");
      return ctx.prisma.issue.update({
        where: { id: issue.id },
        data: { jiraKey, jiraCommentId: commentId },
      });
    },
  },
  Issue: {
    async featureId(i: any, _: unknown, ctx: Context) {
      const tc = await ctx.prisma.testCase.findUnique({ where: { id: i.testCaseId }, select: { featureId: true } });
      return tc?.featureId ?? null;
    },
    async projectId(i: any, _: unknown, ctx: Context) {
      const tc = await ctx.prisma.testCase.findUnique({
        where: { id: i.testCaseId },
        select: { feature: { select: { projectId: true } } },
      });
      return tc?.feature.projectId ?? null;
    },
    testedAt: (i: any) => i.testedAt.toISOString(),
    createdAt: (i: any) => i.createdAt.toISOString(),
    updatedAt: (i: any) => i.updatedAt.toISOString(),
    respondedAt: (i: any) => i.respondedAt?.toISOString() ?? null,
    resolvedAt: (i: any) => i.resolvedAt?.toISOString() ?? null,
    closedAt: (i: any) => i.closedAt?.toISOString() ?? null,
    // SLA status for production issues: MET | AT_RISK | BREACHED, else NA.
    async slaStatus(i: any) {
      if (i.environment !== "PRODUCTION") return "NA";
      const targets = await cachedSlaTargets();
      if (!targets[i.priority]) return "NA";
      return classifyResolve(i, targets, new Date()).toUpperCase().replace("ATRISK", "AT_RISK");
    },
    reporter: (i: any, _: unknown, ctx: Context) =>
      ctx.prisma.user.findUnique({ where: { id: i.reporterId } }),
    assignee: (i: any, _: unknown, ctx: Context) =>
      ctx.prisma.user.findUnique({ where: { id: i.assigneeId } }),
    attachments: (i: any, _: unknown, ctx: Context) =>
      ctx.prisma.issueAttachment.findMany({ where: { issueId: i.id }, orderBy: { order: "asc" } }),
    history: (i: any, _: unknown, ctx: Context) =>
      ctx.prisma.statusEvent.findMany({ where: { issueId: i.id }, orderBy: { at: "asc" } }),
    postmortem: (i: any, _: unknown, ctx: Context) =>
      ctx.prisma.postmortem.findUnique({ where: { issueId: i.id } }),
    // Decrypt on read for authorized users. Returns null when unset or undecryptable.
    testPassword: (i: any) => {
      if (!i.testPassword) return null;
      try {
        return decryptSecret(i.testPassword, env.secretEncKey);
      } catch {
        return null;
      }
    },
  },
};
