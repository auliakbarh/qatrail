import { GraphQLError } from "graphql";
import type { Context } from "../context.js";
import { requireAuth, requireQA } from "../context.js";
import { sessionTestCoverage } from "../coverage.js";
import { notifyQaAdmins, notifyWatchers } from "../notify.js";

const isAdmin = (role?: string) => role === "ADMIN" || role === "SUPER_ADMIN";

export type SessionTestStatus = "OPEN" | "IN_TESTING" | "PASSED" | "CLOSED";

// Pure status derivation (unit-testable, no DB). Unlike AppTest this is never
// stored — a session's status is always recomputed from its own runs.
//   closed                              -> CLOSED
//   no test case                        -> OPEN
//   pass% >= agreed target              -> PASSED
//   any record/issue                    -> IN_TESTING
//   else                                -> OPEN
export function deriveSessionStatus(s: {
  closed: boolean;
  caseCount: number;
  coveragePercent: number;
  minPassPercent: number;
  activity: number;
}): SessionTestStatus {
  if (s.closed) return "CLOSED";
  if (s.caseCount === 0) return "OPEN";
  if (s.coveragePercent >= s.minPassPercent) return "PASSED";
  return s.activity > 0 ? "IN_TESTING" : "OPEN";
}

interface SessionTestInput {
  projectId: string;
  testedAt: string;
  kind: "SIT" | "UAT" | "OTHER";
  kindOther?: string | null;
  stakeholders: string[];
  minPassPercent: number;
  note?: string | null;
}

interface SessionTestAppInput {
  appTestId?: string | null;
  name?: string | null;
  versionFe?: string | null;
  versionBe?: string | null;
  environment?: "STAGING" | "PRODUCTION" | null;
  platform?: "ANDROID" | "IOS" | "WEB" | null;
  note?: string | null;
}

const bad = (message: string, code = "BAD_USER_INPUT") =>
  new GraphQLError(message, { extensions: { code } });

// Creator or admin may edit. Delete adds an emptiness rule (see deleteSessionTest).
async function getOwned(ctx: Context, id: string, user: { id: string; role: string }) {
  const st = await ctx.prisma.sessionTest.findUnique({ where: { id } });
  if (!st) throw new Error("Session test not found");
  if (st.createdById !== user.id && !isAdmin(user.role)) {
    throw new Error("Forbidden: only the creator may do this");
  }
  return st;
}

function scalarData(input: SessionTestInput) {
  const kindOther = input.kind === "OTHER" ? (input.kindOther ?? "").trim() : null;
  if (input.kind === "OTHER" && !kindOther) throw bad("Please name the test type.");
  if (!Number.isInteger(input.minPassPercent) || input.minPassPercent < 0 || input.minPassPercent > 100) {
    throw bad("Target pass % must be between 0 and 100.");
  }
  const testedAt = new Date(input.testedAt);
  if (Number.isNaN(testedAt.getTime())) throw bad("Invalid test date.");
  return {
    testedAt,
    kind: input.kind,
    kindOther,
    stakeholders: input.stakeholders.map((s) => s.trim()).filter(Boolean),
    minPassPercent: input.minPassPercent,
    note: input.note?.trim() || null,
  };
}

// An app row is either a reference to an engineer-submitted app test (versions
// snapshotted from it) or a manually typed entry.
async function appData(ctx: Context, sessionTestId: string, input: SessionTestAppInput) {
  if (input.appTestId) {
    const at = await ctx.prisma.appTest.findUnique({ where: { id: input.appTestId } });
    if (!at) throw bad("App test not found.");
    const st = await ctx.prisma.sessionTest.findUnique({ where: { id: sessionTestId }, select: { projectId: true } });
    if (at.projectId !== st?.projectId) throw bad("That app test belongs to another project.");
    return {
      appTestId: at.id,
      name: input.name?.trim() || `APP-${at.number}`,
      // Snapshot: AppTest keeps mirroring its newest build, a signed-off session must not.
      versionFe: input.versionFe?.trim() || at.appVersion,
      versionBe: input.versionBe?.trim() || at.backendVersion,
      environment: at.environment,
      platform: at.platform,
      note: input.note?.trim() || null,
    };
  }
  const name = (input.name ?? "").trim();
  if (!name) throw bad("App name is required.");
  return {
    appTestId: null,
    name,
    versionFe: input.versionFe?.trim() || null,
    versionBe: input.versionBe?.trim() || null,
    environment: input.environment ?? null,
    platform: input.platform ?? null,
    note: input.note?.trim() || null,
  };
}

