import type { Context } from "../context.js";
import { requireAuth } from "../context.js";
import { notify, notifyWatchers } from "../notify.js";
import { recomputeAppTest } from "../appTestStatus.js";

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
// QA actions require the reporter or a QA/admin.
function assertReporterOrQA(user: any, issue: any) {
  if (issue.reporterId !== user.id && user.role !== "QA" && !isAdmin(user.role)) {
    throw new Error("Forbidden: only QA/reporter may do this");
  }
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
        { status: "REOPENED", closedAt: null },
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
      if (args.pass) {
        const closed = await transition(
          ctx,
          issue,
          { status: "CLOSED", closedAt: new Date() },
          { kind: "status", fromVal: "NEED_REVIEW", toVal: "CLOSED", byId: user.id, note: args.note ?? undefined },
        );
        if (issue.appTestId) await recomputeAppTest(issue.appTestId);
        return closed;
      }
      const updated = await transition(
        ctx,
        issue,
        { status: "REOPENED" },
        { kind: "status", fromVal: "NEED_REVIEW", toVal: "REOPENED", byId: user.id, note: args.note ?? undefined },
      );
      await notify(issue.assigneeId, "ASSIGNED", `Issue reopened: ${issue.title}`, issue.id);
      if (issue.appTestId) await recomputeAppTest(issue.appTestId);
      return updated;
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
