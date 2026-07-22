import "dotenv/config";
import { decryptSecret } from "./crypto.js";

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

// JIRA token from plaintext (JIRA_API_TOKEN) or encrypted (JIRA_API_TOKEN_ENC + JIRA_ENC_KEY).
function resolveJiraToken(): string {
  const plain = process.env.JIRA_API_TOKEN;
  if (plain) return plain;
  const enc = process.env.JIRA_API_TOKEN_ENC;
  const key = process.env.JIRA_ENC_KEY;
  if (enc && key) {
    try {
      return decryptSecret(enc, key);
    } catch {
      throw new Error("Failed to decrypt JIRA_API_TOKEN_ENC — check JIRA_ENC_KEY.");
    }
  }
  return "";
}

const DEV_JWT_SECRET = "dev-insecure-secret";
const isProdEnv = (process.env.NODE_ENV ?? "development") === "production";
if (isProdEnv && (!process.env.JWT_SECRET || process.env.JWT_SECRET === DEV_JWT_SECRET)) {
  throw new Error("JWT_SECRET must be set to a non-default value in production.");
}
// In prod the at-rest encryption key must be its own value, not the JWT-secret fallback.
if (isProdEnv && (!process.env.SECRET_ENC_KEY || process.env.SECRET_ENC_KEY === process.env.JWT_SECRET)) {
  throw new Error("SECRET_ENC_KEY must be set to a distinct value (not JWT_SECRET) in production.");
}

export const env = {
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET", DEV_JWT_SECRET),
  port: parseInt(process.env.PORT ?? "4000", 10),
  isProd: isProdEnv,
  // Allowed browser origins for CORS + WebSocket. Comma-separated. Dev = all.
  corsOrigins: (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  // Env super admin — seeded root account (matched by role SUPER_ADMIN). Keep in sync with seed.ts.
  superAdminEmail: (process.env.SUPER_ADMIN_EMAIL ?? "it@hpam.co.id").toLowerCase(),
  superAdminPassword: process.env.SUPER_ADMIN_PASSWORD ?? "",
  superAdminName: process.env.SUPER_ADMIN_NAME ?? "Super Admin",
  // Passphrase for encrypting test-account passwords at rest. Falls back to JWT secret.
  // ponytail: shared passphrase; give it its own key if secret rotation matters.
  secretEncKey: process.env.SECRET_ENC_KEY ?? process.env.JWT_SECRET ?? DEV_JWT_SECRET,
  // Base URL of the client app (issue deep-links, reset-password emails).
  frontendBaseUrl: (
    process.env.FRONTEND_BASE_URL ??
    (process.env.CORS_ORIGINS ?? "").split(",")[0]?.trim() ??
    "http://localhost:5173"
  ).replace(/\/+$/, ""),
  // JIRA credentials (optional — issues work without JIRA).
  jira: {
    baseUrl: process.env.JIRA_BASE_URL ?? "",
    email: process.env.JIRA_EMAIL ?? "",
    apiToken: resolveJiraToken(),
  },
  // Microsoft Entra SSO — prepared, not implemented (no Entra access yet).
  msSso: {
    enabled: process.env.MS_SSO_ENABLED === "true",
    tenantId: process.env.MS_TENANT_ID ?? "",
    clientId: process.env.MS_CLIENT_ID ?? "",
  },
  // SharePoint attachment upload — prepared, not implemented. Attachments are
  // URL-based today; flip this on once the Graph upload path is wired.
  sharepoint: {
    enabled: process.env.SHAREPOINT_ENABLED === "true",
  },
};

/** True when global JIRA credentials are present. */
export function hasJiraCreds(): boolean {
  return Boolean(env.jira.baseUrl && env.jira.email && env.jira.apiToken);
}
