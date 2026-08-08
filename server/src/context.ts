import { GraphQLError } from "graphql";
import { prisma } from "./db.js";
import { verifyToken } from "./auth.js";
import { isApproverRole } from "./approval.js";
import { maintenanceActive } from "./maintenance.js";

export interface Context {
  prisma: typeof prisma;
  userId: string | null;
  userName: string | null;
  // Read fresh per request so a role change applies immediately.
  role?: string | null;
  // True when a valid token was rejected because a newer login superseded it.
  sessionSuperseded?: boolean;
}

export async function contextFromAuthHeader(header?: string | null): Promise<Context> {
  const anon: Context = { prisma, userId: null, userName: null, role: null };
  if (typeof header !== "string" || !header.startsWith("Bearer ")) return anon;
  const payload = verifyToken(header.slice(7));
  if (!payload) return anon;
  const row = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { sessionId: true, role: true },
  });
  // Single active session: token's sid must match the user's current sessionId.
  if (!row) return { ...anon, sessionSuperseded: !!payload.sid };
  if (payload.sid && row.sessionId !== payload.sid) return { ...anon, sessionSuperseded: true };
  return { prisma, userId: payload.userId, userName: payload.name ?? null, role: row.role };
}

export async function buildContext({ req }: { req: { headers: Record<string, any> } }): Promise<Context> {
  return contextFromAuthHeader(req.headers["authorization"] || req.headers["Authorization"]);
}

export function requireAuth(ctx: Context): string {
  if (!ctx.userId) {
    if (ctx.sessionSuperseded) {
      throw new GraphQLError("Session ended: your account was signed in on another device.", {
        extensions: { code: "SESSION_SUPERSEDED" },
      });
    }
    throw new Error("Unauthorized: please log in");
  }
  return ctx.userId;
}

// Admin = ADMIN or SUPER_ADMIN. Returns the user row.
export async function requireAdmin(ctx: Context) {
  const userId = requireAuth(ctx);
  const user = await ctx.prisma.user.findUnique({ where: { id: userId } });
  if (user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN") throw new Error("Forbidden: admin only");
  return user!;
}

// Only SUPER_ADMIN may manage admin accounts.
export async function requireSuperAdmin(ctx: Context) {
  const userId = requireAuth(ctx);
  const user = await ctx.prisma.user.findUnique({ where: { id: userId } });
  if (user?.role !== "SUPER_ADMIN") throw new Error("Forbidden: super admin only");
  return user!;
}

// QA content editors: QA, QA_LEAD, ADMIN, SUPER_ADMIN may manage projects/features/test cases.
export async function requireQA(ctx: Context) {
  const userId = requireAuth(ctx);
  const user = await ctx.prisma.user.findUnique({ where: { id: userId } });
  if (user?.role !== "QA" && user?.role !== "QA_LEAD" && user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN") {
    throw new Error("Forbidden: QA only");
  }
  return user!;
}

// Test case review: QA_LEAD and up. Whether this approver may approve *this*
// case still depends on the creator — see canApproveTestCase in approval.ts.
export async function requireApprover(ctx: Context) {
  const userId = requireAuth(ctx);
  const user = await ctx.prisma.user.findUnique({ where: { id: userId } });
  if (!isApproverRole(user?.role)) throw new Error("Forbidden: QA lead only");
  return user!;
}

// VIEWER is read-only: it may run only these mutations. Everything else is
// denied by readOnlyGuard, so a newly added mutation is closed by default.
const VIEWER_MUTATIONS = new Set([
  "login",
  "microsoftLogin",
  "forgotPassword",
  "resetPassword",
  "changePassword",
  "markNotificationRead",
  "markAllNotificationsRead",
]);

// Wraps the whole Mutation map instead of adding a guard per resolver — the one
// place a VIEWER can be stopped, covering HTTP and WS alike.
export function readOnlyGuard<T extends Record<string, any>>(mutations: T): T {
  const out: Record<string, any> = {};
  for (const [field, fn] of Object.entries(mutations)) {
    out[field] = VIEWER_MUTATIONS.has(field)
      ? fn
      : (parent: any, args: any, ctx: Context, info: any) => {
          if (ctx.role === "VIEWER") {
            throw new GraphQLError("Forbidden: the viewer role is read-only", {
              extensions: { code: "FORBIDDEN" },
            });
          }
          return fn(parent, args, ctx, info);
        };
  }
  return out as T;
}

// Auth entry points stay open while the instance is closed: a locked-out user
// still has to be able to sign in far enough to *see* the maintenance screen.
// Everything else is refused, so maintenance is a real freeze and not just a
// screen the client happens to render.
const MAINTENANCE_MUTATIONS = new Set(["login", "microsoftLogin", "forgotPassword", "resetPassword"]);

// Second wrapper around the Mutation map, same shape as readOnlyGuard: one place
// that covers HTTP and WS, and a new mutation is closed by default. Admins are
// exempt — maintenance exists so they can work while nobody else does.
export function maintenanceGuard<T extends Record<string, any>>(mutations: T): T {
  const out: Record<string, any> = {};
  for (const [field, fn] of Object.entries(mutations)) {
    out[field] = MAINTENANCE_MUTATIONS.has(field)
      ? fn
      : async (parent: any, args: any, ctx: Context, info: any) => {
          if (ctx.role !== "ADMIN" && ctx.role !== "SUPER_ADMIN") {
            const s = await ctx.prisma.setting.findUnique({ where: { id: "singleton" } });
            if (process.env.MAINTENANCE === "true" || maintenanceActive(s)) {
              throw new GraphQLError("The system is under maintenance. Please try again later.", {
                extensions: { code: "MAINTENANCE" },
              });
            }
          }
          return fn(parent, args, ctx, info);
        };
  }
  return out as T;
}

// Engineers (and admins) submit/manage app tests.
export async function requireEngineerOrAdmin(ctx: Context) {
  const userId = requireAuth(ctx);
  const user = await ctx.prisma.user.findUnique({ where: { id: userId } });
  if (user?.role !== "ENGINEER" && user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN") {
    throw new Error("Forbidden: engineer only");
  }
  return user!;
}
