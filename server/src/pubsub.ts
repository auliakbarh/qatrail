import { PubSub } from "graphql-subscriptions";
import { RedisPubSub } from "graphql-redis-subscriptions";
import Redis from "ioredis";
import { logger } from "./logger.js";

// Redis-backed pubsub when REDIS_URL is set (subscriptions fan out across
// instances); in-memory PubSub otherwise (single process).
const url = process.env.REDIS_URL;

export const pubsub: any = url
  ? new RedisPubSub({
      publisher: new Redis(url, { maxRetriesPerRequest: null }),
      subscriber: new Redis(url, { maxRetriesPerRequest: null }),
    })
  : new PubSub();

if (url) logger.info("Redis pubsub enabled");

export const notificationTopic = (userId: string) => `NOTIFICATION:${userId}`;

export function publishNotification(userId: string, notification: unknown) {
  void pubsub.publish(notificationTopic(userId), { notificationAdded: notification });
}
