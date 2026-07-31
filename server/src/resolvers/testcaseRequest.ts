import { GraphQLError } from "graphql";
import type { Context } from "../context.js";
import { requireAuth, requireApprover } from "../context.js";
import { canApproveTestCase, isApproverRole, autoApprovesNow } from "../approval.js";
import { cloneTestCaseInto } from "../clone.js";
import { notify, notifyTestCaseApprovers } from "../notify.js";
import { prisma } from "../db.js";

export type RequestKind = "MOVE" | "COPY" | "DELETE" | "DEACTIVATE" | "ACTIVATE";

const LABEL: Record<RequestKind, string> = {
  MOVE: "move",
  COPY: "copy",
  DELETE: "delete",
  DEACTIVATE: "deactivate",
  ACTIVATE: "activate",
};

// How long an undecided change may wait before it approves itself (admin
// setting, hours; null = never, 0 = immediately).
export async function changeAutoApproveHours(ctx: Context): Promise<number | null> {
  const s = await ctx.prisma.setting.findUnique({ where: { id: "singleton" } });
  return s?.autoApproveChangeHours ?? null;
}

// A change to an existing test case either happens now — the actor is a super
// admin, or the admin setting says approve immediately — or it becomes a request
// and the case carries on untouched until someone decides.
export async function needsApproval(ctx: Context, actorRole: string): Promise<boolean> {
  if (actorRole === "SUPER_ADMIN") return false;
  return !autoApprovesNow(await changeAutoApproveHours(ctx));
}

// Open a request. One open request per case: a second one would race the first.
export async function openRequest(
  ctx: Context,
  actor: { id: string; role: string },
  testCaseId: string,
  kind: RequestKind,
  target: { featureId?: string | null; name?: string | null } = {},
) {
  const tc = await ctx.prisma.testCase.findUnique({
    where: { id: testCaseId },
    include: { createdBy: { select: { id: true, role: true } } },
  });
  if (!tc) throw new Error("Test case not found");
  const open = await ctx.prisma.testCaseRequest.findFirst({ where: { testCaseId, state: "PENDING" } });
  if (open) {
    throw new GraphQLError("This test case already has a change waiting for approval.", {
      extensions: { code: "TEST_CASE_REQUEST_OPEN" },
    });
  }
  const req = await ctx.prisma.testCaseRequest.create({
    data: {
      testCaseId,
      kind,
      targetFeatureId: target.featureId ?? null,
      targetName: target.name ?? null,
      requestedById: actor.id,
    },
  });
  await notifyTestCaseApprovers(
    actor,
    "TEST_CASE_REQUEST",
    `Approval needed to ${LABEL[kind]} TC-${tc.number} — ${tc.name}`,
    tc.id,
  );
  return req;
}

// Carry out an approved request. Returns the test case id the caller should
// point at afterwards (a MOVE keeps the same row, a COPY creates a new one).
async function runRequest(ctx: Context, req: any, actorId: string): Promise<void> {
  switch (req.kind as RequestKind) {
    case "MOVE": {
      const target = await ctx.prisma.feature.findUnique({ where: { id: req.targetFeatureId ?? "" } });
      if (!target) throw new Error("Target feature not found");
      await ctx.prisma.testCase.update({ where: { id: req.testCaseId }, data: { featureId: target.id } });
      return;
    }
    case "COPY": {
      const target = await ctx.prisma.feature.findUnique({ where: { id: req.targetFeatureId ?? "" } });
      if (!target) throw new Error("Target feature not found");
      // The requester stays the author of the copy — they asked for it.
      await cloneTestCaseInto(req.testCaseId, target.id, req.requestedById, req.targetName ?? undefined);
      return;
    }
    case "DELETE":
      await ctx.prisma.testCase.delete({ where: { id: req.testCaseId } });
      return;
    case "DEACTIVATE":
    case "ACTIVATE":
      await ctx.prisma.testCase.update({
        where: { id: req.testCaseId },
        data: { active: req.kind === "ACTIVATE" },
      });
      return;
  }
}

// Approve a request and run it. Same rank rule as a test case: the approver must
// match or outrank the requester and can't be them.
export async function approveRequest(ctx: Context, actor: { id: string; role: string }, reqId: string) {
  const req = await ctx.prisma.testCaseRequest.findUnique({
    where: { id: reqId },
    include: {
      requestedBy: { select: { id: true, role: true } },
      testCase: { select: { number: true, name: true } },
    },
  });
  if (!req) throw new Error("Request not found");
  if (req.state !== "PENDING") return req;
  if (!canApproveTestCase(actor, req.requestedBy)) {
    throw new GraphQLError("You may not review this change — it needs an approver of the requester's level or higher, and never the requester.", {
      extensions: { code: "FORBIDDEN" },
    });
  }
  // Stamp the decision before running: a DELETE removes the case and cascades
  // its requests away, so the update has to land first.
  const decided = await ctx.prisma.testCaseRequest.update({
    where: { id: req.id },
    data: { state: "APPROVED", reviewedById: actor.id, reviewedAt: new Date() },
  });
  await runRequest(ctx, req, actor.id);
  await notify(
    req.requestedById,
    "TEST_CASE_REQUEST_APPROVED",
    `Approved: ${LABEL[req.kind as RequestKind]} TC-${req.testCase.number} — ${req.testCase.name}`,
    null,
    null,
    null,
    null,
    // A deleted case has no page left to open.
    req.kind === "DELETE" ? null : req.testCaseId,
  );
  return decided;
}

