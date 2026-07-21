import crypto from "crypto";
import type { Context } from "../context.js";
import { requireAuth } from "../context.js";
import { hashPassword, verifyPassword, signToken } from "../auth.js";
import { assertStrongPassword } from "../passwordPolicy.js";
import { assertNotLocked, recordFailure, recordSuccess } from "../rateLimit.js";
import { API_VERSION } from "../env.public.js";

export const authResolvers = {
  Query: {
    async health(_: unknown, __: unknown, ctx: Context) {
      const s = await ctx.prisma.setting.findUnique({ where: { id: "singleton" } });
      const maintenance = process.env.MAINTENANCE === "true" || Boolean(s?.maintenanceMode);
      return {
        status: "ok",
        apiVersion: API_VERSION,
        maintenance,
        maintenanceMessage: s?.maintenanceMessage ?? null,
      };
    },
    async me(_: unknown, __: unknown, ctx: Context) {
      if (!ctx.userId) return null;
      return ctx.prisma.user.findUnique({ where: { id: ctx.userId } });
    },
  },
  Mutation: {
    async login(_: unknown, args: { email: string; password: string }, ctx: Context) {
      const email = args.email.trim().toLowerCase();
      assertNotLocked(email);
      const user = await ctx.prisma.user.findUnique({ where: { email } });
      const ok = user?.passwordHash ? await verifyPassword(args.password, user.passwordHash) : false;
      if (!user || !user.active || !ok) {
        recordFailure(email);
        throw new Error("Invalid email or password");
      }
      recordSuccess(email);
      // Rotate session id — invalidates tokens from other devices.
      const sid = crypto.randomUUID();
      await ctx.prisma.user.update({ where: { id: user.id }, data: { sessionId: sid } });
      const token = signToken({ userId: user.id, email: user.email, name: user.name, sid });
      return { token, user };
    },
    async changePassword(
      _: unknown,
      args: { currentPassword: string; newPassword: string },
      ctx: Context,
    ) {
      const userId = requireAuth(ctx);
      const user = await ctx.prisma.user.findUnique({ where: { id: userId } });
      if (!user?.passwordHash || !(await verifyPassword(args.currentPassword, user.passwordHash))) {
        throw new Error("Current password is incorrect");
      }
      assertStrongPassword(args.newPassword);
      const passwordHash = await hashPassword(args.newPassword);
      await ctx.prisma.user.update({
        where: { id: userId },
        data: { passwordHash, mustChangePassword: false },
      });
      return true;
    },
  },
};
