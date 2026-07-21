import type { Context } from "../context.js";
import { requireAuth } from "../context.js";
import { pubsub, notificationTopic } from "../pubsub.js";

export const notificationResolvers = {
  Query: {
    async notifications(_: unknown, __: unknown, ctx: Context) {
      const userId = requireAuth(ctx);
      return ctx.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
    },
    async unreadCount(_: unknown, __: unknown, ctx: Context) {
      const userId = requireAuth(ctx);
      return ctx.prisma.notification.count({ where: { userId, read: false } });
    },
  },
  Mutation: {
    async markNotificationRead(_: unknown, args: { id: string }, ctx: Context) {
      const userId = requireAuth(ctx);
      await ctx.prisma.notification.updateMany({
        where: { id: args.id, userId },
        data: { read: true },
      });
      return true;
    },
    async markAllNotificationsRead(_: unknown, __: unknown, ctx: Context) {
      const userId = requireAuth(ctx);
      await ctx.prisma.notification.updateMany({ where: { userId, read: false }, data: { read: true } });
      return true;
    },
  },
  Subscription: {
    notificationAdded: {
      subscribe: (_: unknown, __: unknown, ctx: Context) => {
        const userId = requireAuth(ctx);
        return pubsub.asyncIterableIterator(notificationTopic(userId));
      },
    },
  },
  Notification: {
    createdAt: (n: any) => (typeof n.createdAt === "string" ? n.createdAt : n.createdAt.toISOString()),
  },
};
