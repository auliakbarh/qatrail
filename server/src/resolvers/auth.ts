import crypto from "crypto";
import type { Context } from "../context.js";
import { requireAuth } from "../context.js";
import { hashPassword, verifyPassword, signToken } from "../auth.js";
import { assertStrongPassword } from "../passwordPolicy.js";
import { assertNotLocked, recordFailure, recordSuccess, assertWithinRate } from "../rateLimit.js";
import { sendPasswordResetEmail } from "../mail.js";
import { verifyMicrosoftToken, domainAllowed } from "../sso.js";
import { maintenanceActive } from "../maintenance.js";
import { notifyAdmins } from "../notify.js";
import { notifyDiscord } from "../discord.js";
import { env, hasJiraCreds } from "../env.js";
import { API_VERSION } from "../env.public.js";

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

export const authResolvers = {
  Query: {
    async health(_: unknown, __: unknown, ctx: Context) {
      const s = await ctx.prisma.setting.findUnique({ where: { id: "singleton" } });
      const maintenance = process.env.MAINTENANCE === "true" || maintenanceActive(s);
      return {
        status: "ok",
        apiVersion: API_VERSION,
        maintenance,
        maintenanceMessage: s?.maintenanceMessage ?? null,
        // The window is public so every page can announce it before it starts.
        maintenanceStartAt: s?.maintenanceStartAt?.toISOString() ?? null,
        maintenanceEndAt: s?.maintenanceEndAt?.toISOString() ?? null,
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
    // an INACTIVE viewer that an admin has to approve (Settings → Users →
    // Active). The role comes from us, never from Entra.
    async microsoftLogin(_: unknown, args: { idToken: string }, ctx: Context) {
      const identity = await verifyMicrosoftToken(args.idToken);
      const email = identity.email.trim().toLowerCase();
      const s = await ctx.prisma.setting.findUnique({ where: { id: "singleton" } });

      // One gate for every SSO sign-in, not just new accounts: an allow-list that
      // only covered provisioning would leave an already-created off-domain
      // account signing in. Password login is unaffected.
      if (!domainAllowed(email, s?.ssoAllowedDomains ?? [])) {
        throw new Error("This email domain is not allowed to sign in with Microsoft.");
      }

      let user = await ctx.prisma.user.findUnique({ where: { email } });
      const provisioned = !user;
      if (!user && s?.ssoAutoProvision) {
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
            // Pending admin approval. Creating it active would make the setting
            // an open door for the whole tenant.
            active: false,
          },
        });
      }
      if (!user) throw new Error("No account for this Microsoft user. Contact an admin.");

      // The audit plugin in index.ts only covers NOTIFIABLE mutations, and it
      // reads the actor off the request context — which is empty here, because
      // signing in is what creates the identity. So trace it from the resolver.
      const audit = (action: string) =>
        void ctx.prisma.auditLog
          .create({ data: { action, entityId: user!.id, label: email, actor: user!.name, actorId: user!.id } })
          .catch(() => {});

      if (provisioned) {
        // Recorded before the refusal below: this request is the only place the
        // account's creation happens, even though the sign-in itself fails.
        audit("ssoUserProvisioned");
        // Nobody can use this account until an admin activates it — chase them.
        const msg = `Microsoft sign-in created a Viewer account awaiting approval: ${user.name} (${email})`;
        void notifyAdmins("SSO_USER_CREATED", msg);
        void notifyDiscord("ssoUserProvisioned", user.name, {
          name: email,
          note: "Role: VIEWER — inactive until an admin approves it (Settings → Users).",
        });
        throw new Error("Your account has been created and is waiting for an admin to approve it.");
      }
      if (!user.active) throw new Error("This account is not active. Contact an admin.");

      const sid = crypto.randomUUID();
      await ctx.prisma.user.update({ where: { id: user.id }, data: { sessionId: sid } });
      const token = signToken({ userId: user.id, email: user.email, name: user.name, sid });
      audit("microsoftLogin");
      return { token, user };
    },

    async changePassword(
      _: unknown,
      args: { currentPassword?: string | null; newPassword: string },
      ctx: Context,
    ) {
      const userId = requireAuth(ctx);
      const user = await ctx.prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw new Error("User not found");
      // An SSO account has no password to confirm — requiring one would lock it
      // out of ever setting one. The verified session is the proof of identity.
      // Every other account must prove the current password.
      if (user.passwordHash && !(await verifyPassword(args.currentPassword ?? "", user.passwordHash))) {
        throw new Error("Current password is incorrect");
      }
      assertStrongPassword(args.newPassword);
      const passwordHash = await hashPassword(args.newPassword);
      await ctx.prisma.user.update({
        where: { id: userId },
        data: {
          passwordHash,
          mustChangePassword: false,
          // An SSO-only account that just set its first password can sign in
          // both ways now — the admin list would otherwise still read "SSO".
          ...(user.passwordHash ? {} : { authProvider: "BOTH" }),
        },
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
