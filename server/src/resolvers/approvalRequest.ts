import { GraphQLError } from "graphql";
import type { Context } from "../context.js";
import { requireAuth, requireApprover } from "../context.js";
import { approvalMode, canApproveTestCase, isApproverRole, autoApprovesNow } from "../approval.js";
import { cloneTestCaseInto, cloneFeatureInto, cloneProjectDeep } from "../clone.js";
import { notify, notifyTestCaseApprovers } from "../notify.js";
import { moveAppTestToProject } from "./appTest.js";
import { prisma } from "../db.js";

export type RequestKind = "MOVE" | "COPY" | "DELETE" | "DEACTIVATE" | "ACTIVATE";
export type Target = "PROJECT" | "FEATURE" | "TEST_CASE" | "APP_TEST";

const KIND_LABEL: Record<RequestKind, string> = {
  MOVE: "move",
  COPY: "copy",
  DELETE: "delete",
  DEACTIVATE: "deactivate",
  ACTIVATE: "activate",
};

// Human label of the thing a request is about, for notifications.
async function targetLabel(ctx: Context, target: Target, targetId: string): Promise<string> {
  if (target === "TEST_CASE") {
    const tc = await ctx.prisma.testCase.findUnique({ where: { id: targetId }, select: { number: true, name: true } });
    return tc ? `TC-${tc.number} — ${tc.name}` : "a test case";
  }
  if (target === "FEATURE") {
    const f = await ctx.prisma.feature.findUnique({ where: { id: targetId }, select: { number: true, name: true } });
    return f ? `FEAT-${f.number} — ${f.name}` : "a feature";
  }
  if (target === "APP_TEST") {
    const at = await ctx.prisma.appTest.findUnique({ where: { id: targetId }, select: { number: true } });
    return at ? `APP-${at.number}` : "an app test";
  }
  const p = await ctx.prisma.project.findUnique({ where: { id: targetId }, select: { number: true, name: true } });
  return p ? `PRJ-${p.number} — ${p.name}` : "a project";
}

// How long an undecided change may wait before it approves itself (admin
// setting, hours; null = never, 0 = immediately).
export async function changeAutoApproveHours(ctx: Context): Promise<number | null> {
  const s = await ctx.prisma.setting.findUnique({ where: { id: "singleton" } });
  return s?.autoApproveChangeHours ?? null;
}

// A change to existing content either happens now — the actor is a super admin,
// or the admin setting says approve immediately — or it becomes a request and the
// content carries on untouched until someone decides.
export async function needsApproval(ctx: Context, actorRole: string): Promise<boolean> {
  if (actorRole === "SUPER_ADMIN") return false;
  return !autoApprovesNow(await changeAutoApproveHours(ctx));
}

// Move / copy / retire only make sense for content the team agreed on. A case
// still in review has no place in the catalogue to move, copy or retire — the UI
// hides those actions, and this keeps the server honest about it.
export async function assertReviewedForChange(ctx: Context, testCaseId: string, what: string) {
  const tc = await ctx.prisma.testCase.findUnique({ where: { id: testCaseId }, select: { approval: true } });
  if (!tc) throw new Error("Test case not found");
  if (tc.approval !== "APPROVED") {
    throw new GraphQLError(`This test case is still waiting for approval, so it can't be ${what} yet.`, {
      extensions: { code: "TEST_CASE_NOT_APPROVED" },
    });
  }
}

// Deleting a case that never made it into the catalogue needs no approval:
// nothing is lost that the team ever agreed to. Rejecting is the reviewer's way
// of saying no; this is the author's way of withdrawing.
export async function deleteNeedsApproval(ctx: Context, actorRole: string, testCaseId: string): Promise<boolean> {
  const tc = await ctx.prisma.testCase.findUnique({ where: { id: testCaseId }, select: { approval: true } });
  if (tc?.approval !== "APPROVED") return false;
  return needsApproval(ctx, actorRole);
}

// Marks a request as the open one for its target while it waits. Cleared on a
// decision so the next request can take the slot.
const openKeyFor = (target: Target, targetId: string) => `${target}:${targetId}`;

