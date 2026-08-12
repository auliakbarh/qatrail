import { GraphQLError } from "graphql";
import type { Context } from "../context.js";
import { requireAdmin, requireAuth, requireEngineerOrAdmin, requireEngineerOrQA, requireQA } from "../context.js";
import { cloneTestCaseInto } from "../clone.js";
import { assertAllApproved } from "./testcase.js";
import { needsApproval, openRequest } from "./approvalRequest.js";
import { canReviewTest, LIVE_TEST_CASE, testReviewRequired } from "../approval.js";
import { appTestCoverage } from "../coverage.js";
import { recomputeAppTest } from "../appTestStatus.js";
import { notify, notifyQaAdmins, notifyWatchers } from "../notify.js";
import { env } from "../env.js";
import { toADF, upsertCommentsFor, appTestMarkdown } from "../jira.js";

const isAdmin = (role?: string) => role === "ADMIN" || role === "SUPER_ADMIN";

const bad = (message: string, code = "BAD_USER_INPUT") => new GraphQLError(message, { extensions: { code } });
const reviewOff = () => bad("Peer review of app tests is turned off.", "REVIEW_DISABLED");

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

// The move itself: CLONE copies each assigned case into a same-named feature of
// the target project and re-points the assignment; DROP releases the assignments.
// Records/issues keep pointing at the originals on purpose — history stays honest.
export async function moveAppTestToProject(
  ctx: Context,
  appTestId: string,
  projectId: string,
  mode: "DROP" | "CLONE",
  actorId: string,
) {
  const assigned = await ctx.prisma.appTestCase.findMany({
    where: { appTestId },
    include: { testCase: { include: { feature: true } } },
  });

  if (mode === "CLONE") {
    for (const row of assigned) {
      const srcFeature = row.testCase.feature;
      const feature =
        (await ctx.prisma.feature.findFirst({ where: { projectId, name: srcFeature.name } })) ??
        (await ctx.prisma.feature.create({
          data: {
            projectId,
            name: srcFeature.name,
            description: srcFeature.description,
            minPassPercent: srcFeature.minPassPercent,
          },
        }));
      const copy = await cloneTestCaseInto(row.testCaseId, feature.id, actorId, row.testCase.name);
      await ctx.prisma.appTestCase.update({ where: { id: row.id }, data: { testCaseId: copy.id } });
    }
  } else {
    await ctx.prisma.appTestCase.deleteMany({ where: { appTestId } });
  }

  await ctx.prisma.appTest.update({ where: { id: appTestId }, data: { projectId } });
  await recomputeAppTest(appTestId);
  return ctx.prisma.appTest.findUnique({ where: { id: appTestId } });
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
        } else if (l?.result === "BLOCKED" && !open) {
          // Blocked is not a failure: nobody got a verdict yet.
          status = "BLOCKED";
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
        where: { ...LIVE_TEST_CASE, feature: { ...LIVE_TEST_CASE.feature, projectId: at.projectId }, id: { notIn: assignedIds } },
        orderBy: { number: "asc" },
      });
    },
  },

  Mutation: {
    async createAppTest(_: unknown, args: { input: AppTestInput }, ctx: Context) {
      const user = await requireEngineerOrAdmin(ctx);
      const data = scalarData(args.input);
      const at = await ctx.prisma.appTest.create({
        data: {
          ...data,
          projectId: args.input.projectId,
          createdById: user.id,
          status: "OPEN",
          // Build #1, so the history is complete without backfilling.
          builds: {
            create: {
              createdById: user.id,
              downloadLink: data.downloadLink,
              appVersion: data.appVersion,
              backendVersion: data.backendVersion,
              note: data.note,
            },
          },
        },
      });
      await notifyQaAdmins("APP_TEST_CREATED", `New app test to test: APP-${at.number}`, at.id, user.id);
      return at;
    },
    async updateAppTest(_: unknown, args: { id: string; input: AppTestInput }, ctx: Context) {
      const user = await requireEngineerOrAdmin(ctx);
      const at = await getOwned(ctx, args.id, user);
      const data = scalarData(args.input);
      const updated = await ctx.prisma.appTest.update({
        where: { id: at.id },
        data: {
          ...data,
          // An edit that swaps the link is a new build too — keep the history honest
          // whichever path the engineer used. No reopen: that's addAppTestBuild's job.
          ...(data.downloadLink !== at.downloadLink && {
            builds: {
              create: {
                createdById: user.id,
                downloadLink: data.downloadLink,
                appVersion: data.appVersion,
                backendVersion: data.backendVersion,
                note: data.note,
              },
            },
          }),
        },
      });
      await notifyQaAdmins("APP_TEST_UPDATED", `App test updated: APP-${at.number}`, at.id, user.id);
      await notifyWatchers("APP_TEST", at.id, "WATCH", `App test updated: APP-${at.number}`, { appTestId: at.id }, user.id);
      return updated;
    },
    // Engineer ships a corrected/fixed build for the SAME app test: history, test
    // case assignments and records all carry over (no re-assign for QA). Reopens
    // the app test if QA had already closed testing.
    async addAppTestBuild(
      _: unknown,
      args: { appTestId: string; input: { downloadLink: string; appVersion?: string | null; backendVersion?: string | null; note?: string | null } },
      ctx: Context,
    ) {
      const user = await requireEngineerOrAdmin(ctx);
      const at = await ctx.prisma.appTest.findUnique({ where: { id: args.appTestId } });
      if (!at) throw new Error("App test not found");
      const downloadLink = args.input.downloadLink.trim();
      if (!downloadLink) throw new GraphQLError("Download link is required.", { extensions: { code: "BAD_USER_INPUT" } });
      const build = {
        downloadLink,
        appVersion: args.input.appVersion ?? null,
        backendVersion: args.input.backendVersion ?? null,
        note: args.input.note ?? null,
      };
      await ctx.prisma.appTest.update({
        where: { id: at.id },
        data: {
          downloadLink: build.downloadLink,
          appVersion: build.appVersion,
          backendVersion: build.backendVersion,
          closedAt: null, // resume testing on the same round
          // A new build is a new round: whatever a peer approved was the report
          // of the build before it.
          reviewState: null,
          reviewRequestedById: null,
          reviewRequestedAt: null,
          reviewedById: null,
          reviewedAt: null,
          reviewNote: null,
          builds: { create: { ...build, createdById: user.id } },
        },
      });
      await recomputeAppTest(at.id);
      const msg = `New build on APP-${at.number} — please retest`;
      await notifyQaAdmins("APP_TEST_NEW_BUILD", msg, at.id, user.id);
      await notifyWatchers("APP_TEST", at.id, "APP_TEST_NEW_BUILD", msg, { appTestId: at.id }, user.id);
      return ctx.prisma.appTest.findUnique({ where: { id: at.id } });
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
      await assertAllApproved(ctx, args.testCaseIds);
      await ctx.prisma.appTestCase.createMany({
        data: args.testCaseIds.map((testCaseId) => ({ appTestId: args.appTestId, testCaseId, assignedById: user.id })),
        skipDuplicates: true,
      });
      await recomputeAppTest(args.appTestId);
      return ctx.prisma.appTest.findUnique({ where: { id: args.appTestId } });
    },
    async assignFeatureTestCases(_: unknown, args: { appTestId: string; featureId: string }, ctx: Context) {
      const user = await requireQA(ctx);
      // Only the reviewed cases of that feature — a pending one can't be tested.
      const tcs = await ctx.prisma.testCase.findMany({
        where: { featureId: args.featureId, ...LIVE_TEST_CASE },
        select: { id: true },
      });
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
    // Admin-only: move an app test to another project. Its assignments point at
    // the OLD project's test cases, so the caller picks what happens to them:
    //   DROP  — release the assignments, start clean in the target project.
    //   CLONE — copy each case into a same-named feature of the target project
    //           (created if missing) and re-point the assignment to the copy.
    // Existing records/issues keep pointing at the original test cases — history
    // stays honest, so the app test's issueCount can still include old findings.
    async moveAppTestProject(
      _: unknown,
      args: { id: string; projectId: string; mode: "DROP" | "CLONE" },
      ctx: Context,
    ) {
      const user = await requireAdmin(ctx);
      const at = await ctx.prisma.appTest.findUnique({ where: { id: args.id } });
      if (!at) throw new Error("App test not found");
      const target = await ctx.prisma.project.findUnique({ where: { id: args.projectId } });
      if (!target) throw new Error("Project not found");
      if (target.id === at.projectId) return at;
      // Moving an app test re-points or drops every assignment under it, so it
      // waits for approval like any other change. The app test keeps working in
      // its current project until the decision lands.
      if (await needsApproval(ctx, user.role)) {
        await openRequest(ctx, user, "APP_TEST", at.id, "MOVE", { projectId: target.id, mode: args.mode });
        return ctx.prisma.appTest.findUnique({ where: { id: at.id } });
      }
      return moveAppTestToProject(ctx, at.id, target.id, args.mode, user.id);
    },
    async closeAppTestTesting(_: unknown, args: { appTestId: string }, ctx: Context) {
      await requireQA(ctx);
      const at = await ctx.prisma.appTest.findUnique({ where: { id: args.appTestId } });
      if (!at) throw new Error("App test not found");
      // With peer review on, closing is a sign-off like PASSED: another QA has
      // to have approved the report first.
      if ((await testReviewRequired()) && at.reviewState !== "APPROVED") {
        throw new GraphQLError("Another QA has to approve this app test's report before it can be closed.", {
          extensions: { code: "REVIEW_REQUIRED" },
        });
      }
      await ctx.prisma.appTest.update({ where: { id: args.appTestId }, data: { closedAt: new Date() } });
      await recomputeAppTest(args.appTestId);
      return ctx.prisma.appTest.findUnique({ where: { id: args.appTestId } });
    },
    // --- Peer review of the app test's own report (Setting.testReviewMode) ----
    // QA hands the finished round to another QA; only their approval lets it
    // reach PASSED or be closed.
    async submitAppTestReview(_: unknown, args: { id: string }, ctx: Context) {
      const user = await requireQA(ctx);
      const at = await ctx.prisma.appTest.findUnique({ where: { id: args.id } });
      if (!at) throw new Error("App test not found");
      if (!(await testReviewRequired())) throw reviewOff();
      if (at.closedAt) throw bad("This app test is already closed.", "APP_TEST_CLOSED");
      if (at.reviewState === "IN_REVIEW") throw bad("This app test is already waiting for a review.", "REVIEW_PENDING");
      await ctx.prisma.appTest.update({
        where: { id: at.id },
        data: {
          reviewState: "IN_REVIEW",
          reviewRequestedById: user.id,
          reviewRequestedAt: new Date(),
          // A new round starts clean: the previous reviewer's remarks belong to
          // the round that was sent back, not to this one.
          reviewNote: null,
          reviewedById: null,
          reviewedAt: null,
        },
      });
      await recomputeAppTest(at.id);
      const msg = `Review requested on APP-${at.number}`;
      await notifyQaAdmins("APP_TEST_REVIEW_REQUESTED", msg, at.id, user.id);
      await notifyWatchers("APP_TEST", at.id, "APP_TEST_REVIEW_REQUESTED", msg, { appTestId: at.id }, user.id);
      return ctx.prisma.appTest.findUnique({ where: { id: at.id } });
    },
    // approve = the report stands (PASSED/close unlocked); otherwise it goes back
    // to the tester with a note saying what is missing.
    async reviewAppTest(_: unknown, args: { id: string; approve: boolean; note?: string | null }, ctx: Context) {
      const user = await requireQA(ctx);
      const at = await ctx.prisma.appTest.findUnique({ where: { id: args.id } });
      if (!at) throw new Error("App test not found");
      if (!(await testReviewRequired())) throw reviewOff();
      if (at.reviewState !== "IN_REVIEW") throw bad("This app test is not waiting for a review.", "REVIEW_NOT_PENDING");
      if (!canReviewTest(user, at.reviewRequestedById)) {
        throw new GraphQLError("A report is reviewed by another QA, never by the one who asked for the review.", {
          extensions: { code: "FORBIDDEN" },
        });
      }
      const note = (args.note ?? "").trim();
      if (!args.approve && !note) throw bad("Say what the tester still has to complete.");
      await ctx.prisma.appTest.update({
        where: { id: at.id },
        data: {
          reviewState: args.approve ? "APPROVED" : "CHANGES_REQUESTED",
          reviewedById: user.id,
          reviewedAt: new Date(),
          reviewNote: note || null,
        },
      });
      await recomputeAppTest(at.id);
      const msg = args.approve
        ? `App test report approved: APP-${at.number}`
        : `App test report sent back: APP-${at.number} — ${note}`;
      const kind = args.approve ? "APP_TEST_REVIEW_APPROVED" : "APP_TEST_CHANGES_REQUESTED";
      if (at.reviewRequestedById) await notify(at.reviewRequestedById, kind, msg, null, at.id);
      await notifyWatchers("APP_TEST", at.id, kind, msg, { appTestId: at.id }, user.id);
      return ctx.prisma.appTest.findUnique({ where: { id: at.id } });
    },
    // Post a formatted comment (app-test details + poster identity) to each
    // linked JIRA ticket. Re-posting edits the comment we left there before, so
    // pressing the button twice does not stack duplicates on the ticket.
    async postAppTestToJira(_: unknown, args: { id: string }, ctx: Context) {
      // Either side of the app test may post its report: the engineer who
      // submitted the build, or the QA who ran it.
      const user = await requireEngineerOrQA(ctx);
      const at = await ctx.prisma.appTest.findUnique({
        where: { id: args.id },
        include: { createdBy: true, project: true },
      });
      if (!at) throw new Error("App test not found");
      const tickets = (at.jiraTickets ?? []).map((k) => k.trim().toUpperCase()).filter(Boolean);
      if (!tickets.length) throw new Error("No JIRA tickets linked to this app test.");
      const cov = await appTestCoverage(at.id);
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
          assignedCount: cov.total,
          issueCount,
          note: at.note,
          postedBy: { name: user.name, email: user.email, at: new Date() },
        }),
      );
      const posted = await upsertCommentsFor(tickets, at.jiraCommentIds, adf);
      if (!Object.keys(posted).length) {
        throw new Error("Failed to post to JIRA (check credentials / ticket keys).");
      }
      return ctx.prisma.appTest.update({ where: { id: at.id }, data: { jiraCommentIds: posted } });
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
    builds: (a: any, _: unknown, ctx: Context) =>
      ctx.prisma.appTestBuild.findMany({ where: { appTestId: a.id }, orderBy: { createdAt: "desc" } }),
    reviewRequestedAt: (a: any) => a.reviewRequestedAt?.toISOString() ?? null,
    reviewedAt: (a: any) => a.reviewedAt?.toISOString() ?? null,
    reviewRequestedBy: (a: any, _: unknown, ctx: Context) =>
      a.reviewRequestedById ? ctx.prisma.user.findUnique({ where: { id: a.reviewRequestedById } }) : null,
    reviewedBy: (a: any, _: unknown, ctx: Context) =>
      a.reviewedById ? ctx.prisma.user.findUnique({ where: { id: a.reviewedById } }) : null,
    // What the current user may do about the review, so the page doesn't
    // re-derive the rule (the server is still the gate).
    reviewRequired: () => testReviewRequired(),
    async canReview(a: any, _: unknown, ctx: Context) {
      if (!ctx.userId || a.reviewState !== "IN_REVIEW" || !(await testReviewRequired())) return false;
      return canReviewTest({ id: ctx.userId, role: ctx.role! }, a.reviewRequestedById);
    },
  },

  AppTestBuild: {
    createdAt: (b: any) => b.createdAt.toISOString(),
    createdBy: (b: any, _: unknown, ctx: Context) => ctx.prisma.user.findUnique({ where: { id: b.createdById } }),
  },

  AssignedTestCase: {
    assignedBy: (r: any, _: unknown, ctx: Context) => ctx.prisma.user.findUnique({ where: { id: r.assignedById } }),
  },
};
