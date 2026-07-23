import { prisma } from "./db.js";
import { publishNotification } from "./pubsub.js";

// Create a notification row and push it live to the recipient's subscription.
// Fire-and-forget from resolvers — a failed push must not break the mutation.
export async function notify(
  userId: string,
  kind: string,
  message: string,
  issueId?: string | null,
  appTestId?: string | null,
): Promise<void> {
  const n = await prisma.notification.create({
    data: {
      userId,
      kind,
      message,
      issueId: issueId ?? null,
      appTestId: appTestId ?? null,
    },
  });
  publishNotification(userId, {
    id: n.id,
    kind: n.kind,
    message: n.message,
    issueId: n.issueId,
    appTestId: n.appTestId,
    read: n.read,
    createdAt: n.createdAt.toISOString(),
  });
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