const alreadyOpen = () =>
  new GraphQLError("This already has a change waiting for approval.", {
    extensions: { code: "APPROVAL_REQUEST_OPEN" },
  });

// Open a request. One open request per target, enforced by openKey's unique index.
export async function openRequest(
  ctx: Context,
  actor: { id: string; role: string },
  target: Target,
  targetId: string,
  kind: RequestKind,
  extra: {
    featureId?: string | null;
    projectId?: string | null;
    name?: string | null;
    mode?: "DROP" | "CLONE" | null;
  } = {},
) {
  const label = await targetLabel(ctx, target, targetId);
  // The early check gives a clean message; openKey's unique index is what makes
  // it true under a double click or two tabs.
  const open = await ctx.prisma.approvalRequest.findFirst({ where: { target, targetId, state: "PENDING" } });
  if (open) throw alreadyOpen();
  let req;
  try {
    req = await ctx.prisma.approvalRequest.create({
      data: {
        target,
        targetId,
        openKey: openKeyFor(target, targetId),
        // Stamped once here so scoped analytics never has to resolve a polymorphic
        // id per row.
        projectId: await requestProjectId(ctx, { target, targetId }),
        kind,
        targetFeatureId: extra.featureId ?? null,
        targetProjectId: extra.projectId ?? null,
        targetName: extra.name ?? null,
        assignmentMode: extra.mode ?? null,
        requestedById: actor.id,
      },
    });
  } catch (e: any) {
    // P2002 = the unique index caught a request that raced this one.
    if (e?.code === "P2002") throw alreadyOpen();
    throw e;
  }
  await notifyTestCaseApprovers(
    actor,
    "APPROVAL_REQUEST",
    `Approval needed to ${KIND_LABEL[kind]} ${label}`,
    target === "TEST_CASE" ? targetId : null,
  );
  return req;
}

// Carry out an approved request.
async function runRequest(ctx: Context, req: any): Promise<void> {
  const target = req.target as Target;
  const kind = req.kind as RequestKind;

  if (target === "APP_TEST") {
    // The only thing queued for an app test is a project move.
    const project = await ctx.prisma.project.findUnique({ where: { id: req.targetProjectId ?? "" } });
    if (!project) throw new Error("Target project not found");
    await moveAppTestToProject(ctx, req.targetId, project.id, req.assignmentMode ?? "DROP", req.requestedById);
    return;
  }
  if (kind === "ACTIVATE" || kind === "DEACTIVATE") {
    const active = kind === "ACTIVATE";
    if (target === "PROJECT") await ctx.prisma.project.update({ where: { id: req.targetId }, data: { active } });
    else if (target === "FEATURE") await ctx.prisma.feature.update({ where: { id: req.targetId }, data: { active } });
    else await ctx.prisma.testCase.update({ where: { id: req.targetId }, data: { active } });
    return;
  }
  if (kind === "DELETE") {
    // Requests have no FK to their target, so a cascade delete would leave the
    // requests of everything underneath pointing at rows that no longer exist.
    if (target === "PROJECT" || target === "FEATURE") {
      await dropRequestsUnder(ctx, target, req.targetId, req.id);
      if (target === "PROJECT") await ctx.prisma.project.delete({ where: { id: req.targetId } });
      else await ctx.prisma.feature.delete({ where: { id: req.targetId } });
    } else {
      await ctx.prisma.testCase.delete({ where: { id: req.targetId } });
      await ctx.prisma.approvalRequest.deleteMany({ where: { target, targetId: req.targetId, id: { not: req.id } } });
    }
    return;
  }
  // MOVE / COPY: a project copies in place, a feature lands in a project, a test
  // case lands in a feature.
  if (target === "PROJECT") {
    if (kind === "MOVE") throw new Error("A project has nowhere to move to");
    await cloneProjectDeep(req.targetId, req.requestedById, req.targetName ?? undefined);
    return;
  }
  if (target === "FEATURE") {
    const project = await ctx.prisma.project.findUnique({ where: { id: req.targetProjectId ?? "" } });
    if (!project) throw new Error("Target project not found");
    if (kind === "MOVE") {
      await ctx.prisma.feature.update({ where: { id: req.targetId }, data: { projectId: project.id } });
      return;
    }
    await cloneFeatureInto(req.targetId, project.id, req.requestedById, req.targetName ?? undefined);
    return;
  }
  const feature = await ctx.prisma.feature.findUnique({ where: { id: req.targetFeatureId ?? "" } });
  if (!feature) throw new Error("Target feature not found");
  if (kind === "MOVE") {
    await ctx.prisma.testCase.update({ where: { id: req.targetId }, data: { featureId: feature.id } });
    return;
  }
  // The requester stays the author of the copy — they asked for it.
  await cloneTestCaseInto(req.targetId, feature.id, req.requestedById, req.targetName ?? undefined);
}

