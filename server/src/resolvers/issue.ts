import type { Context } from "../context.js";
import { requireAuth, requireQA } from "../context.js";
import { encryptSecret, decryptSecret } from "../crypto.js";
import { env } from "../env.js";
import { notify, notifyWatchers } from "../notify.js";
import { recomputeAppTest } from "../appTestStatus.js";
import { toADF, addComment, updateComment, issueMarkdown } from "../jira.js";
import { cachedSlaTargets, classifyResolve, slaApplies, canMarkProductionIssue, resolveProductionFlag } from "../sla.js";

type AttachKind = "IMAGE" | "VIDEO" | "MARKDOWN" | "JSON" | "DOC" | "XLS" | "CSV" | "PDF" | "OTHER";

interface IssueInput {
  testCaseId: string;
  recordTestId?: string | null;
  recreatedFromId?: string | null;
  type: "DEFECT" | "BUG";
  title: string;
  description: string;
  environment: "STAGING" | "PRODUCTION";
  isProductionIssue?: boolean | null;
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
  appTestId?: string | null;
  sessionTestId?: string | null;
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
function scalarData(
  input: IssueInput,
  cur: { appTestId: string | null; sessionTestId: string | null; resolvedAt: Date | null; isProductionIssue: boolean },
) {
  return {
    isProductionIssue: resolveProductionFlag(input, cur),
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

    // Server-side paginated + filtered + sorted issue list.
    async issuesPaged(
      _: unknown,
      args: {
        scope?: string;
        filter?: { search?: string; status?: string; priority?: string; type?: string; appTestId?: string; sessionTestId?: string; testCaseId?: string; isProductionIssue?: boolean | null };
        sort?: string;
        dir?: string;
        page?: number;
        pageSize?: number;
      },
      ctx: Context,
    ) {
      const userId = requireAuth(ctx);
      const f = args.filter ?? {};
      const where: any = {};
      if (args.scope === "assigned") {
        where.assigneeId = userId;
        where.archived = false;
      }
      if (f.status) where.status = f.status;
      if (f.priority) where.priority = f.priority;
      if (f.type) where.type = f.type;
      if (f.appTestId) where.appTestId = f.appTestId;
      if (f.sessionTestId) where.sessionTestId = f.sessionTestId;
      if (f.testCaseId) where.testCaseId = f.testCaseId;
      if (f.isProductionIssue != null) where.isProductionIssue = f.isProductionIssue;
      if (f.search?.trim()) where.title = { contains: f.search.trim(), mode: "insensitive" };

      const SORTABLE = new Set(["createdAt", "priority", "status", "title", "type"]);
      const sortKey = SORTABLE.has(args.sort ?? "") ? (args.sort as string) : "createdAt";
      const dir = args.dir === "asc" ? "asc" : "desc";

      const page = Math.max(1, args.page ?? 1);
      const pageSize = Math.min(100, Math.max(1, args.pageSize ?? 25));

      const [items, total] = await ctx.prisma.$transaction([
        ctx.prisma.issue.findMany({
          where,
          orderBy: { [sortKey]: dir },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        ctx.prisma.issue.count({ where }),
      ]);
      return { items, total };
    },
  },
  Mutation: {
    async createIssue(_: unknown, args: { input: IssueInput }, ctx: Context) {
      const user = await requireQA(ctx);
      const { input } = args;
      validate(input);
      const issue = await ctx.prisma.issue.create({
        data: {
          ...scalarData(input, {
            appTestId: input.appTestId ?? null,
            sessionTestId: input.sessionTestId ?? null,
            resolvedAt: null,
            isProductionIssue: false,
          }),
          testCaseId: input.testCaseId,
          recordTestId: input.recordTestId ?? null,
          recreatedFromId: input.recreatedFromId ?? null,
          appTestId: input.appTestId ?? null,
          sessionTestId: input.sessionTestId ?? null,
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
      // App-test-scoped issue: notify the app test's creator + refresh its status.
      if (issue.appTestId) {
        const at = await ctx.prisma.appTest.findUnique({ where: { id: issue.appTestId }, select: { createdById: true } });
        if (at && at.createdById !== user.id) {
          await notify(at.createdById, "APP_TEST_ISSUE", `New issue on your app test: ${issue.title}`, issue.id, issue.appTestId);
        }
        await notifyWatchers("APP_TEST", issue.appTestId, "APP_TEST_ISSUE", `New issue on app test: ${issue.title}`, { issueId: issue.id, appTestId: issue.appTestId }, user.id);
        await recomputeAppTest(issue.appTestId);
      }
      // Session-scoped issue: tell the session's watchers. No status to recompute —
      // a session's status is derived per request.
      if (issue.sessionTestId) {
        await notifyWatchers(
          "SESSION_TEST",
          issue.sessionTestId,
          "SESSION_TEST_ISSUE",
          `New issue in testing session: ${issue.title}`,
          { issueId: issue.id, sessionTestId: issue.sessionTestId },
          user.id,
        );
      }
      return issue;
    },
    async updateIssue(_: unknown, args: { id: string; input: IssueInput }, ctx: Context) {
      await requireQA(ctx);
      const { input } = args;
      validate(input);
      // The flag depends on the stored issue (app-test link, resolved state) —
      // the client's input.appTestId can't be trusted for it.
      const cur = await ctx.prisma.issue.findUnique({
        where: { id: args.id },
        select: { appTestId: true, sessionTestId: true, resolvedAt: true, isProductionIssue: true },
      });
      if (!cur) throw new Error("Issue not found");
      // Replace attachments wholesale. Only overwrite the password when a new one is given.
      return ctx.prisma.issue.update({
        where: { id: args.id },
        data: {
          ...scalarData(input, cur),
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
      const issue = await ctx.prisma.issue.delete({ where: { id: args.id } });
      if (issue.appTestId) await recomputeAppTest(issue.appTestId);
      return true;
    },

    async bulkArchiveIssues(_: unknown, args: { ids: string[]; archived: boolean }, ctx: Context) {
      await requireQA(ctx);
      const r = await ctx.prisma.issue.updateMany({ where: { id: { in: args.ids } }, data: { archived: args.archived } });
      return r.count;
    },
    async bulkAssignIssues(_: unknown, args: { ids: string[]; assigneeId: string }, ctx: Context) {
      await requireQA(ctx);
      const eng = await ctx.prisma.user.findUnique({ where: { id: args.assigneeId } });
      if (!eng) throw new Error("Assignee not found");
      const r = await ctx.prisma.issue.updateMany({ where: { id: { in: args.ids } }, data: { assigneeId: args.assigneeId } });
      return r.count;
    },
    async bulkDeleteIssues(_: unknown, args: { ids: string[] }, ctx: Context) {
      await requireQA(ctx);
      const r = await ctx.prisma.issue.deleteMany({ where: { id: { in: args.ids } } });
      return r.count;
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
      const session = issue.sessionTestId
        ? await ctx.prisma.sessionTest.findUnique({ where: { id: issue.sessionTestId }, select: { number: true } })
        : null;
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
          sessionKey: session ? `ST-${session.number}` : null,
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
    key: (i: any) => `ISSUE-${i.number}`,
    async appTestKey(i: any, _: unknown, ctx: Context) {
      if (!i.appTestId) return null;
      const at = await ctx.prisma.appTest.findUnique({ where: { id: i.appTestId }, select: { number: true } });
      return at ? `APP-${at.number}` : null;
    },
    async sessionTestKey(i: any, _: unknown, ctx: Context) {
      if (!i.sessionTestId) return null;
      const st = await ctx.prisma.sessionTest.findUnique({ where: { id: i.sessionTestId }, select: { number: true } });
      return st ? `ST-${st.number}` : null;
    },
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
    canMarkProductionIssue: (i: any) => canMarkProductionIssue(i),
    // SLA status for production issues: MET | AT_RISK | BREACHED, else NA.
    async slaStatus(i: any) {
      if (!slaApplies(i)) return "NA";
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
