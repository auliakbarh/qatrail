import type { Context } from "../context.js";
import { requireAuth, requireQA, canReadTestSecret } from "../context.js";
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

const isAdmin = (role: string) => role === "ADMIN" || role === "SUPER_ADMIN";

// Creator or admin, the same shape as appTest.ts / sessionTest.ts — a third
// ownership pattern would be one more place for the rule to drift.
async function getOwned(ctx: Context, id: string, user: { id: string; role: string }) {
  const ut = await ctx.prisma.userTest.findUnique({ where: { id } });
  if (!ut) throw new Error("User test not found");
  if (ut.createdById !== user.id && !isAdmin(user.role)) {
    throw new Error("Forbidden: only the creator may do this");
  }
  return ut;
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
      // A test account is QA's content, like a test case: engineers use it, they
      // don't file it. Every other content mutation is behind requireQA too.
      const user = await requireQA(ctx);
      const ut = await ctx.prisma.userTest.create({
        data: { ...scalarData(args.input), projectId: args.input.projectId, createdById: user.id },
      });
      await notifyAll("USER_TEST_CREATED", `New user test: UT-${ut.number}`, { userTestId: ut.id }, user.id);
      return ut;
    },
    async updateUserTest(_: unknown, args: { id: string; input: UserTestInput }, ctx: Context) {
      const user = await requireQA(ctx);
      const ut = await getOwned(ctx, args.id, user);
      return ctx.prisma.userTest.update({ where: { id: ut.id }, data: scalarData(args.input) });
    },
    async deleteUserTest(_: unknown, args: { id: string }, ctx: Context) {
      const user = await requireQA(ctx);
      const ut = await getOwned(ctx, args.id, user);
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
    // Same read rule as `Issue.testPassword` — one helper, not two rules.
    password: (u: any, _: unknown, ctx: Context) => {
      if (!u.password || !canReadTestSecret(ctx.role)) return null;
      try {
        return decryptSecret(u.password, env.secretEncKey);
      } catch {
        return null;
      }
    },
  },
};
