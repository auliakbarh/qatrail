import type { Context } from "../context.js";
import { requireAuth, requireQA } from "../context.js";
import { recomputeAppTest } from "../appTestStatus.js";

type AttachKind = "IMAGE" | "VIDEO" | "MARKDOWN" | "JSON" | "DOC" | "XLS" | "CSV" | "PDF" | "OTHER";

interface RecordTestInput {
  executedAt: string;
  note?: string | null;
  result: "PASS" | "FAIL";
  retestIssueId?: string | null;
  appTestId?: string | null;
  attachments: { url: string; kind: AttachKind; label?: string | null }[];
}

export const recordResolvers = {
  Query: {
    async recordTests(_: unknown, args: { testCaseId: string }, ctx: Context) {
      requireAuth(ctx);
      return ctx.prisma.recordTest.findMany({
        where: { testCaseId: args.testCaseId },
        orderBy: { executedAt: "desc" },
      });
    },
  },
  Mutation: {
    async createRecordTest(_: unknown, args: { testCaseId: string; input: RecordTestInput }, ctx: Context) {
      const user = await requireQA(ctx);
      const { input } = args;
      const rec = await ctx.prisma.recordTest.create({
        data: {
          testCaseId: args.testCaseId,
          executedById: user.id,
          executedAt: new Date(input.executedAt),
          note: input.note ?? null,
          result: input.result,
          retestIssueId: input.retestIssueId ?? null,
          appTestId: input.appTestId ?? null,
          attachments: {
            create: input.attachments.map((a) => ({
              url: a.url,
              kind: a.kind,
              label: a.label ?? null,
            })),
          },
        },
      });
      if (rec.appTestId) await recomputeAppTest(rec.appTestId);
      return rec;
    },
    async deleteRecordTest(_: unknown, args: { id: string }, ctx: Context) {
      await requireQA(ctx);
      const rec = await ctx.prisma.recordTest.delete({ where: { id: args.id } });
      if (rec.appTestId) await recomputeAppTest(rec.appTestId);
      return true;
    },
  },
  RecordTest: {
    key: (r: any) => `REC-${r.number}`,
    executedAt: (r: any) => r.executedAt.toISOString(),
    createdAt: (r: any) => r.createdAt.toISOString(),
    executedBy: (r: any, _: unknown, ctx: Context) =>
      ctx.prisma.user.findUnique({ where: { id: r.executedById } }),
    // Record attachments aren't numbered in the DB; synthesize `order` by index
    // to satisfy the shared Attachment type.
    async attachments(r: any, _: unknown, ctx: Context) {
      const rows = await ctx.prisma.recordTestAttachment.findMany({
        where: { recordTestId: r.id },
        orderBy: { id: "asc" },
      });
      return rows.map((a, i) => ({ ...a, order: i + 1 }));
    },
    async issueId(r: any, _: unknown, ctx: Context) {
      const issue = await ctx.prisma.issue.findUnique({
        where: { recordTestId: r.id },
        select: { id: true },
      });
      return issue?.id ?? null;
    },
  },
};