// Approve a request and run it. Same rank rule as a test case: the approver must
// match or outrank the requester and can't be them.
export async function approveRequest(ctx: Context, actor: { id: string; role: string }, reqId: string) {
  const req = await ctx.prisma.approvalRequest.findUnique({
    where: { id: reqId },
    include: { requestedBy: { select: { id: true, role: true } } },
  });
  if (!req) throw new Error("Request not found");
  if (req.state !== "PENDING") return req;
  if (!canApproveTestCase(actor, req.requestedBy, await approvalMode())) {
    throw new GraphQLError("You may not review this change — it needs an approver of the requester's level or higher, and never the requester.", {
      extensions: { code: "FORBIDDEN" },
    });
  }
  const label = await targetLabel(ctx, req.target as Target, req.targetId);
  // Stamp the decision before running: a DELETE removes the target, and the
  // label has to be read while it still exists.
  const decided = await ctx.prisma.approvalRequest.update({
    where: { id: req.id },
    data: { state: "APPROVED", reviewedById: actor.id, reviewedAt: new Date(), openKey: null },
  });
  await runRequest(ctx, req);
  await notify(
    req.requestedById,
    "APPROVAL_REQUEST_APPROVED",
    `Approved: ${KIND_LABEL[req.kind as RequestKind]} ${label}`,
    null,
    null,
    null,
    null,
    // A deleted target has no page left to open.
    req.target === "TEST_CASE" && req.kind !== "DELETE" ? req.targetId : null,
  );
  return decided;
}

// Scheduler path: the configured window ran out and nobody decided. No approver
// id is stamped — nobody reviewed it.
export async function autoApproveRequest(reqId: string, now: Date): Promise<void> {
  const ctx = { prisma } as unknown as Context;
  const req = await prisma.approvalRequest.findUnique({ where: { id: reqId } });
  if (!req || req.state !== "PENDING") return;
  const label = await targetLabel(ctx, req.target as Target, req.targetId);
  await prisma.approvalRequest.update({
    where: { id: req.id },
    data: { state: "APPROVED", reviewedAt: now, reviewedById: null, openKey: null },
  });
  await runRequest(ctx, req);
  await notify(
    req.requestedById,
    "APPROVAL_REQUEST_APPROVED",
    `Auto-approved: ${KIND_LABEL[req.kind as RequestKind]} ${label}`,
    null,
    null,
    null,
    null,
    req.target === "TEST_CASE" && req.kind !== "DELETE" ? req.targetId : null,
  );
}