// Scheduler path: the configured window ran out and nobody decided. No approver
// id is stamped — nobody reviewed it.
export async function autoApproveRequest(reqId: string, now: Date): Promise<void> {
  const ctx = { prisma } as unknown as Context;
  const req = await prisma.testCaseRequest.findUnique({
    where: { id: reqId },
    include: { testCase: { select: { number: true, name: true } } },
  });
  if (!req || req.state !== "PENDING") return;
  await prisma.testCaseRequest.update({
    where: { id: req.id },
    data: { state: "APPROVED", reviewedAt: now, reviewedById: null },
  });
  await runRequest(ctx, req, req.requestedById);
  await notify(
    req.requestedById,
    "TEST_CASE_REQUEST_APPROVED",
    `Auto-approved: ${LABEL[req.kind as RequestKind]} TC-${req.testCase.number} — ${req.testCase.name}`,
    null,
    null,
    null,
    null,
    req.kind === "DELETE" ? null : req.testCaseId,
  );
}

export const testCaseRequestResolvers = {
  Query: {
    // Open changes awaiting a decision, oldest first — shown next to the pending
    // test cases in one list.
    async pendingTestCaseRequests(_: unknown, args: { projectId?: string | null }, ctx: Context) {
      requireAuth(ctx);
      return ctx.prisma.testCaseRequest.findMany({
        where: {
          state: "PENDING",
          ...(args.projectId ? { testCase: { feature: { projectId: args.projectId } } } : {}),
        },
        orderBy: { requestedAt: "asc" },
      });
    },
  },
  Mutation: {
    async approveTestCaseRequest(_: unknown, args: { id: string }, ctx: Context) {
      const user = await requireApprover(ctx);
      return approveRequest(ctx, user, args.id);
    },
    // Same skip-what-you-may-not semantics as bulk test case approval.
    async approveTestCaseRequests(_: unknown, args: { ids: string[] }, ctx: Context) {
      const user = await requireApprover(ctx);
      let approved = 0;
      for (const id of args.ids) {
        try {
          await approveRequest(ctx, user, id);
          approved += 1;
        } catch {
          // Not this user's call, or already decided — skip it.
        }
      }
      return { approved, skipped: args.ids.length - approved };
    },
    async rejectTestCaseRequest(_: unknown, args: { id: string; reason: string }, ctx: Context) {
      const user = await requireApprover(ctx);
      const reason = args.reason.trim();
      if (!reason) {
        throw new GraphQLError("Say why the change is rejected.", { extensions: { code: "BAD_USER_INPUT" } });
      }
      const req = await ctx.prisma.testCaseRequest.findUnique({
        where: { id: args.id },
        include: {
          requestedBy: { select: { id: true, role: true } },
          testCase: { select: { number: true, name: true } },
        },
      });
      if (!req) throw new Error("Request not found");
      if (req.state !== "PENDING") return req;
      if (!canApproveTestCase(user, req.requestedBy)) {
        throw new GraphQLError("You may not review this change.", { extensions: { code: "FORBIDDEN" } });
      }
      const decided = await ctx.prisma.testCaseRequest.update({
        where: { id: req.id },
        data: { state: "REJECTED", reviewedById: user.id, reviewedAt: new Date(), rejectReason: reason },
      });
      await notify(
        req.requestedById,
        "TEST_CASE_REQUEST_REJECTED",
        `Rejected: ${LABEL[req.kind as RequestKind]} TC-${req.testCase.number} — ${reason}`,
        null,
        null,
        null,
        null,
        req.testCaseId,
      );
      return decided;
    },
  },
  TestCaseRequest: {
    requestedAt: (r: any) => r.requestedAt.toISOString(),
    reviewedAt: (r: any) => r.reviewedAt?.toISOString() ?? null,
    requestedBy: (r: any, _: unknown, ctx: Context) => ctx.prisma.user.findUnique({ where: { id: r.requestedById } }),
    reviewedBy: (r: any, _: unknown, ctx: Context) =>
      r.reviewedById ? ctx.prisma.user.findUnique({ where: { id: r.reviewedById } }) : null,
    testCase: (r: any, _: unknown, ctx: Context) => ctx.prisma.testCase.findUnique({ where: { id: r.testCaseId } }),
    targetFeature: (r: any, _: unknown, ctx: Context) =>
      r.targetFeatureId ? ctx.prisma.feature.findUnique({ where: { id: r.targetFeatureId } }) : null,
    async canApprove(r: any, _: unknown, ctx: Context) {
      if (!ctx.userId || !isApproverRole(ctx.role) || r.state !== "PENDING") return false;
      const requester = await ctx.prisma.user.findUnique({
        where: { id: r.requestedById },
        select: { id: true, role: true },
      });
      return !!requester && canApproveTestCase({ id: ctx.userId, role: ctx.role! }, requester);
    },
  },
};
