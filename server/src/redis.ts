import Redis from "ioredis";
import { logger } from "./logger.js";

// Redis is optional: set REDIS_URL to enable cross-instance pubsub + rate-limit.
// Without it the app runs single-process with in-memory equivalents.
const url = process.env.REDIS_URL;

export const redisEnabled = !!url;

let client: Redis | null = null;

export function getRedis(): Redis | null {
  if (!url) return null;
  if (!client) {
    client = new Redis(url, { maxRetriesPerRequest: null, lazyConnect: false });
    client.on("error", (err) => logger.error({ err }, "redis error"));
    logger.info("Redis enabled");
  }
  return client;
}