export const approvalRequestResolvers = {
  Query: {
    // Open changes awaiting a decision, oldest first — shown next to the pending
    // test cases in one list.
    async pendingApprovalRequests(_: unknown, args: { projectId?: string | null }, ctx: Context) {
      requireAuth(ctx);
      const rows = await ctx.prisma.approvalRequest.findMany({
        where: { state: "PENDING" },
        orderBy: { requestedAt: "asc" },
      });
      if (!args.projectId) return rows;
      // Narrowing by project means resolving each target's project — cheap at
      // pending-queue sizes, and it keeps the polymorphic ref FK-free.
      const out = [];
      for (const r of rows) {
        if ((await requestProjectId(ctx, r)) === args.projectId) out.push(r);
      }
      return out;
    },
  },
  Mutation: {
    async approveApprovalRequest(_: unknown, args: { id: string }, ctx: Context) {
      const user = await requireApprover(ctx);
      return approveRequest(ctx, user, args.id);
    },
    // Same skip-what-you-may-not semantics as bulk test case approval.
    async approveApprovalRequests(_: unknown, args: { ids: string[] }, ctx: Context) {
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
    // The requester withdrawing their own request. Not a review — no reason, no
    // rank rule — so the row simply goes away; AuditLog keeps the trace.
    async cancelApprovalRequest(_: unknown, args: { id: string }, ctx: Context) {
      const userId = requireAuth(ctx);
      const req = await ctx.prisma.approvalRequest.findUnique({ where: { id: args.id } });
      if (!req) throw new Error("Request not found");
      if (req.state !== "PENDING") {
        throw new GraphQLError("This change has already been decided.", { extensions: { code: "BAD_USER_INPUT" } });
      }
      if (req.requestedById !== userId) {
        throw new GraphQLError("Only the person who asked for this change can cancel it.", {
          extensions: { code: "FORBIDDEN" },
        });
      }
      await ctx.prisma.approvalRequest.delete({ where: { id: req.id } });
      return true;
    },
    async rejectApprovalRequest(_: unknown, args: { id: string; reason: string }, ctx: Context) {
      const user = await requireApprover(ctx);
      const reason = args.reason.trim();
      if (!reason) {
        throw new GraphQLError("Say why the change is rejected.", { extensions: { code: "BAD_USER_INPUT" } });
      }
      const req = await ctx.prisma.approvalRequest.findUnique({
        where: { id: args.id },
        include: { requestedBy: { select: { id: true, role: true } } },
      });
      if (!req) throw new Error("Request not found");
      if (req.state !== "PENDING") return req;
      if (!canApproveTestCase(user, req.requestedBy, await approvalMode())) {
        throw new GraphQLError("You may not review this change.", { extensions: { code: "FORBIDDEN" } });
      }
      const label = await targetLabel(ctx, req.target as Target, req.targetId);
      const decided = await ctx.prisma.approvalRequest.update({
        where: { id: req.id },
        data: { state: "REJECTED", reviewedById: user.id, reviewedAt: new Date(), rejectReason: reason, openKey: null },
      });
      await notify(
        req.requestedById,
        "APPROVAL_REQUEST_REJECTED",
        `Rejected: ${KIND_LABEL[req.kind as RequestKind]} ${label} — ${reason}`,
        null,
        null,
        null,
        null,
        req.target === "TEST_CASE" ? req.targetId : null,
      );
      return decided;
    },
  },
  ApprovalRequest: {
    requestedAt: (r: any) => r.requestedAt.toISOString(),
    reviewedAt: (r: any) => r.reviewedAt?.toISOString() ?? null,
    requestedBy: (r: any, _: unknown, ctx: Context) => ctx.prisma.user.findUnique({ where: { id: r.requestedById } }),
    reviewedBy: (r: any, _: unknown, ctx: Context) =>
      r.reviewedById ? ctx.prisma.user.findUnique({ where: { id: r.reviewedById } }) : null,
    testCase: (r: any, _: unknown, ctx: Context) =>
      r.target === "TEST_CASE" ? ctx.prisma.testCase.findUnique({ where: { id: r.targetId } }) : null,
    feature: (r: any, _: unknown, ctx: Context) =>
      r.target === "FEATURE" ? ctx.prisma.feature.findUnique({ where: { id: r.targetId } }) : null,
    project: (r: any, _: unknown, ctx: Context) =>
      r.target === "PROJECT" ? ctx.prisma.project.findUnique({ where: { id: r.targetId } }) : null,
    appTest: (r: any, _: unknown, ctx: Context) =>
      r.target === "APP_TEST" ? ctx.prisma.appTest.findUnique({ where: { id: r.targetId } }) : null,
    targetFeature: (r: any, _: unknown, ctx: Context) =>
      r.targetFeatureId ? ctx.prisma.feature.findUnique({ where: { id: r.targetFeatureId } }) : null,
    targetProject: (r: any, _: unknown, ctx: Context) =>
      r.targetProjectId ? ctx.prisma.project.findUnique({ where: { id: r.targetProjectId } }) : null,
    // One label the client can print without knowing which target it is.
    label: (r: any, _: unknown, ctx: Context) => targetLabel(ctx, r.target as Target, r.targetId),
    // Only the requester can withdraw, and only while nobody has decided.
    canCancel: (r: any, _: unknown, ctx: Context) => r.state === "PENDING" && r.requestedById === ctx.userId,
    async canApprove(r: any, _: unknown, ctx: Context) {
      const mode = await approvalMode();
      if (!ctx.userId || !isApproverRole(ctx.role, mode) || r.state !== "PENDING") return false;
      const requester = await ctx.prisma.user.findUnique({
        where: { id: r.requestedById },
        select: { id: true, role: true },
      });
      return !!requester && canApproveTestCase({ id: ctx.userId, role: ctx.role! }, requester, mode);
    },
  },
};

// Project a request belongs to, whatever its target level.
async function requestProjectId(ctx: Context, r: { target: string; targetId: string }): Promise<string | null> {
  if (r.target === "PROJECT") return r.targetId;
  if (r.target === "FEATURE") {
    const f = await ctx.prisma.feature.findUnique({ where: { id: r.targetId }, select: { projectId: true } });
    return f?.projectId ?? null;
  }
  if (r.target === "APP_TEST") {
    const at = await ctx.prisma.appTest.findUnique({ where: { id: r.targetId }, select: { projectId: true } });
    return at?.projectId ?? null;
  }
  const tc = await ctx.prisma.testCase.findUnique({
    where: { id: r.targetId },
    select: { feature: { select: { projectId: true } } },
  });
  return tc?.feature.projectId ?? null;
}

// Retired content is read-only: it keeps its history and stays visible, but
// nothing edits it until an activation is approved. A test case is also retired
// when its feature or project is — checking the chain here is what stops the
// lower level from being a way around the upper one.
export async function assertActive(ctx: Context, target: Target, id: string): Promise<void> {
  if (target === "TEST_CASE") {
    const tc = await ctx.prisma.testCase.findUnique({
      where: { id },
      select: { active: true, feature: { select: { active: true, project: { select: { active: true } } } } },
    });
    if (!tc) throw new Error("Test case not found");
    if (!tc.active) throw inactive("test case");
    if (!tc.feature.active) throw inactive("feature");
    if (!tc.feature.project.active) throw inactive("project");
    return;
  }
  if (target === "FEATURE") {
    const f = await ctx.prisma.feature.findUnique({
      where: { id },
      select: { active: true, project: { select: { active: true } } },
    });
    if (!f) throw new Error("Feature not found");
    if (!f.active) throw inactive("feature");
    if (!f.project.active) throw inactive("project");
    return;
  }
  const p = await ctx.prisma.project.findUnique({ where: { id }, select: { active: true } });
  if (!p) throw new Error("Project not found");
  if (!p.active) throw inactive("project");
}

function inactive(what: string) {
  return new GraphQLError(`This ${what} is inactive, so it can't be changed. Ask for it to be activated first.`, {
    extensions: { code: "INACTIVE" },
  });
}

// Requests point at their target by plain id, so a cascade delete leaves the
// requests of everything underneath behind. Clear them with the parent.
export async function dropRequestsUnder(
  ctx: Context,
  target: "PROJECT" | "FEATURE",
  id: string,
  // The request being executed right now: it stays as the record of the decision.
  exceptId?: string,
): Promise<void> {
  const featureIds =
    target === "PROJECT"
      ? (await ctx.prisma.feature.findMany({ where: { projectId: id }, select: { id: true } })).map((f) => f.id)
      : [id];
  const caseIds = (
    await ctx.prisma.testCase.findMany({ where: { featureId: { in: featureIds } }, select: { id: true } })
  ).map((t) => t.id);
  const appTestIds =
    target === "PROJECT"
      ? (await ctx.prisma.appTest.findMany({ where: { projectId: id }, select: { id: true } })).map((a) => a.id)
      : [];
  await ctx.prisma.approvalRequest.deleteMany({
    where: {
      ...(exceptId ? { id: { not: exceptId } } : {}),
      OR: [
        { target, targetId: id },
        { target: "FEATURE", targetId: { in: featureIds } },
        { target: "TEST_CASE", targetId: { in: caseIds } },
        ...(appTestIds.length ? [{ target: "APP_TEST" as const, targetId: { in: appTestIds } }] : []),
      ],
    },
  });
}
