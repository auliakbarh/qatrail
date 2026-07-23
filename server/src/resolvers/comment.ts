import type { Context } from "../context.js";
import { requireAuth } from "../context.js";
import { notify } from "../notify.js";

type Target = "ISSUE" | "APP_TEST" | "USER_TEST";

const isAdmin = (role?: string) => role === "ADMIN" || role === "SUPER_ADMIN";

// Everyone who should hear about a new comment on this target: prior commenters
// plus the target's key people (issue reporter+assignee / app-test creator),
// minus the comment author.
async function recipients(ctx: Context, target: Target, targetId: string, authorId: string): Promise<string[]> {
  const set = new Set<string>();
  const prior = await ctx.prisma.comment.findMany({
    where: { target, targetId },
    select: { byId: true },
    distinct: ["byId"],
  });
  for (const c of prior) set.add(c.byId);

  if (target === "ISSUE") {
    const issue = await ctx.prisma.issue.findUnique({ where: { id: targetId }, select: { reporterId: true, assigneeId: true } });
    if (issue) { set.add(issue.reporterId); set.add(issue.assigneeId); }
  } else if (target === "APP_TEST") {
    const at = await ctx.prisma.appTest.findUnique({ where: { id: targetId }, select: { createdById: true } });
    if (at) set.add(at.createdById);
  } else {
    const ut = await ctx.prisma.userTest.findUnique({ where: { id: targetId }, select: { createdById: true } });
    if (ut) set.add(ut.createdById);
  }
  // Watchers of this target also hear about new comments.
  const watchers = await ctx.prisma.watch.findMany({ where: { target, targetId }, select: { userId: true } });
  for (const w of watchers) set.add(w.userId);
  set.delete(authorId);
  return [...set];
}

async function assertTargetExists(ctx: Context, target: Target, targetId: string): Promise<string> {
  if (target === "ISSUE") {
    const i = await ctx.prisma.issue.findUnique({ where: { id: targetId }, select: { title: true } });
    if (!i) throw new Error("Issue not found");
    return i.title;
  }
  if (target === "APP_TEST") {
    const a = await ctx.prisma.appTest.findUnique({ where: { id: targetId }, select: { number: true } });
    if (!a) throw new Error("App test not found");
    return `APP-${a.number}`;
  }
  const u = await ctx.prisma.userTest.findUnique({ where: { id: targetId }, select: { number: true } });
  if (!u) throw new Error("User test not found");
  return `UT-${u.number}`;
}

export const commentResolvers = {
  Query: {
    async comments(_: unknown, args: { target: Target; targetId: string }, ctx: Context) {
      requireAuth(ctx);
      return ctx.prisma.comment.findMany({
        where: { target: args.target, targetId: args.targetId },
        orderBy: { createdAt: "asc" },
      });
    },
  },
  Mutation: {
    async addComment(_: unknown, args: { target: Target; targetId: string; body: string }, ctx: Context) {
      const userId = requireAuth(ctx);
      const body = args.body.trim();
      if (!body) throw new Error("Comment cannot be empty");
      const label = await assertTargetExists(ctx, args.target, args.targetId);
      const comment = await ctx.prisma.comment.create({
        data: { target: args.target, targetId: args.targetId, byId: userId, body },
      });
      const to = await recipients(ctx, args.target, args.targetId, userId);
      const issueId = args.target === "ISSUE" ? args.targetId : null;
      const appTestId = args.target === "APP_TEST" ? args.targetId : null;
      const userTestId = args.target === "USER_TEST" ? args.targetId : null;
      await Promise.all(to.map((uid) => notify(uid, "COMMENT", `New comment on: ${label}`, issueId, appTestId, userTestId)));
      return comment;
    },
    async updateComment(_: unknown, args: { id: string; body: string }, ctx: Context) {
      const userId = requireAuth(ctx);
      const body = args.body.trim();
      if (!body) throw new Error("Comment cannot be empty");
      const c = await ctx.prisma.comment.findUnique({ where: { id: args.id } });
      if (!c) throw new Error("Comment not found");
      if (c.byId !== userId) throw new Error("Forbidden: you can only edit your own comment");
      return ctx.prisma.comment.update({ where: { id: args.id }, data: { body } });
    },
    async deleteComment(_: unknown, args: { id: string }, ctx: Context) {
      const userId = requireAuth(ctx);
      const c = await ctx.prisma.comment.findUnique({ where: { id: args.id } });
      if (!c) throw new Error("Comment not found");
      const me = await ctx.prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
      if (c.byId !== userId && !isAdmin(me?.role)) throw new Error("Forbidden: you can only delete your own comment");
      await ctx.prisma.comment.delete({ where: { id: args.id } });
      return true;
    },
  },
  Comment: {
    createdAt: (c: any) => (typeof c.createdAt === "string" ? c.createdAt : c.createdAt.toISOString()),
    updatedAt: (c: any) => (typeof c.updatedAt === "string" ? c.updatedAt : c.updatedAt.toISOString()),
    by: (c: any, _: unknown, ctx: Context) => ctx.prisma.user.findUnique({ where: { id: c.byId } }),
  },
};
