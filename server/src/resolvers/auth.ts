import crypto from "crypto";
import type { Context } from "../context.js";
import { requireAuth } from "../context.js";
import { hashPassword, verifyPassword, signToken } from "../auth.js";
import { assertStrongPassword } from "../passwordPolicy.js";
import { assertNotLocked, recordFailure, recordSuccess, assertWithinRate } from "../rateLimit.js";
import { sendPasswordResetEmail } from "../mail.js";
import { verifyMicrosoftToken } from "../sso.js";
import { env, hasJiraCreds } from "../env.js";
import { API_VERSION } from "../env.public.js";

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

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
        jiraConfigured: hasJiraCreds(),
        jiraBaseUrl: env.jira.baseUrl || null,
        ssoEnabled: env.msSso.enabled,
      };
    },
    async me(_: unknown, __: unknown, ctx: Context) {
      if (!ctx.userId) return null;
      return ctx.prisma.user.findUnique({ where: { id: ctx.userId } });
    },
    // Everyone an authed user may @mention in a comment.
    async mentionableUsers(_: unknown, __: unknown, ctx: Context) {
      requireAuth(ctx);
      return ctx.prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" } });
    },
    async engineers(_: unknown, __: unknown, ctx: Context) {
      requireAuth(ctx);
      return ctx.prisma.user.findMany({
        where: { role: "ENGINEER", active: true },
        orderBy: { name: "asc" },
      });
    },
  },
  Mutation: {
    async login(_: unknown, args: { email: string; password: string }, ctx: Context) {
      const email = args.email.trim().toLowerCase();
      await assertNotLocked(email);
      const user = await ctx.prisma.user.findUnique({ where: { email } });
      const ok = user?.passwordHash ? await verifyPassword(args.password, user.passwordHash) : false;
      if (!user || !user.active || !ok) {
        await recordFailure(email);
        throw new Error("Invalid email or password");
      }
      await recordSuccess(email);
      // Rotate session id — invalidates tokens from other devices.
      const sid = crypto.randomUUID();
      await ctx.prisma.user.update({ where: { id: user.id }, data: { sessionId: sid } });
      const token = signToken({ userId: user.id, email: user.email, name: user.name, sid });
      return { token, user };
    },
    // Microsoft Entra SSO login. The email must match a User row — unless the
    // admin turned on `ssoAutoProvision`, which creates unknown tenant users as
    // VIEWER (read-only) on first sign-in. Either way the role comes from us,
    // never from Entra.
    async microsoftLogin(_: unknown, args: { idToken: string }, ctx: Context) {
      const identity = await verifyMicrosoftToken(args.idToken);
      const email = identity.email.trim().toLowerCase();
      let user = await ctx.prisma.user.findUnique({ where: { email } });
      if (!user) {
        const s = await ctx.prisma.setting.findUnique({ where: { id: "singleton" } });
        if (s?.ssoAutoProvision) {
          // upsert, not create: two tabs signing in at once would race a create.
          user = await ctx.prisma.user.upsert({
            where: { email },
            update: {},
            create: {
              email,
              name: identity.name?.trim() || email,
              role: "VIEWER",
              authProvider: "SSO",
              // No password to change — this account can only ever sign in via SSO.
              mustChangePassword: false,
            },
          });
        }
      }
      if (!user || !user.active) throw new Error("No account for this Microsoft user. Contact an admin.");
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

    async forgotPassword(_: unknown, args: { email: string }, ctx: Context) {
      const email = args.email.trim().toLowerCase();
      await assertWithinRate(`forgot:${email}`, 3, 15 * 60_000); // 3 per 15 min
      const user = await ctx.prisma.user.findUnique({ where: { email } });
      // Always return true — don't leak whether the email exists.
      if (user && user.active) {
        const token = crypto.randomBytes(32).toString("base64url");
        const expiresAt = new Date(Date.now() + 60 * 60_000); // 1h
        await ctx.prisma.passwordReset.create({
          data: { userId: user.id, tokenHash: sha256(token), expiresAt },
        });
        const url = `${env.frontendBaseUrl}/reset-password/${token}`;
        await sendPasswordResetEmail(email, url, user.name);
      }
      return true;
    },

    async resetPassword(_: unknown, args: { token: string; newPassword: string }, ctx: Context) {
      const row = await ctx.prisma.passwordReset.findUnique({ where: { tokenHash: sha256(args.token) } });
      if (!row || row.usedAt || row.expiresAt < new Date()) {
        throw new Error("Reset link is invalid or has expired.");
      }
      assertStrongPassword(args.newPassword);
      const passwordHash = await hashPassword(args.newPassword);
      await ctx.prisma.$transaction([
        ctx.prisma.user.update({
          where: { id: row.userId },
          data: { passwordHash, mustChangePassword: false, sessionId: null },
        }),
        ctx.prisma.passwordReset.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
      ]);
      return true;
    },
  },
};
