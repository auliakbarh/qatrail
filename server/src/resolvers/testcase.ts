import type { Context } from "../context.js";
import { requireAuth, requireQA } from "../context.js";
import { cloneTestCaseInto } from "../clone.js";

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

function stepData(steps: StepInput[]) {
  return steps.map((s, i) => ({ order: i + 1, step: s.step, expectedResult: s.expectedResult ?? null }));
}
function attachData(atts: AttachmentInput[]) {
  return atts.map((a, i) => ({ order: i + 1, url: a.url, kind: a.kind, label: a.label ?? null }));
}

export const testCaseResolvers = {
  Query: {
    async testCases(_: unknown, args: { featureId: string }, ctx: Context) {
      requireAuth(ctx);
      return ctx.prisma.testCase.findMany({
        where: { featureId: args.featureId },
        orderBy: { createdAt: "asc" },
      });
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
      const where = args.featureId ? { featureId: args.featureId } : { feature: { projectId: args.projectId } };
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
      return ctx.prisma.testCase.create({
        data: {
          featureId: args.featureId,
          name: input.name.trim(),
          description: input.description ?? null,
          precondition: input.precondition ?? null,
          note: input.note ?? null,
          kind: input.kind ?? null,
          createdById: user.id,
          steps: { create: stepData(input.steps) },
          attachments: { create: attachData(input.attachments) },
        },
      });
    },
    async updateTestCase(_: unknown, args: { id: string; input: TestCaseInput }, ctx: Context) {
      await requireQA(ctx);
      const { input } = args;
      // Replace steps + attachments wholesale — simplest correct update.
      return ctx.prisma.testCase.update({
        where: { id: args.id },
        data: {
          name: input.name.trim(),
          description: input.description ?? null,
          precondition: input.precondition ?? null,
          note: input.note ?? null,
          kind: input.kind ?? null,
          steps: { deleteMany: {}, create: stepData(input.steps) },
          attachments: { deleteMany: {}, create: attachData(input.attachments) },
        },
      });
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
              steps: { create: stepData((r.steps ?? []).filter((s) => (s.step ?? "").trim())) },
            },
          });
        }
      });
      return result;
    },
  },
  TestCase: {
    key: (t: any) => `TC-${t.number}`,
    createdAt: (t: any) => t.createdAt.toISOString(),
    updatedAt: (t: any) => t.updatedAt.toISOString(),
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
