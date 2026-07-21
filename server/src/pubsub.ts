import { PubSub } from "graphql-subscriptions";

// In-memory pub/sub for GraphQL subscriptions (single process).
// ponytail: in-memory; add a Redis backend if you scale to multiple instances.
export const pubsub: any = new PubSub();

export const notificationTopic = (userId: string) => `NOTIFICATION:${userId}`;

export function publishNotification(userId: string, notification: unknown) {
  void pubsub.publish(notificationTopic(userId), { notificationAdded: notification });
}
