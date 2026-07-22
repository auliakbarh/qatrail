import type { Context } from "../context.js";
import { requireAuth, requireQA } from "../context.js";
import { featureCoverage } from "../coverage.js";
import { cloneFeatureInto } from "../clone.js";

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
    async features(_: unknown, args: { projectId: string }, ctx: Context) {
      requireAuth(ctx);
      return ctx.prisma.feature.findMany({
        where: { projectId: args.projectId },
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
      return ctx.prisma.feature.update({
        where: { id: args.id },
        data: {
          name: args.input.name.trim(),
          description: args.input.description ?? null,
          minPassPercent: clampPercent(args.input.minPassPercent),
        },
      });
    },
    async deleteFeature(_: unknown, args: { id: string }, ctx: Context) {
      await requireQA(ctx);
      await ctx.prisma.feature.delete({ where: { id: args.id } });
      return true;
    },
    async cloneFeature(_: unknown, args: { id: string; targetProjectId: string; name?: string }, ctx: Context) {
      const user = await requireQA(ctx);
      return cloneFeatureInto(args.id, args.targetProjectId, user.id, args.name?.trim() || undefined);
    },
    // Move a feature (with its test cases) to another project.
    async moveFeature(_: unknown, args: { id: string; projectId: string }, ctx: Context) {
      await requireQA(ctx);
      const target = await ctx.prisma.project.findUnique({ where: { id: args.projectId } });
      if (!target) throw new Error("Target project not found");
      return ctx.prisma.feature.update({ where: { id: args.id }, data: { projectId: args.projectId } });
    },
  },
  Feature: {
    key: (f: any) => `FEAT-${f.number}`,
    createdAt: (f: any) => f.createdAt.toISOString(),
    updatedAt: (f: any) => f.updatedAt.toISOString(),
    testCaseCount: (f: any, _: unknown, ctx: Context) =>
      ctx.prisma.testCase.count({ where: { featureId: f.id } }),
    coverage: (f: any) => featureCoverage(f.id),
    async ready(f: any) {
      const cov = await featureCoverage(f.id);
      return cov.percent >= f.minPassPercent;
    },
  },
};
