import { GraphQLError } from "graphql";
import type { Context } from "../context.js";
import { requireAuth, requireQA } from "../context.js";
import { recomputeAppTest } from "../appTestStatus.js";
import { assertApproved, assertAllApproved } from "./testcase.js";

type AttachKind = "IMAGE" | "VIDEO" | "MARKDOWN" | "JSON" | "DOC" | "XLS" | "CSV" | "PDF" | "OTHER";

interface RecordTestInput {
  executedAt: string;
  note?: string | null;
  result: "PASS" | "FAIL" | "BLOCKED";
  retestIssueId?: string | null;
  appTestId?: string | null;
  sessionTestId?: string | null;
  attachments: { url: string; kind: AttachKind; label?: string | null }[];
}

// A blocked run has no verdict, so the blocker itself is the only useful
// information — refuse to store one silently. Pure so both paths share it.
export function assertBlockerNoted(result: string, note?: string | null): void {
  if (result === "BLOCKED" && !note?.trim()) {
    throw new GraphQLError("Say what blocked the test in the note.", { extensions: { code: "BAD_USER_INPUT" } });
  }
}

// Create-data for one run. Shared by every write path so the columns a run is
// made of can't drift between them.
export function recordData(
  r: {
    testCaseId: string;
    executedById: string;
    executedAt: Date;
    result: string;
    note?: string | null;
    retestIssueId?: string | null;
    appTestId?: string | null;
    sessionTestId?: string | null;
    attachments: { url: string; kind: AttachKind; label?: string | null }[];
  },
) {
  // One run, one context. A record in both would count toward an app test's
  // coverage and a session's at the same time.
  if (r.appTestId && r.sessionTestId) {
    throw new GraphQLError("A run belongs to one app test or one session, not both.", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }
  return {
    testCaseId: r.testCaseId,
    executedById: r.executedById,
    executedAt: r.executedAt,
    note: r.note ?? null,
    result: r.result as any,
    retestIssueId: r.retestIssueId ?? null,
    appTestId: r.appTestId ?? null,
    // Session runs stay in their own scope — no recomputeAppTest for them.
    sessionTestId: r.sessionTestId ?? null,
    attachments: {
      create: r.attachments.map((a) => ({ url: a.url, kind: a.kind, label: a.label ?? null })),
    },
  };
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
      // Every run — first attempt or retest — lands here, so this one check
      // closes the whole path.
      await assertApproved(ctx, args.testCaseId, "be tested yet");
      assertBlockerNoted(input.result, input.note);
      const rec = await ctx.prisma.recordTest.create({
        data: recordData({ ...input, testCaseId: args.testCaseId, executedById: user.id, executedAt: new Date(input.executedAt) }),
      });
      if (rec.appTestId) await recomputeAppTest(rec.appTestId);
      return rec;
    },
    // Several runs of one app test / session at once. Everything is validated
    // before anything is written, and the writes share one transaction, so a bad
    // row can never leave half a batch behind.
    async createRecordTests(
      _: unknown,
      args: {
        executedAt: string;
        appTestId?: string | null;
        sessionTestId?: string | null;
        inputs: { testCaseId: string; result: "PASS" | "FAIL" | "BLOCKED"; note?: string | null; attachments: { url: string; kind: AttachKind; label?: string | null }[] }[];
      },
      ctx: Context,
    ) {
      const user = await requireQA(ctx);
      const { inputs } = args;
      if (inputs.length === 0) {
        throw new GraphQLError("Pick at least one test case to run.", { extensions: { code: "BAD_USER_INPUT" } });
      }
      // The same approval/retirement gate as a single run, asked once for the batch.
      await assertAllApproved(ctx, [...new Set(inputs.map((i) => i.testCaseId))], "be tested yet");
      inputs.forEach((i) => assertBlockerNoted(i.result, i.note));
      const executedAt = new Date(args.executedAt);
      const records = await ctx.prisma.$transaction(
        inputs.map((i) =>
          ctx.prisma.recordTest.create({
            data: recordData({
              ...i,
              testCaseId: i.testCaseId,
              executedById: user.id,
              executedAt,
              appTestId: args.appTestId,
              sessionTestId: args.sessionTestId,
            }),
          }),
        ),
      );
      // Once for the batch, not once per row.
      if (args.appTestId) await recomputeAppTest(args.appTestId);
      return records;
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
    async appTestKey(r: any, _: unknown, ctx: Context) {
      if (!r.appTestId) return null;
      const at = await ctx.prisma.appTest.findUnique({ where: { id: r.appTestId }, select: { number: true } });
      return at ? `APP-${at.number}` : null;
    },
    async sessionTestKey(r: any, _: unknown, ctx: Context) {
      if (!r.sessionTestId) return null;
      const st = await ctx.prisma.sessionTest.findUnique({ where: { id: r.sessionTestId }, select: { number: true } });
      return st ? `ST-${st.number}` : null;
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
