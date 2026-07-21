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

  // 3. Super admin from ENV. Password from env or generated (logged once).
  let password = env.superAdminPassword;
  if (!password || !isStrongPassword(password)) {
    password = generatePassword();
    log.warn(
      { email: env.superAdminEmail, password },
      "SUPER_ADMIN_PASSWORD unset/weak — generated a temporary password (shown once). Change it after login.",
    );
  }
  const passwordHash = await hashPassword(password);
  await prisma.user.upsert({
    where: { email: env.superAdminEmail },
    update: { role: "SUPER_ADMIN", active: true },
    create: {
      email: env.superAdminEmail,
      name: env.superAdminName,
      role: "SUPER_ADMIN",
      passwordHash,
      authProvider: "BOTH",
      mustChangePassword: !env.superAdminPassword, // force change only if we generated it
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
