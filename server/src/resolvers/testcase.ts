import { GraphQLError } from "graphql";
import type { Context } from "../context.js";
import { requireAuth, requireQA, requireApprover } from "../context.js";
import { cloneTestCaseInto } from "../clone.js";
import { approvalOnCreate, canApproveTestCase, editKeepsApproval, isApproverRole, autoApprovesNow, LIVE_TEST_CASE } from "../approval.js";
import { notify, notifyTestCaseApprovers } from "../notify.js";
import {
  needsApproval,
  deleteNeedsApproval,
  assertReviewedForChange,
  assertActive,
  openRequest,
  changeAutoApproveHours,
} from "./approvalRequest.js";

type AttachKind = "IMAGE" | "VIDEO" | "MARKDOWN" | "JSON" | "DOC" | "XLS" | "CSV" | "PDF" | "OTHER";

interface StepInput {
  step: string;
  expectedResult?: string | null;
}
interface AttachmentInput {
  url: string;
  kind: AttachKind;
  label?: string | null;
}
interface TestCaseInput {
  name: string;
  description?: string | null;
  precondition?: string | null;
  note?: string | null;
  kind?: "POSITIVE" | "NEGATIVE" | null;
  steps: StepInput[];
  attachments: AttachmentInput[];
}
interface ImportRow {
  feature?: string | null;
  name: string;
  description?: string | null;
  precondition?: string | null;
  note?: string | null;
  kind?: string | null;
  steps: StepInput[];
}

// Blank/null -> null; POSITIVE/NEGATIVE (case-insensitive) -> canonical; else "INVALID".
export function normalizeKind(k?: string | null): "POSITIVE" | "NEGATIVE" | null | "INVALID" {
  const v = (k ?? "").trim().toUpperCase();
  if (!v) return null;
  if (v === "POSITIVE" || v === "NEGATIVE") return v;
  return "INVALID";
}

// Pure validation for a bulk import — no DB. `projectScope` requires a feature per
// row; `existingFeatures` are trimmed lower-cased names already in the project, used
// to compute which feature names would be newly created.
export function validateImport(
  rows: ImportRow[],
  opts: { projectScope: boolean; existingFeatures: Set<string> },
) {
  const errors: { row: number; message: string }[] = [];
  const newFeatures = new Map<string, string>(); // lowercase -> first-seen original casing
  let stepCount = 0;
  rows.forEach((r, i) => {
    const rowNo = i + 1;
    if (!(r.name ?? "").trim()) errors.push({ row: rowNo, message: "Name is required" });
    if (normalizeKind(r.kind) === "INVALID")
      errors.push({ row: rowNo, message: `Invalid Kind "${r.kind}" (use POSITIVE, NEGATIVE, or blank)` });
    if (opts.projectScope) {
      const fname = (r.feature ?? "").trim();
      if (!fname) errors.push({ row: rowNo, message: "Feature is required at project scope" });
      else if (!opts.existingFeatures.has(fname.toLowerCase()) && !newFeatures.has(fname.toLowerCase()))
        newFeatures.set(fname.toLowerCase(), fname);
    }
    stepCount += (r.steps ?? []).filter((s) => (s.step ?? "").trim()).length;
  });
  return { ok: errors.length === 0, testCaseCount: rows.length, stepCount, newFeatures: [...newFeatures.values()], errors };
}

function forbidden() {
  return new GraphQLError("You may not review this test case — it needs an approver of the creator's level or higher, and never its own author.", {
    extensions: { code: "FORBIDDEN" },
  });
}

function stepData(steps: StepInput[]) {
  return steps.map((s, i) => ({ order: i + 1, step: s.step, expectedResult: s.expectedResult ?? null }));
}
function attachData(atts: AttachmentInput[]) {
  return atts.map((a, i) => ({ order: i + 1, url: a.url, kind: a.kind, label: a.label ?? null }));
}

// Re-exported under the name the resolvers already use; the definition lives in
// approval.ts so coverage.ts can share it.
export const APPROVED_ONLY = LIVE_TEST_CASE;

// Approval a new/edited case lands in, honouring the admin's auto-approve
// setting: 0 hours means nothing waits for a human. A positive window still
// starts PENDING — the scheduler approves it once it's overdue.
async function resolveApproval(
  ctx: Context,
  role: string,
  scope: "new" | "change",
): Promise<"PENDING" | "APPROVED"> {
  if (approvalOnCreate(role) === "APPROVED") return "APPROVED";
  const s = await ctx.prisma.setting.findUnique({ where: { id: "singleton" } });
  const hours = scope === "new" ? s?.autoApproveNewHours : s?.autoApproveChangeHours;
  return autoApprovesNow(hours) ? "APPROVED" : "PENDING";
}

