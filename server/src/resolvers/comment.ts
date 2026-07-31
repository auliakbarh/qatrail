import type { Context } from "../context.js";
import { requireAuth } from "../context.js";
import { notify } from "../notify.js";

type Target = "ISSUE" | "APP_TEST" | "USER_TEST" | "SESSION_TEST" | "TEST_CASE";

const isAdmin = (role?: string) => role === "ADMIN" || role === "SUPER_ADMIN";

// Mentions are plain text: a body mentions a user when it contains "@" + their exact
// name (case-insensitive). ponytail: no mention table and no parser — the rendered
// text stays the source of truth, so an edit can add or drop a mention for free.
export function findMentions<T extends { name: string }>(users: T[], body: string): T[] {
  let rest = body.toLowerCase();
  const hits: T[] = [];
  // Longest name first, and each match is consumed, so "@Ana Lee" doesn't also ping "Ana".
  for (const u of [...users].sort((a, b) => b.name.length - a.name.length)) {
    const tag = `@${u.name.toLowerCase()}`;
    if (!rest.includes(tag)) continue;
    hits.push(u);
    rest = rest.split(tag).join(" ");
  }
  return hits;
}

async function mentionedIds(ctx: Context, body: string, exceptId: string): Promise<string[]> {
  const users = await ctx.prisma.user.findMany({ where: { active: true }, select: { id: true, name: true } });
  return findMentions(users, body)
    .filter((u) => u.id !== exceptId)
    .map((u) => u.id);
}

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
  } else if (target === "SESSION_TEST") {
    const st = await ctx.prisma.sessionTest.findUnique({ where: { id: targetId }, select: { createdById: true } });
    if (st) set.add(st.createdById);
  } else if (target === "TEST_CASE") {
    const tc = await ctx.prisma.testCase.findUnique({ where: { id: targetId }, select: { createdById: true, reviewedById: true } });
    if (tc) {
      set.add(tc.createdById);
      if (tc.reviewedById) set.add(tc.reviewedById);
    }
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
  if (target === "SESSION_TEST") {
    const s = await ctx.prisma.sessionTest.findUnique({ where: { id: targetId }, select: { number: true } });
    if (!s) throw new Error("Session test not found");
    return `ST-${s.number}`;
  }
  if (target === "TEST_CASE") {
    const tc = await ctx.prisma.testCase.findUnique({ where: { id: targetId }, select: { number: true } });
    if (!tc) throw new Error("Test case not found");
    return `TC-${tc.number}`;
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
      const mentioned = await mentionedIds(ctx, body, userId);
      const to = (await recipients(ctx, args.target, args.targetId, userId)).filter((id) => !mentioned.includes(id));
      const issueId = args.target === "ISSUE" ? args.targetId : null;
      const appTestId = args.target === "APP_TEST" ? args.targetId : null;
      const userTestId = args.target === "USER_TEST" ? args.targetId : null;
      const sessionTestId = args.target === "SESSION_TEST" ? args.targetId : null;
      const testCaseId = args.target === "TEST_CASE" ? args.targetId : null;
      await Promise.all([
        ...to.map((uid) => notify(uid, "COMMENT", `New comment on: ${label}`, issueId, appTestId, userTestId, sessionTestId, testCaseId)),
        ...mentioned.map((uid) => notify(uid, "MENTION", `You were mentioned on: ${label}`, issueId, appTestId, userTestId, sessionTestId, testCaseId)),
      ]);
      return comment;
    },
    async updateComment(_: unknown, args: { id: string; body: string }, ctx: Context) {
      const userId = requireAuth(ctx);
      const body = args.body.trim();
      if (!body) throw new Error("Comment cannot be empty");
      const c = await ctx.prisma.comment.findUnique({ where: { id: args.id } });
      if (!c) throw new Error("Comment not found");
      if (c.byId !== userId) throw new Error("Forbidden: you can only edit your own comment");
      const updated = await ctx.prisma.comment.update({ where: { id: args.id }, data: { body } });
      // Editing in a new @name still notifies; names already mentioned don't fire twice.
      const before = await mentionedIds(ctx, c.body, userId);
      const added = (await mentionedIds(ctx, body, userId)).filter((id) => !before.includes(id));
      if (added.length) {
        const target = c.target as Target;
        const label = await assertTargetExists(ctx, target, c.targetId);
        const ref = (t: Target) => (target === t ? c.targetId : null);
        await Promise.all(
          added.map((uid) =>
            notify(uid, "MENTION", `You were mentioned on: ${label}`, ref("ISSUE"), ref("APP_TEST"), ref("USER_TEST"), ref("SESSION_TEST"), ref("TEST_CASE")),
          ),
        );
      }
      return updated;
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
