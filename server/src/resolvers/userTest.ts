import type { Context } from "../context.js";
import { requireAuth } from "../context.js";
import { encryptSecret, decryptSecret } from "../crypto.js";
import { env } from "../env.js";
import { notify, notifyAll } from "../notify.js";

interface UserTestInput {
  projectId: string;
  account: string;
  password?: string | null;
  environment: "STAGING" | "PRODUCTION";
  note?: string | null;
}

function scalarData(input: UserTestInput) {
  const pw = input.password;
  return {
    account: input.account.trim(),
    password: pw && pw.trim() ? encryptSecret(pw, env.secretEncKey) : null,
    environment: input.environment,
    note: input.note ?? null,
  };
}

export const userTestResolvers = {
  Query: {
    async userTests(_: unknown, args: { projectId?: string }, ctx: Context) {
      requireAuth(ctx);
      return ctx.prisma.userTest.findMany({
        where: args.projectId ? { projectId: args.projectId } : {},
        orderBy: { createdAt: "desc" },
      });
    },
    async userTest(_: unknown, args: { id: string }, ctx: Context) {
      requireAuth(ctx);
      return ctx.prisma.userTest.findUnique({ where: { id: args.id } });
    },
  },

  Mutation: {
    async createUserTest(_: unknown, args: { input: UserTestInput }, ctx: Context) {
      const userId = requireAuth(ctx);
      const ut = await ctx.prisma.userTest.create({
        data: { ...scalarData(args.input), projectId: args.input.projectId, createdById: userId },
      });
      await notifyAll("USER_TEST_CREATED", `New user test: UT-${ut.number}`, { userTestId: ut.id }, userId);
      return ut;
    },
    async updateUserTest(_: unknown, args: { id: string; input: UserTestInput }, ctx: Context) {
      requireAuth(ctx);
      const ut = await ctx.prisma.userTest.findUnique({ where: { id: args.id } });
      if (!ut) throw new Error("User test not found");
      return ctx.prisma.userTest.update({ where: { id: ut.id }, data: scalarData(args.input) });
    },
    async deleteUserTest(_: unknown, args: { id: string }, ctx: Context) {
      requireAuth(ctx);
      const ut = await ctx.prisma.userTest.findUnique({ where: { id: args.id } });
      if (!ut) throw new Error("User test not found");
      // Clean up generic watches/comments (no FK).
      await ctx.prisma.watch.deleteMany({ where: { target: "USER_TEST", targetId: ut.id } });
      await ctx.prisma.comment.deleteMany({ where: { target: "USER_TEST", targetId: ut.id } });
      await ctx.prisma.userTest.delete({ where: { id: ut.id } });
      return true;
    },
  },

  UserTest: {
    key: (u: any) => `UT-${u.number}`,
    createdAt: (u: any) => u.createdAt.toISOString(),
    updatedAt: (u: any) => u.updatedAt.toISOString(),
    createdBy: (u: any, _: unknown, ctx: Context) => ctx.prisma.user.findUnique({ where: { id: u.createdById } }),
    projectName: async (u: any, _: unknown, ctx: Context) =>
      (await ctx.prisma.project.findUnique({ where: { id: u.projectId }, select: { name: true } }))?.name ?? "",
    password: (u: any) => {
      if (!u.password) return null;
      try {
        return decryptSecret(u.password, env.secretEncKey);
      } catch {
        return null;
      }
    },
  },
};
