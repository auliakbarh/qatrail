import { prisma } from "./db.js";
import { logger } from "./logger.js";
import { publishNotification } from "./pubsub.js";

const log = logger.child({ mod: "notify" });

// Create a notification row and push it live to the recipient's subscription.
// Fire-and-forget from resolvers — a failed push must not break the mutation, so
// this swallows (e.g. the recipient was deleted between lookup and insert: FK error).
export async function notify(
  userId: string,
  kind: string,
  message: string,
  issueId?: string | null,
  appTestId?: string | null,
  userTestId?: string | null,
): Promise<void> {
  try {
    const n = await prisma.notification.create({
      data: {
        userId,
        kind,
        message,
        issueId: issueId ?? null,
        appTestId: appTestId ?? null,
        userTestId: userTestId ?? null,
      },
    });
    publishNotification(userId, {
      id: n.id,
      kind: n.kind,
      message: n.message,
      issueId: n.issueId,
      appTestId: n.appTestId,
      userTestId: n.userTestId,
      read: n.read,
      createdAt: n.createdAt.toISOString(),
    });
  } catch (e) {
    log.warn({ err: e, userId, kind }, "notify failed");
  }
}

// Fan a notification out to everyone watching a target (issue/app test/user test).
export async function notifyWatchers(
  target: "ISSUE" | "APP_TEST" | "USER_TEST",
  targetId: string,
  kind: string,
  message: string,
  refs: { issueId?: string | null; appTestId?: string | null; userTestId?: string | null },
  exceptUserId?: string,
): Promise<void> {
  const ws = await prisma.watch.findMany({ where: { target, targetId }, select: { userId: true } });
  await Promise.all(
    ws
      .filter((w) => w.userId !== exceptUserId)
      .map((w) => notify(w.userId, kind, message, refs.issueId ?? null, refs.appTestId ?? null, refs.userTestId ?? null)),
  );
}

// Fan a notification out to every active QA + admin (app-test lifecycle events),
// optionally excluding one user (usually the actor).
export async function notifyQaAdmins(
  kind: string,
  message: string,
  appTestId?: string,
  exceptUserId?: string,
): Promise<void> {
  const users = await prisma.user.findMany({
    where: { active: true, role: { in: ["QA", "ADMIN", "SUPER_ADMIN"] } },
    select: { id: true },
  });
  await Promise.all(
    users
      .filter((u) => u.id !== exceptUserId)
      .map((u) => notify(u.id, kind, message, null, appTestId)),
  );
}

// Broadcast to every active user (e.g. a new user-test credential), except the actor.
export async function notifyAll(
  kind: string,
  message: string,
  refs: { issueId?: string | null; appTestId?: string | null; userTestId?: string | null } = {},
  exceptUserId?: string,
): Promise<void> {
  const users = await prisma.user.findMany({ where: { active: true }, select: { id: true } });
  await Promise.all(
    users
      .filter((u) => u.id !== exceptUserId)
      .map((u) => notify(u.id, kind, message, refs.issueId ?? null, refs.appTestId ?? null, refs.userTestId ?? null)),
  );
}
