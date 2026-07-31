import type { Context } from "../context.js";
import { requireAdmin } from "../context.js";
import { hashPassword } from "../auth.js";
import { generatePassword } from "../genPassword.js";
import { sendDiscordTest } from "../discord.js";

interface UserInput {
  email: string;
  name: string;
  role: "SUPER_ADMIN" | "ADMIN" | "QA_LEAD" | "QA" | "ENGINEER" | "VIEWER";
  active?: boolean | null;
}

// Only a super admin may create/modify SUPER_ADMIN accounts or touch a
// SUPER_ADMIN target. Admins manage admin/qa/engineer users.
function guardTarget(actor: any, targetRole: string, newRole?: string) {
  const superOnly = targetRole === "SUPER_ADMIN" || newRole === "SUPER_ADMIN";
  if (superOnly && actor.role !== "SUPER_ADMIN") {
    throw new Error("Forbidden: only a super admin may manage super admin accounts");
  }
}

export const adminResolvers = {
  Query: {
    async users(_: unknown, __: unknown, ctx: Context) {
      await requireAdmin(ctx);
      return ctx.prisma.user.findMany({ orderBy: [{ role: "asc" }, { name: "asc" }] });
    },
    async setting(_: unknown, __: unknown, ctx: Context) {
      await requireAdmin(ctx);
      const s = await ctx.prisma.setting.findUnique({ where: { id: "singleton" } });
      return (
        s ?? {
          maintenanceMode: false,
          maintenanceMessage: null,
          discordEnabled: false,
          discordWebhookUrl: null,
          autoApproveNewHours: null,
          autoApproveChangeHours: null,
        }
      );
    },
    async slaTargets(_: unknown, __: unknown, ctx: Context) {
      await requireAdmin(ctx);
      return ctx.prisma.slaTarget.findMany();
    },
    async auditLogs(_: unknown, { limit }: { limit?: number }, ctx: Context) {
      await requireAdmin(ctx);
      const rows = await ctx.prisma.auditLog.findMany({
        orderBy: { at: "desc" },
        take: Math.min(limit ?? 100, 500),
      });
      return rows.map((r) => ({ ...r, at: r.at.toISOString() }));
    },
  },
  Mutation: {
    async createUser(_: unknown, args: { input: UserInput }, ctx: Context) {
      const admin = await requireAdmin(ctx);
      guardTarget(admin, "", args.input.role);
      const password = generatePassword();
      const user = await ctx.prisma.user.create({
        data: {
          email: args.input.email.trim().toLowerCase(),
          name: args.input.name.trim(),
          role: args.input.role,
          passwordHash: await hashPassword(password),
          authProvider: "BOTH",
          mustChangePassword: true,
          active: args.input.active ?? true,
        },
      });
      return { user, defaultPassword: password };
    },

    async updateUser(_: unknown, args: { id: string; input: UserInput }, ctx: Context) {
      const admin = await requireAdmin(ctx);
      const target = await ctx.prisma.user.findUnique({ where: { id: args.id } });
      if (!target) throw new Error("User not found");
      guardTarget(admin, target.role, args.input.role);
      return ctx.prisma.user.update({
        where: { id: args.id },
        data: {
          email: args.input.email.trim().toLowerCase(),
          name: args.input.name.trim(),
          role: args.input.role,
          active: args.input.active ?? target.active,
        },
      });
    },

    async deleteUser(_: unknown, args: { id: string }, ctx: Context) {
      const admin = await requireAdmin(ctx);
      if (admin.id === args.id) throw new Error("You cannot delete your own account");
      const target = await ctx.prisma.user.findUnique({ where: { id: args.id } });
      if (!target) throw new Error("User not found");
      guardTarget(admin, target.role);
      await ctx.prisma.user.delete({ where: { id: args.id } });
      return true;
    },

    async resetUserPassword(_: unknown, args: { id: string }, ctx: Context) {
      const admin = await requireAdmin(ctx);
      const target = await ctx.prisma.user.findUnique({ where: { id: args.id } });
      if (!target) throw new Error("User not found");
      guardTarget(admin, target.role);
      const password = generatePassword();
      await ctx.prisma.user.update({
        where: { id: args.id },
        data: { passwordHash: await hashPassword(password), mustChangePassword: true, sessionId: null },
      });
      return password;
    },

    async updateSetting(_: unknown, args: { input: any }, ctx: Context) {
      await requireAdmin(ctx);
      const data: any = {};
      for (const k of [
        "maintenanceMode",
        "maintenanceMessage",
        "discordEnabled",
        "discordWebhookUrl",
        "autoApproveNewHours",
        "autoApproveChangeHours",
      ]) {
        if (args.input[k] !== undefined) data[k] = args.input[k];
      }
      return ctx.prisma.setting.upsert({
        where: { id: "singleton" },
        update: data,
        create: { id: "singleton", ...data },
      });
    },

    async testDiscord(_: unknown, args: { url: string }, ctx: Context) {
      await requireAdmin(ctx);
      return sendDiscordTest(args.url);
    },

    async updateSlaTarget(
      _: unknown,
      args: { priority: string; respondMins?: number | null; resolveMins: number },
      ctx: Context,
    ) {
      await requireAdmin(ctx);
      return ctx.prisma.slaTarget.upsert({
        where: { priority: args.priority as any },
        update: { respondMins: args.respondMins ?? null, resolveMins: args.resolveMins },
        create: { priority: args.priority as any, respondMins: args.respondMins ?? null, resolveMins: args.resolveMins },
      });
    },
  },
};
