// Auth for the read-only public API: hashed key + appId + origin/IP allow-list.
// Deliberately separate from context.ts — that path is a browser JWT with a
// single active session, which a server-to-server key does not fit.
import type { Request, Response, NextFunction } from "express";
import { prisma } from "../db.js";
import { logger } from "../logger.js";
import { assertWithinRate } from "../rateLimit.js";
import { hashKey, hashesEqual } from "./keys.js";

export const RATE_MAX = 60;
export const RATE_WINDOW_MS = 60_000;

export interface PublicApiCaller {
  clientId: string;
  appId: string;
}

// Set by requirePublicApiKey for downstream handlers.
export interface PublicApiRequest extends Request {
  publicApiCaller?: PublicApiCaller;
}

export class PublicApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Hostname of an Origin/Referer header. Null when absent or unparseable. */
export function hostOf(value?: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Allow-list check. Closed by default: a client with no origins and no IPs
 * cannot be used at all, so an unfinished setup fails shut instead of open.
 * A request passes when either its host or its IP is listed.
 */
export function callerAllowed(
  client: { allowedOrigins: string[]; allowedIps: string[] },
  caller: { host: string | null; ip: string | null },
): boolean {
  const origins = client.allowedOrigins.map((o) => o.toLowerCase());
  const ips = client.allowedIps;
  if (origins.length === 0 && ips.length === 0) return false;
  if (caller.host && origins.includes(caller.host)) return true;
  if (caller.ip && ips.includes(caller.ip)) return true;
  return false;
}

/**
 * Client IP. `req.ip` already honours Express `trust proxy`, so the deployment
 * must set it (nginx) — otherwise every caller looks like the proxy.
 * ponytail: exact IPs only, no CIDR matching. Add a range matcher when a
 * caller actually arrives from a subnet rather than a fixed address.
 */
export function callerIp(req: Request): string | null {
  const raw = req.ip ?? req.socket?.remoteAddress ?? null;
  if (!raw) return null;
  // Normalise IPv4-mapped IPv6 (::ffff:10.0.0.5 → 10.0.0.5).
  return raw.startsWith("::ffff:") ? raw.slice(7) : raw;
}

/** True when the client row itself is unusable (disabled or past expiry). */
export function clientUsable(client: { active: boolean; expiresAt: Date | null }, now = new Date()): boolean {
  if (!client.active) return false;
  if (client.expiresAt && client.expiresAt.getTime() <= now.getTime()) return false;
  return true;
}

/**
 * Express middleware. Order matters: identify the key first, then the caller's
 * origin, then the rate limit — a rejected key must not consume someone else's
 * budget, and the budget is keyed per client, not per IP.
 */
export async function requirePublicApiKey(req: PublicApiRequest, _res: Response, next: NextFunction): Promise<void> {
  try {
    const rawKey = req.header("x-api-key");
    const appId = req.header("x-app-id");
    if (!rawKey || !appId) throw new PublicApiError(401, "UNAUTHORIZED", "Missing X-Api-Key or X-App-Id");

    const client = await prisma.publicApiClient.findUnique({ where: { appId } });
    // Same message for every failure mode below: a caller must not learn
    // whether the appId exists, only that the pair is wrong.
    const unauthorized = new PublicApiError(401, "UNAUTHORIZED", "Invalid API credentials");
    if (!client) throw unauthorized;
    if (!hashesEqual(client.keyHash, hashKey(rawKey))) throw unauthorized;
    if (!clientUsable(client)) throw unauthorized;

    const host = hostOf(req.header("origin") ?? req.header("referer"));
    const ip = callerIp(req);
    if (!callerAllowed(client, { host, ip })) {
      logger.warn({ appId, host, ip }, "public API: caller not in allow-list");
      throw new PublicApiError(403, "FORBIDDEN_ORIGIN", "Caller origin or IP is not allowed for this client");
    }

    try {
      await assertWithinRate(`publicApi:${client.id}`, RATE_MAX, RATE_WINDOW_MS);
    } catch (err) {
      throw new PublicApiError(429, "RATE_LIMITED", (err as Error).message);
    }

    req.publicApiCaller = { clientId: client.id, appId: client.appId };
    // Fire-and-forget: a dead key is easier to spot with lastUsedAt, but this
    // must never delay or fail the response.
    void prisma.publicApiClient
      .update({ where: { id: client.id }, data: { lastUsedAt: new Date() } })
      .catch((err) => logger.debug({ err }, "public API: lastUsedAt update failed"));

    next();
  } catch (err) {
    next(err);
  }
}
