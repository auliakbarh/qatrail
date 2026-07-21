import { GraphQLError } from "graphql";
import { prisma } from "./db.js";
import { verifyToken } from "./auth.js";

export interface Context {
  prisma: typeof prisma;
  userId: string | null;
  userName: string | null;
  // True when a valid token was rejected because a newer login superseded it.
  sessionSuperseded?: boolean;
}

export async function contextFromAuthHeader(header?: string | null): Promise<Context> {
  const anon: Context = { prisma, userId: null, userName: null };
  if (typeof header !== "string" || !header.startsWith("Bearer ")) return anon;
  const payload = verifyToken(header.slice(7));
  if (!payload) return anon;
  // Single active session: token's sid must match the user's current sessionId.
  if (payload.sid) {
    const row = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { sessionId: true },
    });
    if (!row || row.sessionId !== payload.sid) return { ...anon, sessionSuperseded: true };
  }
  return { prisma, userId: payload.userId, userName: payload.name ?? null };
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
