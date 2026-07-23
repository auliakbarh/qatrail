import type { Context } from "../context.js";
import { requireAuth } from "../context.js";

type Target = "ISSUE" | "APP_TEST";

export const watchResolvers = {
  Query: {
    async isWatching(_: unknown, args: { target: Target; targetId: string }, ctx: Context) {
      const userId = requireAuth(ctx);
      const row = await ctx.prisma.watch.findUnique({
        where: { userId_target_targetId: { userId, target: args.target, targetId: args.targetId } },
      });
      return !!row;
    },
  },
  Mutation: {
    async setWatch(_: unknown, args: { target: Target; targetId: string; watching: boolean }, ctx: Context) {
      const userId = requireAuth(ctx);
      const key = { userId_target_targetId: { userId, target: args.target, targetId: args.targetId } };
      if (args.watching) {
        await ctx.prisma.watch.upsert({
          where: key,
          create: { userId, target: args.target, targetId: args.targetId },
          update: {},
        });
      } else {
        await ctx.prisma.watch.deleteMany({ where: { userId, target: args.target, targetId: args.targetId } });
      }
      return args.watching;
    },
  },
};
