import type { Context } from "../context.js";
import { requireAuth, requireQA } from "../context.js";

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
  steps: StepInput[];
  attachments: AttachmentInput[];
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
