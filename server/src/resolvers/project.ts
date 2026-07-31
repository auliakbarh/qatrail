import type { Context } from "../context.js";
import { requireAuth, requireQA } from "../context.js";
import { projectCoverage } from "../coverage.js";
import { cloneProjectDeep } from "../clone.js";
import { needsApproval, openRequest, assertActive } from "./approvalRequest.js";

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
    // Active only by default; `includeInactive` is how a retired project is found
    // again to ask for it back.
    async projects(_: unknown, args: { includeInactive?: boolean | null }, ctx: Context) {
      requireAuth(ctx);
      return ctx.prisma.project.findMany({
        where: args?.includeInactive ? {} : { active: true },
        orderBy: { name: "asc" },
      });
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
      await assertActive(ctx, "PROJECT", args.id);
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
    // Deleting a project takes down every feature, case, record and issue under
    // it, so it goes through approval. The project keeps working until then.
    async deleteProject(_: unknown, args: { id: string }, ctx: Context) {
      const user = await requireQA(ctx);
      if (await needsApproval(ctx, user.role)) {
        await openRequest(ctx, user, "PROJECT", args.id, "DELETE");
        return true;
      }
      await ctx.prisma.project.delete({ where: { id: args.id } });
      await ctx.prisma.approvalRequest.deleteMany({ where: { target: "PROJECT", targetId: args.id } });
      return true;
    },
    // Retire or revive a project: nothing under it is rewritten, the live filters
    // simply stop counting it. Needs approval like any other change.
    async setProjectActive(_: unknown, args: { id: string; active: boolean }, ctx: Context) {
      const user = await requireQA(ctx);
      const p = await ctx.prisma.project.findUnique({ where: { id: args.id } });
      if (!p) throw new Error("Project not found");
      if (p.active === args.active) return p;
      if (await needsApproval(ctx, user.role)) {
        await openRequest(ctx, user, "PROJECT", p.id, args.active ? "ACTIVATE" : "DEACTIVATE");
        return ctx.prisma.project.findUnique({ where: { id: p.id } });
      }
      return ctx.prisma.project.update({ where: { id: p.id }, data: { active: args.active } });
    },
    // Copying a project duplicates every feature and test case under it, so it
    // waits for approval too. Nothing is created until the decision lands.
    async cloneProject(_: unknown, args: { id: string; name?: string }, ctx: Context) {
      const user = await requireQA(ctx);
      await assertActive(ctx, "PROJECT", args.id);
      const name = args.name?.trim() || undefined;
      if (await needsApproval(ctx, user.role)) {
        await openRequest(ctx, user, "PROJECT", args.id, "COPY", { name });
        // No copy yet — hand back the source so the client has something to refetch.
        return ctx.prisma.project.findUnique({ where: { id: args.id } });
      }
      return cloneProjectDeep(args.id, user.id, name);
    },
  },
  Project: {
    key: (p: any) => `PRJ-${p.number}`,
    createdAt: (p: any) => p.createdAt.toISOString(),
    updatedAt: (p: any) => p.updatedAt.toISOString(),
    featureCount: (p: any, _: unknown, ctx: Context) =>
      ctx.prisma.feature.count({ where: { projectId: p.id, active: true } }),
    pendingRequest: (p: any, _: unknown, ctx: Context) =>
      ctx.prisma.approvalRequest.findFirst({ where: { target: "PROJECT", targetId: p.id, state: "PENDING" } }),
    coverage: (p: any) => projectCoverage(p.id),
    async ready(p: any) {
      const cov = await projectCoverage(p.id);
      return cov.percent >= p.minPassPercent;
    },
  },
};
