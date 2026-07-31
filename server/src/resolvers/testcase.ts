import { GraphQLError } from "graphql";
import type { Context } from "../context.js";
import { requireAuth, requireQA, requireApprover } from "../context.js";
import { cloneTestCaseInto } from "../clone.js";
import { approvalOnCreate, canApproveTestCase, editKeepsApproval, isApproverRole } from "../approval.js";
import { notify, notifyTestCaseApprovers } from "../notify.js";

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

// The reviewed catalogue: anything not APPROVED is content nobody agreed to yet.
export const APPROVED_ONLY = { approval: "APPROVED" } as const;

// One place for "this case is not testable yet".
export async function assertApproved(ctx: Context, testCaseId: string, what: string): Promise<void> {
  const tc = await ctx.prisma.testCase.findUnique({ where: { id: testCaseId }, select: { approval: true } });
  if (!tc) throw new Error("Test case not found");
  if (tc.approval !== "APPROVED") throw notApproved(what);
}

// Same for a batch (assigning several cases at once).
export async function assertAllApproved(ctx: Context, testCaseIds: string[], what = "be assigned"): Promise<void> {
  if (!testCaseIds.length) return;
  const bad = await ctx.prisma.testCase.count({
    where: { id: { in: testCaseIds }, approval: { not: "APPROVED" } },
  });
  if (bad > 0) throw notApproved(what);
}

function notApproved(what: string) {
  return new GraphQLError(`This test case is still waiting for approval, so it can't ${what}.`, {
    extensions: { code: "TEST_CASE_NOT_APPROVED" },
  });
}

export const testCaseResolvers = {
  Query: {
    async testCases(_: unknown, args: { featureId: string }, ctx: Context) {
      requireAuth(ctx);
      return ctx.prisma.testCase.findMany({
        where: { featureId: args.featureId, ...APPROVED_ONLY },
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
    // Nav badge: PENDING cases this user may actually approve, so a plain QA
    // sees no number instead of one they can't act on. REJECTED is excluded —
    // that ball is in the creator's court.
    // ponytail: counts in JS after one select; pending sets are small. Move to a
    // grouped count if this ever spans thousands of rows.
    async pendingApprovalCount(_: unknown, __: unknown, ctx: Context) {
      const userId = requireAuth(ctx);
      if (!isApproverRole(ctx.role)) return 0;
      const rows = await ctx.prisma.testCase.findMany({
        where: { approval: "PENDING" },
        select: { createdById: true, createdBy: { select: { role: true } } },
      });
      const me = { id: userId, role: ctx.role! };
      return rows.filter((r) => canApproveTestCase(me, { id: r.createdById, role: r.createdBy.role })).length;
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
        : { feature: { projectId: args.projectId }, ...APPROVED_ONLY };
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
      const { input } = args;
      const approval = approvalOnCreate(user.role);
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
          // A super admin's own case needs no review, so record the decision now.
          ...(approval === "APPROVED" ? { reviewedAt: new Date(), reviewedById: user.id } : {}),
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
      // An edit sends the case back for review — otherwise the gate is trivially
      // bypassed: get a small case approved, then rewrite it. This holds even
      // when the case already has records or sits in an open app test: changed
      // content nobody reviewed must not keep driving runs.
      const reset = !editKeepsApproval(user.role);
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
      const updated = await ctx.prisma.testCase.update({
        where: { id: tc.id },
        data: { approval: "APPROVED", reviewedAt: new Date(), reviewedById: user.id, rejectReason: null },
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
        await ctx.prisma.testCase.updateMany({
          where: { id: { in: allowed.map((t) => t.id) } },
          data: { approval: "APPROVED", reviewedAt: new Date(), reviewedById: user.id, rejectReason: null },
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
    async deleteTestCase(_: unknown, args: { id: string }, ctx: Context) {
      await requireQA(ctx);
      await ctx.prisma.testCase.delete({ where: { id: args.id } });
      return true;
    },
    // Move a test case to another feature (may be in a different project).
    // Records + issues follow via their testCaseId FK; coverage recomputes.
    async moveTestCase(_: unknown, args: { id: string; featureId: string }, ctx: Context) {
      await requireQA(ctx);
      const target = await ctx.prisma.feature.findUnique({ where: { id: args.featureId } });
      if (!target) throw new Error("Target feature not found");
      return ctx.prisma.testCase.update({ where: { id: args.id }, data: { featureId: args.featureId } });
    },
    async cloneTestCase(_: unknown, args: { id: string; targetFeatureId: string; name?: string }, ctx: Context) {
      const user = await requireQA(ctx);
      const target = await ctx.prisma.feature.findUnique({ where: { id: args.targetFeatureId } });
      if (!target) throw new Error("Target feature not found");
      return cloneTestCaseInto(args.id, args.targetFeatureId, user.id, args.name?.trim() || undefined);
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

      // Verify scope target exists.
      if (featureId) {
        const f = await ctx.prisma.feature.findUnique({ where: { id: featureId } });
        if (!f) throw new Error("Feature not found");
      } else {
        const p = await ctx.prisma.project.findUnique({ where: { id: projectId } });
        if (!p) throw new Error("Project not found");
      }

      // Existing features (project scope) for auto-create detection — match by trimmed name.
      const existing = projectId
        ? await ctx.prisma.feature.findMany({ where: { projectId }, select: { id: true, name: true } })
        : [];
      const existingNames = new Set(existing.map((f) => f.name.trim().toLowerCase()));

      const result = validateImport(rows, { projectScope: !!projectId, existingFeatures: existingNames });
      if (!result.ok || dryRun) return result;

      const approval = approvalOnCreate(user.role);
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
              ...(approval === "APPROVED" ? { reviewedAt: new Date(), reviewedById: user.id } : {}),
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
    reviewedBy: (t: any, _: unknown, ctx: Context) =>
      t.reviewedById ? ctx.prisma.user.findUnique({ where: { id: t.reviewedById } }) : null,
    feature: (t: any, _: unknown, ctx: Context) => ctx.prisma.feature.findUnique({ where: { id: t.featureId } }),
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