// One place for "this case is not testable yet".
export async function assertApproved(ctx: Context, testCaseId: string, what: string): Promise<void> {
  const tc = await ctx.prisma.testCase.findUnique({
    where: { id: testCaseId },
    select: { approval: true, active: true, feature: { select: { active: true, project: { select: { active: true } } } } },
  });
  if (!tc) throw new Error("Test case not found");
  // A retired project or feature retires everything under it.
  if (!tc.active || !tc.feature.active || !tc.feature.project.active) throw retired(what);
  if (tc.approval !== "APPROVED") throw notApproved(what);
}

// Same for a batch (assigning several cases at once).
export async function assertAllApproved(ctx: Context, testCaseIds: string[], what = "be assigned"): Promise<void> {
  if (!testCaseIds.length) return;
  const [unreviewed, live] = await Promise.all([
    ctx.prisma.testCase.count({ where: { id: { in: testCaseIds }, approval: { not: "APPROVED" } } }),
    ctx.prisma.testCase.count({ where: { id: { in: testCaseIds }, ...LIVE_TEST_CASE } }),
  ]);
  if (unreviewed > 0) throw notApproved(what);
  if (live < testCaseIds.length) throw retired(what);
}

function notApproved(what: string) {
  return new GraphQLError(`This test case is still waiting for approval, so it can't ${what}.`, {
    extensions: { code: "TEST_CASE_NOT_APPROVED" },
  });
}

function retired(what: string) {
  return new GraphQLError(`This test case is inactive, so it can't ${what}. Ask for it to be activated first.`, {
    extensions: { code: "TEST_CASE_INACTIVE" },
  });
}

