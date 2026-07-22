import type { Context } from "../context.js";
import { requireAuth, requireQA } from "../context.js";
import { projectCoverage } from "../coverage.js";
import { cloneProjectDeep } from "../clone.js";

interface ProjectInput {
  name: string;
  description?: string | null;
  squad?: string | null;
  minPassPercent: number;
}

function clampPercent(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export const projectResolvers = {
  Query: {
    async projects(_: unknown, __: unknown, ctx: Context) {
      requireAuth(ctx);
      return ctx.prisma.project.findMany({ orderBy: { name: "asc" } });
    },
    async project(_: unknown, args: { id: string }, ctx: Context) {
      requireAuth(ctx);
      return ctx.prisma.project.findUnique({ where: { id: args.id } });
    },
  },
  Mutation: {
    async createProject(_: unknown, args: { input: ProjectInput }, ctx: Context) {
      const user = await requireQA(ctx);
      return ctx.prisma.project.create({
        data: {
          name: args.input.name.trim(),
          description: args.input.description ?? null,
          squad: args.input.squad ?? null,
          minPassPercent: clampPercent(args.input.minPassPercent),
          createdById: user.id,
        },
      });
    },
    async updateProject(_: unknown, args: { id: string; input: ProjectInput }, ctx: Context) {
      await requireQA(ctx);
      return ctx.prisma.project.update({
        where: { id: args.id },
        data: {
          name: args.input.name.trim(),
          description: args.input.description ?? null,
          squad: args.input.squad ?? null,
          minPassPercent: clampPercent(args.input.minPassPercent),
        },
      });
    },
    async deleteProject(_: unknown, args: { id: string }, ctx: Context) {
      await requireQA(ctx);
      await ctx.prisma.project.delete({ where: { id: args.id } });
      return true;
    },
    async cloneProject(_: unknown, args: { id: string; name?: string }, ctx: Context) {
      const user = await requireQA(ctx);
      return cloneProjectDeep(args.id, user.id, args.name?.trim() || undefined);
    },
  },
  Project: {
    createdAt: (p: any) => p.createdAt.toISOString(),
    updatedAt: (p: any) => p.updatedAt.toISOString(),
    featureCount: (p: any, _: unknown, ctx: Context) =>
      ctx.prisma.feature.count({ where: { projectId: p.id } }),
    coverage: (p: any) => projectCoverage(p.id),
    async ready(p: any) {
      const cov = await projectCoverage(p.id);
      return cov.percent >= p.minPassPercent;
    },
  },
};
