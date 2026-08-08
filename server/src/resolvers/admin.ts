import type { Context } from "../context.js";
import { requireAdmin } from "../context.js";
import { hashPassword } from "../auth.js";
import { generatePassword } from "../genPassword.js";
import { sendDiscordTest } from "../discord.js";
import { testJira } from "../jira.js";
import { requireSuperAdmin } from "../context.js";
import { generateKey, hashKey } from "../publicApi/keys.js";

interface UserInput {
  email: string;
  name: string;
  role: "SUPER_ADMIN" | "ADMIN" | "QA_LEAD" | "QA" | "ENGINEER" | "VIEWER";
  active?: boolean | null;
}

interface PublicApiClientInput {
  appId: string;
  name: string;
  allowedOrigins: string[];
  allowedIps: string[];
  expiresAt?: string | null;
}

interface PublicApiClientUpdateInput {
  name?: string | null;
  allowedOrigins?: string[] | null;
  allowedIps?: string[] | null;
  active?: boolean | null;
  expiresAt?: string | null;
}

// Hostnames only — an entry like "https://portal.hpam.id/" is stored as
// "portal.hpam.id", which is what publicApi/auth.ts compares against.
function normaliseHosts(values: string[]): string[] {
  return values
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean)
    .map((v) => {
      try {
        return new URL(v.includes("://") ? v : `https://${v}`).hostname;
      } catch {
        return v;
      }
    });
}

// The allow-list is closed by default (publicApi/auth.ts), so a client with
// neither origins nor IPs is dead on arrival. Say so at creation time.
function assertAllowList(origins: string[], ips: string[]): void {
  const hasAny = origins.some((v) => v.trim()) || ips.some((v) => v.trim());
  if (!hasAny) throw new Error("A public API client needs at least one allowed origin or IP");
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
  // Dates as ISO strings, same as every other type in the schema.
  PublicApiClient: {
    createdAt: (c: any) => c.createdAt.toISOString(),
    expiresAt: (c: any) => c.expiresAt?.toISOString() ?? null,
    lastUsedAt: (c: any) => c.lastUsedAt?.toISOString() ?? null,
  },
  User: {
    approvedAt: (u: any) => u.approvedAt?.toISOString() ?? null,
  },

  Query: {
    // Public API clients are credentials, not settings: super admin only, and
    // the row never carries the key — only its hash exists, in the DB.
    async publicApiClients(_: unknown, __: unknown, ctx: Context) {
      await requireSuperAdmin(ctx);
      return ctx.prisma.publicApiClient.findMany({ orderBy: { createdAt: "desc" } });
    },
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
          ssoAutoProvision: false,
          ssoAllowedDomains: [],
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
      // `details` is stored as free-form Json; only hand back well-shaped pairs
      // so a hand-edited row can't break the field's non-null contract.
      return rows.map((r) => ({
        ...r,
        at: r.at.toISOString(),
        details: (Array.isArray(r.details) ? r.details : []).filter(
          (d: any) => d && typeof d.name === "string" && typeof d.value === "string",
        ),
      }));
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
          // An admin creating the account is the approval.
          approvedAt: new Date(),
        },
      });
      return { user, defaultPassword: password };
    },

    async updateUser(_: unknown, args: { id: string; input: UserInput }, ctx: Context) {
      const admin = await requireAdmin(ctx);
      const target = await ctx.prisma.user.findUnique({ where: { id: args.id } });
      if (!target) throw new Error("User not found");
      guardTarget(admin, target.role, args.input.role);
      const active = args.input.active ?? target.active;
      return ctx.prisma.user.update({
        where: { id: args.id },
        data: {
          email: args.input.email.trim().toLowerCase(),
          name: args.input.name.trim(),
          role: args.input.role,
          active,
          // Stamped once, the first time an admin activates the account — a later
          // deactivate must not read as "never approved" again.
          ...(active && !target.approvedAt ? { approvedAt: new Date() } : {}),
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
        "ssoAutoProvision",
        "ssoAllowedDomains",
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

    async testJira(_: unknown, args: { jiraKey?: string | null }, ctx: Context) {
      const user = await requireAdmin(ctx);
      return testJira(args.jiraKey, { name: user.name, email: user.email, at: new Date() });
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

    // ---- public API clients (docs/API_PUBLIC.md) ----

    // Returns the raw key ONCE. It is never stored and cannot be shown again;
    // a lost key is replaced by revoking and creating another.
    async createPublicApiClient(_: unknown, args: { input: PublicApiClientInput }, ctx: Context) {
      const actor = await requireSuperAdmin(ctx);
      assertAllowList(args.input.allowedOrigins, args.input.allowedIps);
      const key = generateKey();
      const client = await ctx.prisma.publicApiClient.create({
        data: {
          appId: args.input.appId.trim(),
          name: args.input.name.trim(),
          keyHash: hashKey(key),
          allowedOrigins: normaliseHosts(args.input.allowedOrigins),
          allowedIps: args.input.allowedIps.map((v) => v.trim()).filter(Boolean),
          expiresAt: args.input.expiresAt ? new Date(args.input.expiresAt) : null,
          createdById: actor.id,
        },
      });
      return { client, key };
    },

    async updatePublicApiClient(_: unknown, args: { id: string; input: PublicApiClientUpdateInput }, ctx: Context) {
      await requireSuperAdmin(ctx);
      const { input } = args;
      const data: Record<string, unknown> = {};
      if (input.name != null) data.name = input.name.trim();
      if (input.active != null) data.active = input.active;
      if (input.expiresAt !== undefined) data.expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
      if (input.allowedOrigins != null) data.allowedOrigins = normaliseHosts(input.allowedOrigins);
      if (input.allowedIps != null) data.allowedIps = input.allowedIps.map((v) => v.trim()).filter(Boolean);

      // An empty allow-list would leave a client that can never authenticate;
      // refuse it here rather than let it look configured.
      if (input.allowedOrigins != null || input.allowedIps != null) {
        const current = await ctx.prisma.publicApiClient.findUnique({ where: { id: args.id } });
        if (!current) throw new Error("Public API client not found");
        assertAllowList(
          (data.allowedOrigins as string[]) ?? current.allowedOrigins,
          (data.allowedIps as string[]) ?? current.allowedIps,
        );
      }
      return ctx.prisma.publicApiClient.update({ where: { id: args.id }, data });
    },

    // Hard delete: the row is only a credential, and AuditLog keeps the trace.
    async revokePublicApiClient(_: unknown, args: { id: string }, ctx: Context) {
      await requireSuperAdmin(ctx);
      await ctx.prisma.publicApiClient.delete({ where: { id: args.id } });
      return true;
    },
  },
};