export const testCaseResolvers = {
  Query: {
    // Approved + active by default. `includeInactive` is how QA finds a retired
    // case again to ask for it back.
    async testCases(_: unknown, args: { featureId: string; includeInactive?: boolean | null }, ctx: Context) {
      requireAuth(ctx);
      // The feature is being viewed, so its own retirement doesn't hide its
      // cases here — only the case's own state does.
      return ctx.prisma.testCase.findMany({
        where: {
          featureId: args.featureId,
          approval: "APPROVED",
          ...(args.includeInactive ? {} : { active: true }),
        },
        orderBy: { createdAt: "asc" },
      });
    },
    // Awaiting a decision: PENDING needs an approver, REJECTED needs its creator.
    // Oldest first — the longest wait is the most urgent.
    async pendingTestCases(_: unknown, args: { projectId?: string | null }, ctx: Context) {
      requireAuth(ctx);
      return ctx.prisma.testCase.findMany({
        where: {
          approval: { in: ["PENDING", "REJECTED"] },
          ...(args.projectId ? { feature: { projectId: args.projectId } } : {}),
        },
        orderBy: { createdAt: "asc" },
      });
    },
    // Nav badge: PENDING cases *and* open change requests this user may actually
    // approve, so a plain QA sees no number instead of one they can't act on.
    // REJECTED is excluded — that ball is in the author's court.
    // ponytail: counts in JS after two selects; pending sets are small. Move to a
    // grouped count if this ever spans thousands of rows.
    async pendingApprovalCount(_: unknown, __: unknown, ctx: Context) {
      const userId = requireAuth(ctx);
      if (!isApproverRole(ctx.role)) return 0;
      const me = { id: userId, role: ctx.role! };
      const [cases, requests] = await Promise.all([
        ctx.prisma.testCase.findMany({
          where: { approval: "PENDING" },
          select: { createdById: true, createdBy: { select: { role: true } } },
        }),
        ctx.prisma.approvalRequest.findMany({
          where: { state: "PENDING" },
          select: { requestedById: true, requestedBy: { select: { role: true } } },
        }),
      ]);
      return (
        cases.filter((r) => canApproveTestCase(me, { id: r.createdById, role: r.createdBy.role })).length +
        requests.filter((r) => canApproveTestCase(me, { id: r.requestedById, role: r.requestedBy.role })).length
      );
    },
    async testCase(_: unknown, args: { id: string }, ctx: Context) {
      requireAuth(ctx);
      return ctx.prisma.testCase.findUnique({ where: { id: args.id } });
    },
    // Flat export of test cases (name + fields + steps), excludes records/issues/attachments.
    // Exactly one of projectId/featureId. Ordered by feature name then tc creation.
    async exportTestCases(_: unknown, args: { projectId?: string; featureId?: string }, ctx: Context) {
      requireAuth(ctx);
      if (!args.projectId && !args.featureId) throw new Error("projectId or featureId required");
      const where = args.featureId
        ? { featureId: args.featureId, ...APPROVED_ONLY }
        : { ...APPROVED_ONLY, feature: { ...APPROVED_ONLY.feature, projectId: args.projectId } };
      const tcs = await ctx.prisma.testCase.findMany({
        where,
        include: { feature: { select: { name: true } }, steps: { orderBy: { order: "asc" } } },
        orderBy: [{ feature: { name: "asc" } }, { createdAt: "asc" }],
      });
      return tcs.map((tc) => ({
        featureName: tc.feature.name,
        name: tc.name,
        description: tc.description,
        precondition: tc.precondition,
        note: tc.note,
        kind: tc.kind,
        steps: tc.steps.map((s) => ({ step: s.step, expectedResult: s.expectedResult })),
      }));
    },
  },
  Mutation: {
    async createTestCase(_: unknown, args: { featureId: string; input: TestCaseInput }, ctx: Context) {
      const user = await requireQA(ctx);
      // Nothing new goes into retired content — it would be invisible on arrival.
      await assertActive(ctx, "FEATURE", args.featureId);
      const { input } = args;
      const approval = await resolveApproval(ctx, user.role, "new");
      const tc = await ctx.prisma.testCase.create({
        data: {
          featureId: args.featureId,
          name: input.name.trim(),
          description: input.description ?? null,
          precondition: input.precondition ?? null,
          note: input.note ?? null,
          kind: input.kind ?? null,
          createdById: user.id,
          approval,
          // Record when it went live. reviewedById names the person who decided;
          // it stays null when the admin's auto-approve setting did it, so the UI
          // can say "auto-approved" instead of naming an innocent.
          ...(approval === "APPROVED"
            ? {
                reviewedAt: new Date(),
                firstApprovedAt: new Date(),
                reviewedById: user.role === "SUPER_ADMIN" ? user.id : null,
              }
            : {}),
          steps: { create: stepData(input.steps) },
          attachments: { create: attachData(input.attachments) },
        },
      });
      if (approval === "PENDING") {
        await notifyTestCaseApprovers(user, "TEST_CASE_PENDING", `New test case to approve: TC-${tc.number} — ${tc.name}`, tc.id);
      }
      return tc;
    },
    async updateTestCase(_: unknown, args: { id: string; input: TestCaseInput }, ctx: Context) {
      const user = await requireQA(ctx);
      const { input } = args;
      const before = await ctx.prisma.testCase.findUnique({ where: { id: args.id } });
      if (!before) throw new Error("Test case not found");
      // Read-only while retired — the case itself, or anything above it.
      await assertActive(ctx, "TEST_CASE", args.id);
      // An edit sends the case back for review — otherwise the gate is trivially
      // bypassed: get a small case approved, then rewrite it. This holds even
      // when the case already has records or sits in an open app test: changed
      // content nobody reviewed must not keep driving runs. Unless the admin set
      // change approval to immediate, in which case nothing waits.
      const reset = !editKeepsApproval(user.role) && !autoApprovesNow(await changeAutoApproveHours(ctx));
      // Replace steps + attachments wholesale — simplest correct update.
      const tc = await ctx.prisma.testCase.update({
        where: { id: args.id },
        data: {
          name: input.name.trim(),
          description: input.description ?? null,
          precondition: input.precondition ?? null,
          note: input.note ?? null,
          kind: input.kind ?? null,
          ...(reset ? { approval: "PENDING", reviewedAt: null, reviewedById: null, rejectReason: null } : {}),
          steps: { deleteMany: {}, create: stepData(input.steps) },
          attachments: { deleteMany: {}, create: attachData(input.attachments) },
        },
      });
      // Only shout when the edit actually re-opened the review.
      if (reset && before.approval !== "PENDING") {
        const author = await ctx.prisma.user.findUnique({ where: { id: tc.createdById }, select: { id: true, role: true } });
        await notifyTestCaseApprovers(
          author ?? user,
          "TEST_CASE_PENDING",
          `Edited, needs approval again: TC-${tc.number} — ${tc.name}`,
          tc.id,
        );
      }
      return tc;
    },
    async approveTestCase(_: unknown, args: { id: string }, ctx: Context) {
      const user = await requireApprover(ctx);
      const tc = await ctx.prisma.testCase.findUnique({
        where: { id: args.id },
        include: { createdBy: { select: { id: true, role: true } } },
      });
      if (!tc) throw new Error("Test case not found");
      if (tc.approval === "APPROVED") return tc;
      if (!canApproveTestCase(user, tc.createdBy)) throw forbidden();
      const now = new Date();
      const updated = await ctx.prisma.testCase.update({
        where: { id: tc.id },
        data: {
          approval: "APPROVED",
          reviewedAt: now,
          reviewedById: user.id,
          rejectReason: null,
          firstApprovedAt: tc.firstApprovedAt ?? now,
        },
      });
      await notify(tc.createdById, "TEST_CASE_APPROVED", `Test case approved: TC-${tc.number} — ${tc.name}`, null, null, null, null, tc.id);
      return updated;
    },
    // Skips what this actor may not approve rather than failing the batch — the
    // rights depend on each case's creator.
    async approveTestCases(_: unknown, args: { ids: string[] }, ctx: Context) {
      const user = await requireApprover(ctx);
      const rows = await ctx.prisma.testCase.findMany({
        where: { id: { in: args.ids }, approval: { in: ["PENDING", "REJECTED"] } },
        include: { createdBy: { select: { id: true, role: true } } },
      });
      const allowed = rows.filter((tc) => canApproveTestCase(user, tc.createdBy));
      if (allowed.length) {
        const now = new Date();
        await ctx.prisma.testCase.updateMany({
          where: { id: { in: allowed.map((t) => t.id) } },
          data: { approval: "APPROVED", reviewedAt: now, reviewedById: user.id, rejectReason: null },
        });
        // firstApprovedAt is set once and never overwritten, so it can't ride
        // along in the updateMany above.
        await ctx.prisma.testCase.updateMany({
          where: { id: { in: allowed.map((t) => t.id) }, firstApprovedAt: null },
          data: { firstApprovedAt: now },
        });
      }
      // One notification per creator, not per case — a 50-case approval must not
      // fire 50 bells at the same person.
      const byCreator = new Map<string, typeof allowed>();
      for (const tc of allowed) byCreator.set(tc.createdById, [...(byCreator.get(tc.createdById) ?? []), tc]);
      await Promise.all(
        [...byCreator].map(([creatorId, cases]) =>
          notify(
            creatorId,
            "TEST_CASE_APPROVED",
            cases.length === 1
              ? `Test case approved: TC-${cases[0].number} — ${cases[0].name}`
              : `${cases.length} test cases approved (${cases.map((c) => `TC-${c.number}`).join(", ")})`,
            null,
            null,
            null,
            null,
            cases.length === 1 ? cases[0].id : null,
          ),
        ),
      );
      return { approved: allowed.length, skipped: args.ids.length - allowed.length };
    },
    async rejectTestCase(_: unknown, args: { id: string; reason: string }, ctx: Context) {
      const user = await requireApprover(ctx);
      const reason = args.reason.trim();
      if (!reason) {
        throw new GraphQLError("Say why the test case is rejected.", { extensions: { code: "BAD_USER_INPUT" } });
      }
      const tc = await ctx.prisma.testCase.findUnique({
        where: { id: args.id },
        include: { createdBy: { select: { id: true, role: true } } },
      });
      if (!tc) throw new Error("Test case not found");
      if (!canApproveTestCase(user, tc.createdBy)) throw forbidden();
      const updated = await ctx.prisma.testCase.update({
        where: { id: tc.id },
        data: { approval: "REJECTED", reviewedAt: new Date(), reviewedById: user.id, rejectReason: reason },
      });
      await notify(
        tc.createdById,
        "TEST_CASE_REJECTED",
        `Test case rejected: TC-${tc.number} — ${reason}`,
        null,
        null,
        null,
        null,
        tc.id,
      );
      return updated;
    },
    // Deleting an approved case takes a decision — it (and its history) stays
    // until then. A case still in review is the author's to withdraw, so that
    // deletes right away. Returns true either way: the request was accepted.
    async deleteTestCase(_: unknown, args: { id: string }, ctx: Context) {
      const user = await requireQA(ctx);
      if (await deleteNeedsApproval(ctx, user.role, args.id)) {
        await openRequest(ctx, user, "TEST_CASE", args.id, "DELETE");
        return true;
      }
      await ctx.prisma.testCase.delete({ where: { id: args.id } });
      return true;
    },
    // Move a test case to another feature (may be in a different project).
    // Records + issues follow via their testCaseId FK; coverage recomputes.
    // Needs approval first: the case stays where it is until then.
    async moveTestCase(_: unknown, args: { id: string; featureId: string }, ctx: Context) {
      const user = await requireQA(ctx);
      const target = await ctx.prisma.feature.findUnique({ where: { id: args.featureId } });
      if (!target) throw new Error("Target feature not found");
      // Both ends have to be live: moving into retired content hides the case.
      await assertActive(ctx, "TEST_CASE", args.id);
      await assertActive(ctx, "FEATURE", target.id);
      await assertReviewedForChange(ctx, args.id, "moved");
      if (await needsApproval(ctx, user.role)) {
        await openRequest(ctx, user, "TEST_CASE", args.id, "MOVE", { featureId: target.id });
        return ctx.prisma.testCase.findUnique({ where: { id: args.id } });
      }
      return ctx.prisma.testCase.update({ where: { id: args.id }, data: { featureId: args.featureId } });
    },
    async cloneTestCase(_: unknown, args: { id: string; targetFeatureId: string; name?: string }, ctx: Context) {
      const user = await requireQA(ctx);
      const target = await ctx.prisma.feature.findUnique({ where: { id: args.targetFeatureId } });
      if (!target) throw new Error("Target feature not found");
      await assertActive(ctx, "TEST_CASE", args.id);
      await assertActive(ctx, "FEATURE", target.id);
      await assertReviewedForChange(ctx, args.id, "copied");
      const name = args.name?.trim() || undefined;
      if (await needsApproval(ctx, user.role)) {
        await openRequest(ctx, user, "TEST_CASE", args.id, "COPY", { featureId: target.id, name });
        // No copy exists yet — hand back the source so the client has something
        // to refetch.
        return ctx.prisma.testCase.findUnique({ where: { id: args.id } });
      }
      return cloneTestCaseInto(args.id, args.targetFeatureId, user.id, name);
    },
    // Retire or revive a case. Inactive keeps its history but leaves the
    // catalogue, so this needs approval like any other change.
    async setTestCaseActive(_: unknown, args: { id: string; active: boolean }, ctx: Context) {
      const user = await requireQA(ctx);
      const tc = await ctx.prisma.testCase.findUnique({ where: { id: args.id } });
      if (!tc) throw new Error("Test case not found");
      if (tc.active === args.active) return tc;
      await assertReviewedForChange(ctx, args.id, args.active ? "activated" : "retired");
      if (await needsApproval(ctx, user.role)) {
        await openRequest(ctx, user, "TEST_CASE", tc.id, args.active ? "ACTIVATE" : "DEACTIVATE");
        return ctx.prisma.testCase.findUnique({ where: { id: tc.id } });
      }
      return ctx.prisma.testCase.update({ where: { id: tc.id }, data: { active: args.active } });
    },
    // Bulk import from a parsed CSV. Each row = one test case (steps already grouped
    // client-side). All-or-nothing: any invalid row aborts with per-row errors and no
    // writes. dryRun validates + reports without writing. Project scope auto-creates
    // missing features; feature scope ignores the `feature` column.
    async importTestCases(
      _: unknown,
      args: { projectId?: string; featureId?: string; dryRun: boolean; rows: ImportRow[] },
      ctx: Context,
    ) {
      const user = await requireQA(ctx);
      const { projectId, featureId, dryRun, rows } = args;
      if (!projectId && !featureId) throw new Error("projectId or featureId required");
      if (projectId && featureId) throw new Error("pass only one of projectId/featureId");

      // Verify the scope target exists and is live — importing into retired
      // content would file every row somewhere nobody can see.
      if (featureId) await assertActive(ctx, "FEATURE", featureId);
      else await assertActive(ctx, "PROJECT", projectId!);

      // Existing features (project scope) for auto-create detection — match by trimmed name.
      const existing = projectId
        ? await ctx.prisma.feature.findMany({ where: { projectId }, select: { id: true, name: true } })
        : [];
      const existingNames = new Set(existing.map((f) => f.name.trim().toLowerCase()));

      const result = validateImport(rows, { projectScope: !!projectId, existingFeatures: existingNames });
      if (!result.ok || dryRun) return result;

      const approval = await resolveApproval(ctx, user.role, "new");
      // Commit — one transaction so a mid-way failure rolls back everything.
      await ctx.prisma.$transaction(async (tx) => {
        // Create missing features first, then resolve every row's feature id.
        const idByName = new Map(existing.map((f) => [f.name.trim().toLowerCase(), f.id]));
        if (projectId) {
          for (const fname of result.newFeatures) {
            const f = await tx.feature.create({ data: { projectId, name: fname, minPassPercent: 0 } });
            idByName.set(fname.toLowerCase(), f.id);
          }
        }
        for (const r of rows) {
          const fid = featureId ?? idByName.get((r.feature ?? "").trim().toLowerCase())!;
          await tx.testCase.create({
            data: {
              featureId: fid,
              name: r.name.trim(),
              description: r.description ?? null,
              precondition: r.precondition ?? null,
              note: r.note ?? null,
              kind: normalizeKind(r.kind) as "POSITIVE" | "NEGATIVE" | null,
              createdById: user.id,
              approval,
              ...(approval === "APPROVED"
                ? {
                    reviewedAt: new Date(),
                    firstApprovedAt: new Date(),
                    reviewedById: user.role === "SUPER_ADMIN" ? user.id : null,
                  }
                : {}),
              steps: { create: stepData((r.steps ?? []).filter((s) => (s.step ?? "").trim())) },
            },
          });
        }
      });
      // One notification for the whole import — a 200-row file must not ring 200
      // bells per approver.
      if (approval === "PENDING" && rows.length) {
        await notifyTestCaseApprovers(
          user,
          "TEST_CASE_PENDING",
          `${rows.length} imported test case${rows.length > 1 ? "s" : ""} to approve`,
          null,
        );
      }
      return result;
    },
  },
  TestCase: {
    key: (t: any) => `TC-${t.number}`,
    createdAt: (t: any) => t.createdAt.toISOString(),
    updatedAt: (t: any) => t.updatedAt.toISOString(),
    createdBy: (t: any, _: unknown, ctx: Context) => ctx.prisma.user.findUnique({ where: { id: t.createdById } }),
    reviewedAt: (t: any) => t.reviewedAt?.toISOString() ?? null,
    firstApprovedAt: (t: any) => t.firstApprovedAt?.toISOString() ?? null,
    reviewedBy: (t: any, _: unknown, ctx: Context) =>
      t.reviewedById ? ctx.prisma.user.findUnique({ where: { id: t.reviewedById } }) : null,
    feature: (t: any, _: unknown, ctx: Context) => ctx.prisma.feature.findUnique({ where: { id: t.featureId } }),
    pendingRequest: (t: any, _: unknown, ctx: Context) =>
      ctx.prisma.approvalRequest.findFirst({ where: { target: "TEST_CASE", targetId: t.id, state: "PENDING" } }),
    async canApprove(t: any, _: unknown, ctx: Context) {
      if (!ctx.userId || !isApproverRole(ctx.role) || t.approval === "APPROVED") return false;
      const creator = await ctx.prisma.user.findUnique({ where: { id: t.createdById }, select: { id: true, role: true } });
      return !!creator && canApproveTestCase({ id: ctx.userId, role: ctx.role! }, creator);
    },
    steps: (t: any, _: unknown, ctx: Context) =>
      ctx.prisma.testCaseStep.findMany({ where: { testCaseId: t.id }, orderBy: { order: "asc" } }),
    attachments: (t: any, _: unknown, ctx: Context) =>
      ctx.prisma.testCaseAttachment.findMany({ where: { testCaseId: t.id }, orderBy: { order: "asc" } }),
    recordCount: (t: any, _: unknown, ctx: Context) =>
      ctx.prisma.recordTest.count({ where: { testCaseId: t.id } }),
    issueCount: (t: any, _: unknown, ctx: Context) =>
      ctx.prisma.issue.count({ where: { testCaseId: t.id } }),
    async latestResult(t: any, _: unknown, ctx: Context) {
      const r = await ctx.prisma.recordTest.findFirst({
        where: { testCaseId: t.id },
        orderBy: { executedAt: "desc" },
        select: { result: true },
      });
      return r?.result ?? null;
    },
  },
};
