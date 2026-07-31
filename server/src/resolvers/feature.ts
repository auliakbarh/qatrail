import type { Context } from "../context.js";
import { requireAuth, requireQA } from "../context.js";
import { featureCoverage } from "../coverage.js";
import { cloneFeatureInto } from "../clone.js";
import { APPROVED_ONLY } from "./testcase.js";
import { needsApproval, openRequest, assertActive, dropRequestsUnder } from "./approvalRequest.js";

interface FeatureInput {
  name: string;
  description?: string | null;
  minPassPercent: number;
}

function clampPercent(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export const featureResolvers = {
  Query: {
    async features(_: unknown, args: { projectId: string; includeInactive?: boolean | null }, ctx: Context) {
      requireAuth(ctx);
      return ctx.prisma.feature.findMany({
        where: { projectId: args.projectId, ...(args.includeInactive ? {} : { active: true }) },
        orderBy: { name: "asc" },
      });
    },
    async feature(_: unknown, args: { id: string }, ctx: Context) {
      requireAuth(ctx);
      return ctx.prisma.feature.findUnique({ where: { id: args.id } });
    },
  },
  Mutation: {
    async createFeature(_: unknown, args: { projectId: string; input: FeatureInput }, ctx: Context) {
      await requireQA(ctx);
      await assertActive(ctx, "PROJECT", args.projectId);
      return ctx.prisma.feature.create({
        data: {
          projectId: args.projectId,
          name: args.input.name.trim(),
          description: args.input.description ?? null,
          minPassPercent: clampPercent(args.input.minPassPercent),
        },
      });
    },
    async updateFeature(_: unknown, args: { id: string; input: FeatureInput }, ctx: Context) {
      await requireQA(ctx);
      // Retired content is read-only until it is activated again.
      await assertActive(ctx, "FEATURE", args.id);
      return ctx.prisma.feature.update({
        where: { id: args.id },
        data: {
          name: args.input.name.trim(),
          description: args.input.description ?? null,
          minPassPercent: clampPercent(args.input.minPassPercent),
        },
      });
    },
    // Same as a project: deleting takes the test cases and their history with it,
    // so it waits for approval. The feature keeps working until then.
    async deleteFeature(_: unknown, args: { id: string }, ctx: Context) {
      const user = await requireQA(ctx);
      if (await needsApproval(ctx, user.role)) {
        await openRequest(ctx, user, "FEATURE", args.id, "DELETE");
        return true;
      }
      await dropRequestsUnder(ctx, "FEATURE", args.id);
      await ctx.prisma.feature.delete({ where: { id: args.id } });
      return true;
    },
    async setFeatureActive(_: unknown, args: { id: string; active: boolean }, ctx: Context) {
      const user = await requireQA(ctx);
      const f = await ctx.prisma.feature.findUnique({ where: { id: args.id } });
      if (!f) throw new Error("Feature not found");
      if (f.active === args.active) return f;
      if (await needsApproval(ctx, user.role)) {
        await openRequest(ctx, user, "FEATURE", f.id, args.active ? "ACTIVATE" : "DEACTIVATE");
        return ctx.prisma.feature.findUnique({ where: { id: f.id } });
      }
      return ctx.prisma.feature.update({ where: { id: f.id }, data: { active: args.active } });
    },
    // Copying a feature duplicates every test case under it, so it waits for
    // approval like any other change; nothing exists until the decision lands.
    async cloneFeature(_: unknown, args: { id: string; targetProjectId: string; name?: string }, ctx: Context) {
      const user = await requireQA(ctx);
      await assertActive(ctx, "FEATURE", args.id);
      const target = await ctx.prisma.project.findUnique({ where: { id: args.targetProjectId } });
      if (!target) throw new Error("Target project not found");
      await assertActive(ctx, "PROJECT", target.id);
      const name = args.name?.trim() || undefined;
      if (await needsApproval(ctx, user.role)) {
        await openRequest(ctx, user, "FEATURE", args.id, "COPY", { projectId: target.id, name });
        // Nothing copied yet — hand back the source so the client has something
        // to refetch.
        return ctx.prisma.feature.findUnique({ where: { id: args.id } });
      }
      return cloneFeatureInto(args.id, args.targetProjectId, user.id, name);
    },
    // Move a feature (with its test cases) to another project — also a change
    // that waits for approval, since it moves every case with it.
    async moveFeature(_: unknown, args: { id: string; projectId: string }, ctx: Context) {
      const user = await requireQA(ctx);
      await assertActive(ctx, "FEATURE", args.id);
      const target = await ctx.prisma.project.findUnique({ where: { id: args.projectId } });
      if (!target) throw new Error("Target project not found");
      await assertActive(ctx, "PROJECT", target.id);
      if (await needsApproval(ctx, user.role)) {
        await openRequest(ctx, user, "FEATURE", args.id, "MOVE", { projectId: target.id });
        return ctx.prisma.feature.findUnique({ where: { id: args.id } });
      }
      return ctx.prisma.feature.update({ where: { id: args.id }, data: { projectId: args.projectId } });
    },
  },
  Feature: {
    key: (f: any) => `FEAT-${f.number}`,
    createdAt: (f: any) => f.createdAt.toISOString(),
    updatedAt: (f: any) => f.updatedAt.toISOString(),
    project: (f: any, _: unknown, ctx: Context) => ctx.prisma.project.findUnique({ where: { id: f.projectId } }),
    pendingRequest: (f: any, _: unknown, ctx: Context) =>
      ctx.prisma.approvalRequest.findFirst({ where: { target: "FEATURE", targetId: f.id, state: "PENDING" } }),
    // Cases awaiting review, or retired, aren't part of the agreed catalogue, so
    // they don't inflate the count or the coverage denominator.
    testCaseCount: (f: any, _: unknown, ctx: Context) =>
      ctx.prisma.testCase.count({ where: { featureId: f.id, ...APPROVED_ONLY } }),
    coverage: (f: any) => featureCoverage(f.id),
    async ready(f: any) {
      const cov = await featureCoverage(f.id);
      return cov.percent >= f.minPassPercent;
    },
  },
};
