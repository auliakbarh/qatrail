import { prisma } from "./db.js";
import { publishNotification } from "./pubsub.js";

// Create a notification row and push it live to the recipient's subscription.
// Fire-and-forget from resolvers — a failed push must not break the mutation.
export async function notify(
  userId: string,
  kind: string,
  message: string,
  issueId?: string,
): Promise<void> {
  const n = await prisma.notification.create({
    data: { userId, kind, message, issueId: issueId ?? null },
  });
  publishNotification(userId, {
    id: n.id,
    kind: n.kind,
    message: n.message,
    issueId: n.issueId,
    read: n.read,
    createdAt: n.createdAt.toISOString(),
  });
}
