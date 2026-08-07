import { prisma } from "./db.js";
import { logger } from "./logger.js";
import { publishNotification } from "./pubsub.js";
import { approverRolesFor } from "./approval.js";

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
  sessionTestId?: string | null,
  testCaseId?: string | null,
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
        sessionTestId: sessionTestId ?? null,
        testCaseId: testCaseId ?? null,
      },
    });
    publishNotification(userId, {
      id: n.id,
      kind: n.kind,
      message: n.message,
      issueId: n.issueId,
      appTestId: n.appTestId,
      userTestId: n.userTestId,
      sessionTestId: n.sessionTestId,
      testCaseId: n.testCaseId,
      read: n.read,
      createdAt: n.createdAt.toISOString(),
    });
  } catch (e) {
    log.warn({ err: e, userId, kind }, "notify failed");
  }
}

export interface NotifyRefs {
  issueId?: string | null;
  appTestId?: string | null;
  userTestId?: string | null;
  sessionTestId?: string | null;
  testCaseId?: string | null;
}

// Fan a notification out to everyone watching a target (issue/app test/user test/session).
export async function notifyWatchers(
  target: "ISSUE" | "APP_TEST" | "USER_TEST" | "SESSION_TEST",
  targetId: string,
  kind: string,
  message: string,
  refs: NotifyRefs,
  exceptUserId?: string,
): Promise<void> {
  const ws = await prisma.watch.findMany({ where: { target, targetId }, select: { userId: true } });
  await Promise.all(
    ws
      .filter((w) => w.userId !== exceptUserId)
      .map((w) =>
        notify(w.userId, kind, message, refs.issueId ?? null, refs.appTestId ?? null, refs.userTestId ?? null, refs.sessionTestId ?? null, refs.testCaseId ?? null),
      ),
  );
}

// Fan a notification out to every active QA + admin (app-test lifecycle events),
// optionally excluding one user (usually the actor).
export async function notifyQaAdmins(
  kind: string,
  message: string,
  appTestId?: string,
  exceptUserId?: string,
  sessionTestId?: string,
): Promise<void> {
  const users = await prisma.user.findMany({
    where: { active: true, role: { in: ["QA", "QA_LEAD", "ADMIN", "SUPER_ADMIN"] } },
    select: { id: true },
  });
  await Promise.all(
    users
      .filter((u) => u.id !== exceptUserId)
      .map((u) => notify(u.id, kind, message, null, appTestId, null, sessionTestId)),
  );
}

// Fan a "needs approval" notification out to everyone who could approve a test
// case from this creator (approval.ts decides the floor), minus the creator.
export async function notifyTestCaseApprovers(
  creator: { id: string; role: string },
  kind: string,
  message: string,
  // Null for a bulk import: one notification stands for many cases, so it has
  // no single case to deep-link to.
  testCaseId: string | null,
): Promise<void> {
  const users = await prisma.user.findMany({
    where: { active: true, role: { in: approverRolesFor(creator.role) as any } },
    select: { id: true },
  });
  await Promise.all(
    users
      .filter((u) => u.id !== creator.id)
      .map((u) => notify(u.id, kind, message, null, null, null, null, testCaseId)),
  );
}

// Fan a notification out to every active admin (account/security events — QA has
// nothing to act on there, unlike notifyQaAdmins).
export async function notifyAdmins(kind: string, message: string): Promise<void> {
  const users = await prisma.user.findMany({
    where: { active: true, role: { in: ["ADMIN", "SUPER_ADMIN"] } },
    select: { id: true },
  });
  await Promise.all(users.map((u) => notify(u.id, kind, message)));
}

// Broadcast to every active user (e.g. a new user-test credential), except the actor.
export async function notifyAll(
  kind: string,
  message: string,
  refs: NotifyRefs = {},
  exceptUserId?: string,
): Promise<void> {
  const users = await prisma.user.findMany({ where: { active: true }, select: { id: true } });
  await Promise.all(
    users
      .filter((u) => u.id !== exceptUserId)
      .map((u) =>
        notify(u.id, kind, message, refs.issueId ?? null, refs.appTestId ?? null, refs.userTestId ?? null, refs.sessionTestId ?? null, refs.testCaseId ?? null),
      ),
  );
}
