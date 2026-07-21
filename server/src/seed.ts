import crypto from "crypto";
import { prisma } from "./db.js";
import { env } from "./env.js";
import { hashPassword } from "./auth.js";
import { isStrongPassword } from "./passwordPolicy.js";
import { logger } from "./logger.js";

const log = logger.child({ mod: "seed" });

// Generate a policy-compliant password (used when SUPER_ADMIN_PASSWORD is unset).
function generatePassword(): string {
  const pick = (set: string) => set[crypto.randomInt(set.length)];
  const base =
    pick("ABCDEFGHJKLMNPQRSTUVWXYZ") +
    pick("abcdefghijkmnpqrstuvwxyz") +
    pick("23456789") +
    pick("!@#$%^&*") +
    crypto.randomBytes(8).toString("base64url").slice(0, 8);
  return base;
}

async function main() {
  // 1. Singleton Setting row.
  await prisma.setting.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });

  // 2. SLA targets (production). Admin-editable later. Minutes.
  const slaDefaults = [
    { priority: "HIGH" as const, respondMins: 60, resolveMins: 240 },
    { priority: "MEDIUM" as const, respondMins: 240, resolveMins: 1440 },
    { priority: "LOW" as const, respondMins: null, resolveMins: 4320 },
  ];
  for (const s of slaDefaults) {
    await prisma.slaTarget.upsert({
      where: { priority: s.priority },
      update: {},
      create: s,
    });
  }

  // 3. Super admin from ENV.
  // - A strong SUPER_ADMIN_PASSWORD is authoritative: applied on create AND update.
  // - If unset/weak, generate one on create only (logged once); on update, leave
  //   the existing password untouched (don't clobber a password changed via the UI).
  const envPwStrong = Boolean(env.superAdminPassword) && isStrongPassword(env.superAdminPassword);
  if (env.superAdminPassword && !envPwStrong) {
    log.warn(
      { email: env.superAdminEmail },
      "SUPER_ADMIN_PASSWORD is set but does not meet the policy (min 9 chars, upper+lower+number+symbol) — ignored.",
    );
  }
  const createPw = envPwStrong ? env.superAdminPassword : generatePassword();
  if (!envPwStrong) {
    log.warn(
      { email: env.superAdminEmail, password: createPw },
      "Using a generated password for the super admin (shown once, only applied if the account is new). Change it after login.",
    );
  }
  const update: any = { role: "SUPER_ADMIN", active: true };
  if (envPwStrong) {
    update.passwordHash = await hashPassword(env.superAdminPassword);
    update.mustChangePassword = false;
  }
  await prisma.user.upsert({
    where: { email: env.superAdminEmail },
    update,
    create: {
      email: env.superAdminEmail,
      name: env.superAdminName,
      role: "SUPER_ADMIN",
      passwordHash: await hashPassword(createPw),
      authProvider: "BOTH",
      mustChangePassword: !envPwStrong, // force change only when generated
      active: true,
    },
  });

  log.info({ email: env.superAdminEmail }, "seed complete");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    log.error({ err }, "seed failed");
    await prisma.$disconnect();
    process.exit(1);
  });
