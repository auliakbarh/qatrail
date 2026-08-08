import { GraphQLError } from "graphql";
import type { Context } from "../context.js";
import { requireAuth } from "../context.js";
import { notify, notifyWatchers } from "../notify.js";
import { recomputeAppTest } from "../appTestStatus.js";
import { canMarkProductionIssue } from "../sla.js";
import { LIVE_TEST_CASE } from "../approval.js";
import { assertBlockerNoted, recordData } from "./record.js";

// Load the issue or throw. Small helper to keep mutations terse.
async function getIssue(ctx: Context, id: string) {
  const issue = await ctx.prisma.issue.findUnique({ where: { id } });
  if (!issue) throw new Error("Issue not found");
  return issue;
}

async function actor(ctx: Context) {
  const userId = requireAuth(ctx);
  const user = await ctx.prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("Unauthorized");
  return user;
}

const isAdmin = (role: string) => role === "ADMIN" || role === "SUPER_ADMIN";

// Engineer actions require the assignee (or an admin).
function assertAssignee(user: any, issue: any) {
  if (issue.assigneeId !== user.id && !isAdmin(user.role)) {
    throw new Error("Forbidden: only the assigned engineer may do this");
  }
}
// QA actions require the reporter or a QA/QA lead/admin.
function canReviewIssue(user: any, issue: any) {
  return issue.reporterId === user.id || user.role === "QA" || user.role === "QA_LEAD" || isAdmin(user.role);
}
function assertReporterOrQA(user: any, issue: any) {
  if (!canReviewIssue(user, issue)) {
    throw new Error("Forbidden: only QA/reporter may do this");
  }
}

// Human key of an issue's current scope, for the timeline entry.
async function scopeKey(ctx: Context, appTestId: string | null, sessionTestId: string | null) {
  if (appTestId) {
    const at = await ctx.prisma.appTest.findUnique({ where: { id: appTestId }, select: { number: true } });
    return at ? `APP-${at.number}` : "none";
  }
  if (sessionTestId) {
    const st = await ctx.prisma.sessionTest.findUnique({ where: { id: sessionTestId }, select: { number: true } });
    return st ? `ST-${st.number}` : "none";
  }
  return "none";
}

// Apply a transition: update issue + write a StatusEvent in one go.
async function transition(
  ctx: Context,
  issue: any,
  data: Record<string, any>,
  ev: { kind: string; fromVal?: string; toVal?: string; byId: string; note?: string },
) {
  const updated = await ctx.prisma.issue.update({
    where: { id: issue.id },
    data: { ...data, history: { create: ev } },
  });
  // Notify watchers of the issue on any transition (author excluded).
  const label = ev.toVal ? `${issue.title} → ${ev.toVal}` : issue.title;
  await notifyWatchers("ISSUE", issue.id, "WATCH", `Issue updated: ${label}`, { issueId: issue.id }, ev.byId);
  return updated;
}

// Reopening un-resolves the issue. `resolvedAt` is what the SLA sweep filters on
// (`scheduler.ts`: resolvedAt null) and what `classifyResolve` reads as "done", so
// leaving it set would freeze a reopened production issue out of SLA forever — and
// keep `canMarkProductionIssue` locked. The resolve-breach stamp goes with it so
// the new clock can notify again; the postmortem keeps the original resolve date.
const REOPEN_CLEARS = { resolvedAt: null, slaResolveNotifiedAt: null } as const;

// The verdict on a retest: PASS closes the issue, FAIL hands it back to the
// assignee. Shared by the single review and the bulk retest — `recomputeAppTest`
// deliberately stays with the caller so a batch can run it once per app test.
async function applyReview(ctx: Context, user: any, issue: any, pass: boolean, note?: string | null) {
  if (pass) {
    return transition(
      ctx,
      issue,
      { status: "CLOSED", closedAt: new Date() },
      { kind: "status", fromVal: "NEED_REVIEW", toVal: "CLOSED", byId: user.id, note: note ?? undefined },
    );
  }
  const updated = await transition(
    ctx,
    issue,
    { status: "REOPENED", ...REOPEN_CLEARS },
    { kind: "status", fromVal: "NEED_REVIEW", toVal: "REOPENED", byId: user.id, note: note ?? undefined },
  );
  await notify(issue.assigneeId, "ASSIGNED", `Issue reopened: ${issue.title}`, issue.id);
  return updated;
}