const byId = (ctx: Context, id: string) => ctx.prisma.sessionTest.findUnique({ where: { id } });

export const sessionTestResolvers = {
  Query: {
    async sessionTests(_: unknown, args: { projectId?: string }, ctx: Context) {
      requireAuth(ctx);
      return ctx.prisma.sessionTest.findMany({
        where: args.projectId ? { projectId: args.projectId } : {},
        orderBy: { createdAt: "desc" },
      });
    },
    async sessionTest(_: unknown, args: { id: string }, ctx: Context) {
      requireAuth(ctx);
      return byId(ctx, args.id);
    },
    // Per-case progress inside this session only: its own records and findings.
    async sessionTestCases(_: unknown, args: { sessionTestId: string }, ctx: Context) {
      requireAuth(ctx);
      const sessionTestId = args.sessionTestId;
      const rows = await ctx.prisma.sessionTestCase.findMany({
        where: { sessionTestId },
        orderBy: { assignedAt: "asc" },
        include: { testCase: { include: { feature: true } }, apps: { orderBy: { createdAt: "asc" } } },
      });
      if (rows.length === 0) return [];
      const st = await ctx.prisma.sessionTest.findUnique({ where: { id: sessionTestId }, select: { closedAt: true } });
      const tcIds = rows.map((r) => r.testCaseId);

      const records = await ctx.prisma.recordTest.findMany({
        where: { sessionTestId, testCaseId: { in: tcIds } },
        orderBy: { executedAt: "desc" },
        select: { testCaseId: true, result: true, executedAt: true },
      });
      const latest = new Map<string, { result: string; executedAt: Date }>();
      for (const r of records) if (!latest.has(r.testCaseId)) latest.set(r.testCaseId, r);

      const openGroups = await ctx.prisma.issue.groupBy({
        by: ["testCaseId"],
        where: { sessionTestId, testCaseId: { in: tcIds }, archived: false, status: { not: "CLOSED" } },
        _count: { _all: true },
      });
      const hasOpen = new Set(openGroups.map((g) => g.testCaseId));

      const countGroups = await ctx.prisma.issue.groupBy({
        by: ["testCaseId"],
        where: { sessionTestId, testCaseId: { in: tcIds } },
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
        if (st?.closedAt && status !== "PASSED") doneTestAt = st.closedAt;
        return {
          id: r.id,
          testCase: r.testCase,
          featureId: r.testCase.featureId,
          featureName: r.testCase.feature.name,
          status,
          issueCount: issueCounts.get(r.testCaseId) ?? 0,
          apps: r.apps,
          assignedById: r.assignedById,
          assignedAt: r.assignedAt.toISOString(),
          doneTestAt: doneTestAt?.toISOString() ?? null,
        };
      });
    },
    async sessionAssignableTestCases(_: unknown, args: { sessionTestId: string }, ctx: Context) {
      requireAuth(ctx);
      const st = await ctx.prisma.sessionTest.findUnique({
        where: { id: args.sessionTestId },
        select: { projectId: true },
      });
      if (!st) throw new Error("Session test not found");
      const assigned = await ctx.prisma.sessionTestCase.findMany({
        where: { sessionTestId: args.sessionTestId },
        select: { testCaseId: true },
      });
      return ctx.prisma.testCase.findMany({
        where: { feature: { projectId: st.projectId }, id: { notIn: assigned.map((a) => a.testCaseId) } },
        orderBy: { number: "asc" },
      });
    },
    async sessionTestRecords(_: unknown, args: { sessionTestId: string }, ctx: Context) {
      requireAuth(ctx);
      return ctx.prisma.recordTest.findMany({
        where: { sessionTestId: args.sessionTestId },
        orderBy: { executedAt: "desc" },
      });
    },
    async sessionLinkableAppTests(_: unknown, args: { sessionTestId: string }, ctx: Context) {
      requireAuth(ctx);
      const st = await ctx.prisma.sessionTest.findUnique({
        where: { id: args.sessionTestId },
        select: { projectId: true },
      });
      if (!st) throw new Error("Session test not found");
      const linked = await ctx.prisma.sessionTestApp.findMany({
        where: { sessionTestId: args.sessionTestId, appTestId: { not: null } },
        select: { appTestId: true },
      });
      return ctx.prisma.appTest.findMany({
        where: { projectId: st.projectId, id: { notIn: linked.map((l) => l.appTestId!) } },
        orderBy: { createdAt: "desc" },
      });
    },
  },

  Mutation: {
    async createSessionTest(_: unknown, args: { input: SessionTestInput }, ctx: Context) {
      const user = await requireQA(ctx);
      const st = await ctx.prisma.sessionTest.create({
        data: { ...scalarData(args.input), projectId: args.input.projectId, createdById: user.id },
      });
      await notifyQaAdmins("SESSION_TEST_CREATED", `New testing session: ST-${st.number}`, undefined, user.id, st.id);
      return st;
    },
    async updateSessionTest(_: unknown, args: { id: string; input: SessionTestInput }, ctx: Context) {
      const user = await requireQA(ctx);
      const st = await getOwned(ctx, args.id, user);
      return ctx.prisma.sessionTest.update({ where: { id: st.id }, data: scalarData(args.input) });
    },
    // QA creator may only delete a session nobody has tested in yet; an admin may
    // delete any (records/issues survive with sessionTestId nulled).
    async deleteSessionTest(_: unknown, args: { id: string }, ctx: Context) {
      const user = await requireQA(ctx);
      const st = await getOwned(ctx, args.id, user);
      if (!isAdmin(user.role)) {
        const used =
          (await ctx.prisma.recordTest.count({ where: { sessionTestId: st.id } })) +
          (await ctx.prisma.issue.count({ where: { sessionTestId: st.id } }));
        if (used > 0) {
          throw new GraphQLError("This session already has test results, so only an admin can delete it.", {
            extensions: { code: "SESSION_NOT_EMPTY" },
          });
        }
      }
      // Comments/watches reference the session by plain id (no FK), so clean them here.
      await ctx.prisma.watch.deleteMany({ where: { target: "SESSION_TEST", targetId: st.id } });
      await ctx.prisma.comment.deleteMany({ where: { target: "SESSION_TEST", targetId: st.id } });
      await ctx.prisma.sessionTest.delete({ where: { id: st.id } });
      return true;
    },
    async addSessionTestApp(_: unknown, args: { sessionTestId: string; input: SessionTestAppInput }, ctx: Context) {
      const user = await requireQA(ctx);
      const st = await getOwned(ctx, args.sessionTestId, user);
      await ctx.prisma.sessionTestApp.create({
        data: { sessionTestId: st.id, ...(await appData(ctx, st.id, args.input)) },
      });
      return byId(ctx, st.id);
    },
    async updateSessionTestApp(_: unknown, args: { id: string; input: SessionTestAppInput }, ctx: Context) {
      const user = await requireQA(ctx);
      const app = await ctx.prisma.sessionTestApp.findUnique({ where: { id: args.id } });
      if (!app) throw new Error("Session app not found");
      const st = await getOwned(ctx, app.sessionTestId, user);
      await ctx.prisma.sessionTestApp.update({
        where: { id: app.id },
        data: await appData(ctx, st.id, args.input),
      });
      return byId(ctx, st.id);
    },
    async removeSessionTestApp(_: unknown, args: { id: string }, ctx: Context) {
      const user = await requireQA(ctx);
      const app = await ctx.prisma.sessionTestApp.findUnique({ where: { id: args.id } });
      if (!app) throw new Error("Session app not found");
      const st = await getOwned(ctx, app.sessionTestId, user);
      await ctx.prisma.sessionTestApp.delete({ where: { id: app.id } });
      return byId(ctx, st.id);
    },
    // Apps are optional: an empty appIds just means "not tied to a specific app".
    async assignSessionTestCases(
      _: unknown,
      args: { sessionTestId: string; testCaseIds: string[]; appIds: string[] },
      ctx: Context,
    ) {
      const user = await requireQA(ctx);
      const st = await getOwned(ctx, args.sessionTestId, user);
      const apps = args.appIds.length
        ? await ctx.prisma.sessionTestApp.findMany({
            where: { id: { in: args.appIds }, sessionTestId: st.id },
            select: { id: true },
          })
        : [];
      for (const testCaseId of args.testCaseIds) {
        await ctx.prisma.sessionTestCase.upsert({
          where: { sessionTestId_testCaseId: { sessionTestId: st.id, testCaseId } },
          create: {
            sessionTestId: st.id,
            testCaseId,
            assignedById: user.id,
            apps: { connect: apps.map((a) => ({ id: a.id })) },
          },
          update: { apps: { connect: apps.map((a) => ({ id: a.id })) } },
        });
      }
      return byId(ctx, st.id);
    },
    async setSessionTestCaseApps(_: unknown, args: { sessionTestCaseId: string; appIds: string[] }, ctx: Context) {
      const user = await requireQA(ctx);
      const row = await ctx.prisma.sessionTestCase.findUnique({ where: { id: args.sessionTestCaseId } });
      if (!row) throw new Error("Session test case not found");
      const st = await getOwned(ctx, row.sessionTestId, user);
      const apps = await ctx.prisma.sessionTestApp.findMany({
        where: { id: { in: args.appIds }, sessionTestId: st.id },
        select: { id: true },
      });
      await ctx.prisma.sessionTestCase.update({
        where: { id: row.id },
        data: { apps: { set: apps.map((a) => ({ id: a.id })) } },
      });
      return byId(ctx, st.id);
    },
    async unassignSessionTestCase(_: unknown, args: { sessionTestId: string; testCaseId: string }, ctx: Context) {
      const user = await requireQA(ctx);
      const st = await getOwned(ctx, args.sessionTestId, user);
      await ctx.prisma.sessionTestCase.deleteMany({ where: { sessionTestId: st.id, testCaseId: args.testCaseId } });
      return byId(ctx, st.id);
    },
    async closeSessionTest(_: unknown, args: { id: string; summary: string }, ctx: Context) {
      const user = await requireQA(ctx);
      const st = await getOwned(ctx, args.id, user);
      if (st.closedAt) {
        throw new GraphQLError("This session is already closed.", { extensions: { code: "SESSION_CLOSED" } });
      }
      const summary = args.summary.trim();
      if (!summary) throw bad("A summary is required to close a session.");
      const updated = await ctx.prisma.sessionTest.update({
        where: { id: st.id },
        data: { summary, closedAt: new Date() },
      });
      const msg = `Testing session closed: ST-${st.number}`;
      await notifyQaAdmins("SESSION_TEST_CLOSED", msg, undefined, user.id, st.id);
      await notifyWatchers("SESSION_TEST", st.id, "SESSION_TEST_CLOSED", msg, { sessionTestId: st.id }, user.id);
      return updated;
    },
  },

  SessionTest: {
    key: (s: any) => `ST-${s.number}`,
    kindLabel: (s: any) => (s.kind === "OTHER" ? (s.kindOther ?? "OTHER") : s.kind),
    testedAt: (s: any) => s.testedAt.toISOString(),
    closedAt: (s: any) => s.closedAt?.toISOString() ?? null,
    createdAt: (s: any) => s.createdAt.toISOString(),
    updatedAt: (s: any) => s.updatedAt.toISOString(),
    createdBy: (s: any, _: unknown, ctx: Context) => ctx.prisma.user.findUnique({ where: { id: s.createdById } }),
    projectName: async (s: any, _: unknown, ctx: Context) =>
      (await ctx.prisma.project.findUnique({ where: { id: s.projectId }, select: { name: true } }))?.name ?? "",
    coverage: (s: any) => sessionTestCoverage(s.id),
    passPercent: async (s: any) => (await sessionTestCoverage(s.id)).percent,
    issueCount: (s: any, _: unknown, ctx: Context) => ctx.prisma.issue.count({ where: { sessionTestId: s.id } }),
    recordCount: (s: any, _: unknown, ctx: Context) => ctx.prisma.recordTest.count({ where: { sessionTestId: s.id } }),
    caseCount: (s: any, _: unknown, ctx: Context) => ctx.prisma.sessionTestCase.count({ where: { sessionTestId: s.id } }),
    apps: (s: any, _: unknown, ctx: Context) =>
      ctx.prisma.sessionTestApp.findMany({ where: { sessionTestId: s.id }, orderBy: { createdAt: "asc" } }),
    async status(s: any, _: unknown, ctx: Context) {
      const caseCount = await ctx.prisma.sessionTestCase.count({ where: { sessionTestId: s.id } });
      const coveragePercent = caseCount > 0 ? (await sessionTestCoverage(s.id)).percent : 0;
      const activity =
        caseCount > 0
          ? (await ctx.prisma.recordTest.count({ where: { sessionTestId: s.id } })) +
            (await ctx.prisma.issue.count({ where: { sessionTestId: s.id } }))
          : 0;
      return deriveSessionStatus({
        closed: !!s.closedAt,
        caseCount,
        coveragePercent,
        minPassPercent: s.minPassPercent,
        activity,
      });
    },
  },

  SessionTestApp: {
    createdAt: (a: any) => a.createdAt.toISOString(),
    async appTestKey(a: any, _: unknown, ctx: Context) {
      if (!a.appTestId) return null;
      const at = await ctx.prisma.appTest.findUnique({ where: { id: a.appTestId }, select: { number: true } });
      return at ? `APP-${at.number}` : null;
    },
  },

  SessionTestCaseRow: {
    assignedBy: (r: any, _: unknown, ctx: Context) => ctx.prisma.user.findUnique({ where: { id: r.assignedById } }),
  },
};
