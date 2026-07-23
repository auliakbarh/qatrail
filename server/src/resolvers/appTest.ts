import { GraphQLError } from "graphql";
import type { Context } from "../context.js";
import { requireAuth, requireEngineerOrAdmin, requireQA } from "../context.js";
import { appTestCoverage } from "../coverage.js";
import { recomputeAppTest } from "../appTestStatus.js";
import { notifyQaAdmins, notifyWatchers } from "../notify.js";
import { env } from "../env.js";
import { toADF, addComment, appTestMarkdown } from "../jira.js";

const isAdmin = (role?: string) => role === "ADMIN" || role === "SUPER_ADMIN";

interface AppTestInput {
  projectId: string;
  environment: "STAGING" | "PRODUCTION";
  platform: "ANDROID" | "IOS" | "WEB";
  appVersion?: string | null;
  backendVersion?: string | null;
  downloadLink: string;
  note?: string | null;
  jiraTickets: string[];
}

async function getOwned(ctx: Context, id: string, user: any) {
  const at = await ctx.prisma.appTest.findUnique({ where: { id } });
  if (!at) throw new Error("App test not found");
  if (at.createdById !== user.id && !isAdmin(user.role)) {
    throw new Error("Forbidden: only the creator may do this");
  }
  return at;
}

function scalarData(input: AppTestInput) {
  return {
    environment: input.environment,
    platform: input.platform,
    appVersion: input.appVersion ?? null,
    backendVersion: input.backendVersion ?? null,
    downloadLink: input.downloadLink.trim(),
    note: input.note ?? null,
    jiraTickets: input.jiraTickets.map((t) => t.trim()).filter(Boolean),
  };
}