export const workflowResolvers = {
  Mutation: {
    async issueAccept(_: unknown, args: { id: string }, ctx: Context) {
      const user = await actor(ctx);
      const issue = await getIssue(ctx, args.id);
      assertAssignee(user, issue);
      if (issue.status !== "OPEN" && issue.status !== "REOPENED") {
        throw new Error(`Cannot accept from status ${issue.status}`);
      }
      const updated = await transition(
        ctx,
        issue,
        { status: "IN_PROGRESS", review: "ACCEPTED", respondedAt: issue.respondedAt ?? new Date() },
        { kind: "status", fromVal: issue.status, toVal: "IN_PROGRESS", byId: user.id },
      );
      await notify(issue.reporterId, "STATUS_CHANGED", `Issue accepted: ${issue.title}`, issue.id);
      return updated;
    },

    async issueReject(_: unknown, args: { id: string; reason: string }, ctx: Context) {
      const user = await actor(ctx);
      const issue = await getIssue(ctx, args.id);
      assertAssignee(user, issue);
      if (issue.status !== "OPEN" && issue.status !== "REOPENED") {
        throw new Error(`Cannot reject from status ${issue.status}`);
      }
      const updated = await transition(
        ctx,
        issue,
        { review: "REJECTED", respondedAt: issue.respondedAt ?? new Date() },
        { kind: "review", toVal: "REJECTED", byId: user.id, note: args.reason },
      );
      await notify(issue.reporterId, "REVIEW_REJECT", `Issue rejected: ${issue.title} — ${args.reason}`, issue.id);
      return updated;
    },

    async issueNeedClarify(_: unknown, args: { id: string; note: string }, ctx: Context) {
      const user = await actor(ctx);
      const issue = await getIssue(ctx, args.id);
      assertAssignee(user, issue);
      if (issue.status !== "OPEN" && issue.status !== "REOPENED") {
        throw new Error(`Cannot request clarification from status ${issue.status}`);
      }
      const updated = await transition(
        ctx,
        issue,
        { review: "NEED_CLARIFY", respondedAt: issue.respondedAt ?? new Date() },
        { kind: "review", toVal: "NEED_CLARIFY", byId: user.id, note: args.note },
      );
      await notify(
        issue.reporterId,
        "REVIEW_NEED_CLARIFY",
        `Clarification needed: ${issue.title} — ${args.note}`,
        issue.id,
      );
      return updated;
    },

    async issueSolve(_: unknown, args: { id: string; postmortem: any }, ctx: Context) {
      const user = await actor(ctx);
      const issue = await getIssue(ctx, args.id);
      assertAssignee(user, issue);
      if (issue.status !== "IN_PROGRESS") {
        throw new Error(`Can only solve from IN_PROGRESS (current: ${issue.status})`);
      }
      const p = args.postmortem;
      // Upsert postmortem (allow re-solve after reopen).
      await ctx.prisma.postmortem.upsert({
        where: { issueId: issue.id },
        update: {
          rootCause: p.rootCause,
          resolution: p.resolution,
          impact: p.impact ?? null,
          prevention: p.prevention ?? null,
          resolvedById: user.id,
        },
        create: {
          issueId: issue.id,
          rootCause: p.rootCause,
          resolution: p.resolution,
          impact: p.impact ?? null,
          prevention: p.prevention ?? null,
          resolvedById: user.id,
        },
      });
      const updated = await transition(
        ctx,
        issue,
        { status: "NEED_REVIEW", resolvedAt: new Date() },
        { kind: "status", fromVal: issue.status, toVal: "NEED_REVIEW", byId: user.id },
      );
      await notify(issue.reporterId, "STATUS_CHANGED", `Issue solved — awaiting your review: ${issue.title}`, issue.id);
      return updated;
    },

    async issueHold(_: unknown, args: { id: string }, ctx: Context) {
      const user = await actor(ctx);
      const issue = await getIssue(ctx, args.id);
      assertAssignee(user, issue);
      if (issue.status !== "IN_PROGRESS") throw new Error(`Can only hold from IN_PROGRESS`);
      const updated = await transition(
        ctx,
        issue,
        { status: "HOLD" },
        { kind: "status", fromVal: issue.status, toVal: "HOLD", byId: user.id },
      );
      await notify(issue.reporterId, "STATUS_CHANGED", `Issue put on hold: ${issue.title}`, issue.id);
      return updated;
    },

    async issueResume(_: unknown, args: { id: string }, ctx: Context) {
      const user = await actor(ctx);
      const issue = await getIssue(ctx, args.id);
      assertAssignee(user, issue);
      if (issue.status !== "HOLD") throw new Error(`Can only resume from HOLD`);
      const updated = await transition(
        ctx,
        issue,
        { status: "IN_PROGRESS" },
        { kind: "status", fromVal: issue.status, toVal: "IN_PROGRESS", byId: user.id },
      );
      await notify(issue.reporterId, "STATUS_CHANGED", `Issue resumed: ${issue.title}`, issue.id);
      return updated;
    },

    // QA reopens an already CLOSED issue.
    async issueReopen(_: unknown, args: { id: string; note?: string }, ctx: Context) {
      const user = await actor(ctx);
      const issue = await getIssue(ctx, args.id);
      assertReporterOrQA(user, issue);
      if (issue.status !== "CLOSED") throw new Error("Only a closed issue can be reopened");
      const updated = await transition(
        ctx,
        issue,
        { status: "REOPENED", closedAt: null, ...REOPEN_CLEARS },
        { kind: "status", fromVal: "CLOSED", toVal: "REOPENED", byId: user.id, note: args.note ?? undefined },
      );
      await notify(issue.assigneeId, "STATUS_CHANGED", `Issue reopened: ${issue.title}`, issue.id);
      if (issue.appTestId) await recomputeAppTest(issue.appTestId);
      return updated;
    },

    async issueClarifyRespond(_: unknown, args: { id: string; note?: string }, ctx: Context) {
      const user = await actor(ctx);
      const issue = await getIssue(ctx, args.id);
      assertReporterOrQA(user, issue);
      if (issue.review !== "NEED_CLARIFY") throw new Error("Issue is not awaiting clarification");
      const updated = await transition(
        ctx,
        issue,
        { review: "PENDING" },
        { kind: "review", fromVal: "NEED_CLARIFY", toVal: "PENDING", byId: user.id, note: args.note ?? undefined },
      );
      await notify(issue.assigneeId, "ASSIGNED", `Clarification provided: ${issue.title}`, issue.id);
      return updated;
    },

    async issueReview(_: unknown, args: { id: string; pass: boolean; note?: string }, ctx: Context) {
      const user = await actor(ctx);
      const issue = await getIssue(ctx, args.id);
      assertReporterOrQA(user, issue);
      if (issue.status !== "NEED_REVIEW") throw new Error(`Can only review from NEED_REVIEW`);
      const updated = await applyReview(ctx, user, issue, args.pass, args.note);
      if (issue.appTestId) await recomputeAppTest(issue.appTestId);
      return updated;
    },

    // Retest a batch of issues waiting for review. Each row writes its own
    // RecordTest — carrying the issue's own app test / session, so a retest can
    // never end up scope-less — and then applies the verdict: PASS closes, FAIL
    // reopens, BLOCKED decides nothing and leaves the issue exactly as it was.
    async bulkRetest(
      _: unknown,
      args: {
        executedAt: string;
        inputs: { issueId: string; result: "PASS" | "FAIL" | "BLOCKED"; note?: string | null; attachments: { url: string; kind: any; label?: string | null }[] }[];
      },
      ctx: Context,
    ) {
      const user = await actor(ctx);
      const { inputs } = args;
      if (inputs.length === 0) {
        throw new GraphQLError("Pick at least one issue to retest.", { extensions: { code: "BAD_USER_INPUT" } });
      }
      // The QA's own input is checked up front, before anything is written.
      inputs.forEach((i) => assertBlockerNoted(i.result, i.note));
      const executedAt = new Date(args.executedAt);

      let retested = 0;
      let skipped = 0;
      const touchedAppTests = new Set<string>();
      for (const i of inputs) {
        const issue = await ctx.prisma.issue.findUnique({ where: { id: i.issueId } });
        // Everything below is somebody else's state — an engineer may have moved
        // the issue a second ago, or the case may have gone back for review — so
        // an unusable row is skipped, never fatal for the rest of the batch.
        if (!issue || issue.status !== "NEED_REVIEW" || !canReviewIssue(user, issue)) {
          skipped++;
          continue;
        }
        const live = await ctx.prisma.testCase.count({ where: { id: issue.testCaseId, ...LIVE_TEST_CASE } });
        if (live === 0) {
          skipped++;
          continue;
        }
        await ctx.prisma.recordTest.create({
          data: recordData({
            ...i,
            testCaseId: issue.testCaseId,
            executedById: user.id,
            executedAt,
            retestIssueId: issue.id,
            // The issue's own scope, never the caller's word for it.
            appTestId: issue.appTestId,
            sessionTestId: issue.sessionTestId,
          }),
        });
        // A blocked retest reached no verdict, so it says nothing about the issue.
        if (i.result !== "BLOCKED") await applyReview(ctx, user, issue, i.result === "PASS", i.note);
        // The run alone moves the app test's coverage, blocked or not.
        if (issue.appTestId) touchedAppTests.add(issue.appTestId);
        retested++;
      }
      // Once per app test, not once per issue.
      for (const id of touchedAppTests) await recomputeAppTest(id);
      return { retested, skipped };
    },

    async setIssueArchived(_: unknown, args: { id: string; archived: boolean }, ctx: Context) {
      const user = await actor(ctx);
      const issue = await getIssue(ctx, args.id);
      assertReporterOrQA(user, issue);
      const updated = await transition(
        ctx,
        issue,
        { archived: args.archived },
        { kind: "archive", toVal: String(args.archived), byId: user.id },
      );
      if (issue.appTestId) await recomputeAppTest(issue.appTestId);
      return updated;
    },

    // QA marks whether a PRODUCTION-environment finding is a real production
    // issue. Only then does SLA apply. App-test findings can never be marked.
    async setProductionIssue(_: unknown, args: { id: string; value: boolean }, ctx: Context) {
      const user = await actor(ctx);
      const issue = await getIssue(ctx, args.id);
      assertReporterOrQA(user, issue);
      if (issue.appTestId) throw new Error("Issues found on an app test cannot be production issues");
      if (!canMarkProductionIssue(issue)) {
        throw new Error(
          issue.resolvedAt
            ? "Cannot change the production-issue flag after the issue is resolved"
            : "Only PRODUCTION-environment issues can be marked as production issues",
        );
      }
      return transition(
        ctx,
        issue,
        { isProductionIssue: args.value },
        { kind: "productionIssue", fromVal: String(issue.isProductionIssue), toVal: String(args.value), byId: user.id },
      );
    },

    // Re-point a finding at the app test / testing session it actually came from
    // (pass neither to unlink). QA needs this when an issue was filed outside the
    // app-test flow, or filed against the wrong one.
    async setIssueScope(
      _: unknown,
      args: { id: string; appTestId?: string | null; sessionTestId?: string | null },
      ctx: Context,
    ) {
      const user = await actor(ctx);
      const issue = await getIssue(ctx, args.id);
      assertReporterOrQA(user, issue);
      const appTestId = args.appTestId ?? null;
      const sessionTestId = args.sessionTestId ?? null;
      if (appTestId && sessionTestId) {
        throw new Error("An issue belongs to one app test or one testing session, not both");
      }
      // Testing findings can never carry the SLA flag (`resolveProductionFlag`), so
      // linking one would silently drop it. Refuse instead — QA unmarks it first.
      if (issue.isProductionIssue && (appTestId || sessionTestId)) {
        throw new Error("Unmark the production issue first — findings from an app test or session cannot be production issues");
      }
      if (issue.appTestId === appTestId && issue.sessionTestId === sessionTestId) return issue;

      const target = appTestId
        ? await ctx.prisma.appTest.findUnique({ where: { id: appTestId }, select: { number: true, projectId: true } })
        : sessionTestId
          ? await ctx.prisma.sessionTest.findUnique({ where: { id: sessionTestId }, select: { number: true, projectId: true } })
          : null;
      if ((appTestId || sessionTestId) && !target) throw new Error("App test or testing session not found");
      if (target) {
        const tc = await ctx.prisma.testCase.findUnique({
          where: { id: issue.testCaseId },
          select: { feature: { select: { projectId: true } } },
        });
        if (target.projectId !== tc?.feature.projectId) {
          throw new Error("The app test or testing session must belong to the same project as the test case");
        }
      }

      const updated = await transition(
        ctx,
        issue,
        { appTestId, sessionTestId },
        {
          kind: "scope",
          fromVal: await scopeKey(ctx, issue.appTestId, issue.sessionTestId),
          toVal: appTestId ? `APP-${target!.number}` : sessionTestId ? `ST-${target!.number}` : "none",
          byId: user.id,
        },
      );
      // App-test coverage counts open issues, so both sides go stale.
      if (issue.appTestId) await recomputeAppTest(issue.appTestId);
      if (appTestId) await recomputeAppTest(appTestId);
      return updated;
    },
  },

  StatusEvent: {
    at: (e: any) => e.at.toISOString(),
    by: (e: any, _: unknown, ctx: Context) => ctx.prisma.user.findUnique({ where: { id: e.byId } }),
  },
  Postmortem: {
    resolvedAt: (p: any) => p.resolvedAt.toISOString(),
    resolvedBy: (p: any, _: unknown, ctx: Context) =>
      ctx.prisma.user.findUnique({ where: { id: p.resolvedById } }),
  },
};