export const appTestResolvers = {
  Query: {
    async appTests(_: unknown, args: { projectId?: string }, ctx: Context) {
      requireAuth(ctx);
      return ctx.prisma.appTest.findMany({
        where: args.projectId ? { projectId: args.projectId } : {},
        orderBy: { createdAt: "desc" },
      });
    },
    async appTest(_: unknown, args: { id: string }, ctx: Context) {
      requireAuth(ctx);
      return ctx.prisma.appTest.findUnique({ where: { id: args.id } });
    },
    async assignedTestCases(_: unknown, args: { appTestId: string }, ctx: Context) {
      requireAuth(ctx);
      const appTestId = args.appTestId;
      const rows = await ctx.prisma.appTestCase.findMany({
        where: { appTestId },
        orderBy: { assignedAt: "asc" },
        include: { testCase: { include: { feature: true } } },
      });
      if (rows.length === 0) return [];
      const at = await ctx.prisma.appTest.findUnique({ where: { id: appTestId }, select: { closedAt: true } });
      const tcIds = rows.map((r) => r.testCaseId);

      // Batch: records for this app test (newest first), open issues, issue counts.
      const records = await ctx.prisma.recordTest.findMany({
        where: { appTestId, testCaseId: { in: tcIds } },
        orderBy: { executedAt: "desc" },
        select: { testCaseId: true, result: true, executedAt: true },
      });
      const latest = new Map<string, { result: string; executedAt: Date }>();
      for (const r of records) if (!latest.has(r.testCaseId)) latest.set(r.testCaseId, { result: r.result, executedAt: r.executedAt });

      const openGroups = await ctx.prisma.issue.groupBy({
        by: ["testCaseId"],
        where: { appTestId, testCaseId: { in: tcIds }, archived: false, status: { not: "CLOSED" } },
        _count: { _all: true },
      });
      const hasOpen = new Set(openGroups.map((g) => g.testCaseId));

      const countGroups = await ctx.prisma.issue.groupBy({
        by: ["testCaseId"],
        where: { appTestId, testCaseId: { in: tcIds } },
        _count: { _all: true },
      });
      const issueCounts = new Map(countGroups.map((g) => [g.testCaseId, g._count._all]));

      return rows.map((r) => {
        const l = latest.get(r.testCaseId);
        const open = hasOpen.has(r.testCaseId);
        let status: string;
        let doneTestAt: Date | null = null;
        if (!l && !issueCounts.has(r.testCaseId)) {
          status = "NOT_STARTED";
        } else if (l?.result === "PASS" && !open) {
          status = "PASSED";
          doneTestAt = l.executedAt;
        } else {
          status = "FAILED";
        }
        if (at?.closedAt && status !== "PASSED") doneTestAt = at.closedAt;
        return {
          id: r.id,
          testCase: r.testCase,
          featureId: r.testCase.featureId,
          featureName: r.testCase.feature.name,
          status,
          issueCount: issueCounts.get(r.testCaseId) ?? 0,
          assignedById: r.assignedById,
          assignedAt: r.assignedAt.toISOString(),
          doneTestAt: doneTestAt?.toISOString() ?? null,
        };
      });
    },
    async assignableTestCases(_: unknown, args: { appTestId: string }, ctx: Context) {
      requireAuth(ctx);
      const at = await ctx.prisma.appTest.findUnique({ where: { id: args.appTestId }, select: { projectId: true } });
      if (!at) throw new Error("App test not found");
      const assigned = await ctx.prisma.appTestCase.findMany({ where: { appTestId: args.appTestId }, select: { testCaseId: true } });
      const assignedIds = assigned.map((a) => a.testCaseId);
      return ctx.prisma.testCase.findMany({
        where: { feature: { projectId: at.projectId }, id: { notIn: assignedIds } },
        orderBy: { number: "asc" },
      });
    },
  },

  Mutation: {
    async createAppTest(_: unknown, args: { input: AppTestInput }, ctx: Context) {
      const user = await requireEngineerOrAdmin(ctx);
      const at = await ctx.prisma.appTest.create({
        data: { ...scalarData(args.input), projectId: args.input.projectId, createdById: user.id, status: "OPEN" },
      });
      await notifyQaAdmins("APP_TEST_CREATED", `New app test to test: APP-${at.number}`, at.id, user.id);
      return at;
    },
    async updateAppTest(_: unknown, args: { id: string; input: AppTestInput }, ctx: Context) {
      const user = await requireEngineerOrAdmin(ctx);
      const at = await getOwned(ctx, args.id, user);
      const updated = await ctx.prisma.appTest.update({ where: { id: at.id }, data: scalarData(args.input) });
      await notifyQaAdmins("APP_TEST_UPDATED", `App test updated: APP-${at.number}`, at.id, user.id);
      await notifyWatchers("APP_TEST", at.id, "WATCH", `App test updated: APP-${at.number}`, { appTestId: at.id }, user.id);
      return updated;
    },
    async deleteAppTest(_: unknown, args: { id: string }, ctx: Context) {
      const user = await requireEngineerOrAdmin(ctx);
      const at = await getOwned(ctx, args.id, user);
      if (at.status !== "OPEN") {
        throw new GraphQLError("This app test can't be deleted because testing has already started.", {
          extensions: { code: "APP_TEST_NOT_OPEN" },
        });
      }
      await ctx.prisma.appTest.delete({ where: { id: at.id } });
      await notifyQaAdmins("APP_TEST_DELETED", `App test deleted: APP-${at.number}`, undefined, user.id);
      return true;
    },
    async assignTestCases(_: unknown, args: { appTestId: string; testCaseIds: string[] }, ctx: Context) {
      const user = await requireQA(ctx);
      await ctx.prisma.appTestCase.createMany({
        data: args.testCaseIds.map((testCaseId) => ({ appTestId: args.appTestId, testCaseId, assignedById: user.id })),
        skipDuplicates: true,
      });
      await recomputeAppTest(args.appTestId);
      return ctx.prisma.appTest.findUnique({ where: { id: args.appTestId } });
    },
    async assignFeatureTestCases(_: unknown, args: { appTestId: string; featureId: string }, ctx: Context) {
      const user = await requireQA(ctx);
      const tcs = await ctx.prisma.testCase.findMany({ where: { featureId: args.featureId }, select: { id: true } });
      await ctx.prisma.appTestCase.createMany({
        data: tcs.map((t) => ({ appTestId: args.appTestId, testCaseId: t.id, assignedById: user.id })),
        skipDuplicates: true,
      });
      await recomputeAppTest(args.appTestId);
      return ctx.prisma.appTest.findUnique({ where: { id: args.appTestId } });
    },
    async unassignTestCase(_: unknown, args: { appTestId: string; testCaseId: string }, ctx: Context) {
      await requireQA(ctx);
      await ctx.prisma.appTestCase.deleteMany({ where: { appTestId: args.appTestId, testCaseId: args.testCaseId } });
      await recomputeAppTest(args.appTestId);
      return ctx.prisma.appTest.findUnique({ where: { id: args.appTestId } });
    },
    async closeAppTestTesting(_: unknown, args: { appTestId: string }, ctx: Context) {
      await requireQA(ctx);
      await ctx.prisma.appTest.update({ where: { id: args.appTestId }, data: { closedAt: new Date() } });
      await recomputeAppTest(args.appTestId);
      return ctx.prisma.appTest.findUnique({ where: { id: args.appTestId } });
    },
    // Post a formatted comment (all app-test details + poster identity) to each
    // linked JIRA ticket. Only works when tickets are linked.
    async postAppTestToJira(_: unknown, args: { id: string }, ctx: Context) {
      const user = await requireQA(ctx);
      const at = await ctx.prisma.appTest.findUnique({
        where: { id: args.id },
        include: { createdBy: true, project: true },
      });
      if (!at) throw new Error("App test not found");
      const tickets = (at.jiraTickets ?? []).map((k) => k.trim().toUpperCase()).filter(Boolean);
      if (!tickets.length) throw new Error("No JIRA tickets linked to this app test.");
      const cov = await appTestCoverage(at.id);
      const rows: any[] = await appTestResolvers.Query.assignedTestCases(_, { appTestId: at.id }, ctx);
      const issueCount = await ctx.prisma.issue.count({ where: { appTestId: at.id } });
      const adf = toADF(
        appTestMarkdown({
          url: `${env.frontendBaseUrl}/app-tests/${at.id}`,
          key: `APP-${at.number}`,
          status: at.status,
          projectName: at.project.name,
          environment: at.environment,
          platform: at.platform,
          appVersion: at.appVersion,
          backendVersion: at.backendVersion,
          creatorName: at.createdBy.name,
          downloadLink: at.downloadLink,
          createdAt: at.createdAt,
          doneAt: at.closedAt ?? at.passedAt,
          passPercent: cov.percent,
          assignedCount: rows.length,
          issueCount,
          note: at.note,
          postedByName: user.name,
          postedByEmail: user.email,
          cases: rows.map((r) => ({
            key: `TC-${r.testCase.number}`,
            name: r.testCase.name,
            feature: r.featureName,
            status: r.status,
            issueCount: r.issueCount,
          })),
        }),
      );
      // ponytail: one fresh comment per ticket each call. AppTest has no
      // jiraCommentId column, so no idempotent edit — add one if duplicate
      // comments on re-post become a problem.
      const posted = await Promise.all(tickets.map((k) => addComment(k, adf)));
      if (!posted.some(Boolean)) throw new Error("Failed to post to JIRA (check credentials / ticket keys).");
      return at;
    },
  },

  AppTest: {
    key: (a: any) => `APP-${a.number}`,
    createdAt: (a: any) => a.createdAt.toISOString(),
    updatedAt: (a: any) => a.updatedAt.toISOString(),
    doneTestAt: (a: any) => (a.closedAt ?? a.passedAt)?.toISOString() ?? null,
    createdBy: (a: any, _: unknown, ctx: Context) => ctx.prisma.user.findUnique({ where: { id: a.createdById } }),
    projectName: async (a: any, _: unknown, ctx: Context) =>
      (await ctx.prisma.project.findUnique({ where: { id: a.projectId }, select: { name: true } }))?.name ?? "",
    coverage: (a: any) => appTestCoverage(a.id),
    passPercent: async (a: any) => (await appTestCoverage(a.id)).percent,
    issueCount: (a: any, _: unknown, ctx: Context) => ctx.prisma.issue.count({ where: { appTestId: a.id } }),
    assignedCount: (a: any, _: unknown, ctx: Context) => ctx.prisma.appTestCase.count({ where: { appTestId: a.id } }),
  },

  AssignedTestCase: {
    assignedBy: (r: any, _: unknown, ctx: Context) => ctx.prisma.user.findUnique({ where: { id: r.assignedById } }),
  },
};
