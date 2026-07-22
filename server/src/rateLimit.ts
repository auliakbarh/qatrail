// Failed-login throttle + sliding-window rate limit. Redis-backed when
// REDIS_URL is set (shared across instances); in-memory Map otherwise.
import { getRedis } from "./redis.js";

const MAX_FAILS = 5;
const WINDOW_MS = 5 * 60_000;
const LOCK_MS = 10 * 60_000;

const now = () => Date.now();

// ---- in-memory fallback ----
interface Entry {
  fails: number;
  first: number;
  lockedUntil: number;
}
const store = new Map<string, Entry>();
const rateStore = new Map<string, number[]>();

export async function assertNotLocked(key: string): Promise<void> {
  const r = getRedis();
  if (r) {
    const ttl = await r.pttl(`lock:${key}`);
    if (ttl > 0) throw new Error(`Too many failed attempts. Try again in ${Math.ceil(ttl / 60_000)} minute(s).`);
    return;
  }
  const e = store.get(key);
  if (e && e.lockedUntil > now()) {
    const mins = Math.ceil((e.lockedUntil - now()) / 60_000);
    throw new Error(`Too many failed attempts. Try again in ${mins} minute(s).`);
  }
}

export async function recordFailure(key: string): Promise<void> {
  const r = getRedis();
  if (r) {
    const k = `fails:${key}`;
    const n = await r.incr(k);
    if (n === 1) await r.pexpire(k, WINDOW_MS);
    if (n >= MAX_FAILS) {
      await r.set(`lock:${key}`, "1", "PX", LOCK_MS);
      await r.del(k);
    }
    return;
  }
  const t = now();
  let e = store.get(key);
  if (!e || t - e.first > WINDOW_MS) e = { fails: 0, first: t, lockedUntil: 0 };
  e.fails += 1;
  if (e.fails >= MAX_FAILS) {
    e.lockedUntil = t + LOCK_MS;
    e.fails = 0;
    e.first = t;
  }
  store.set(key, e);
}

export async function recordSuccess(key: string): Promise<void> {
  const r = getRedis();
  if (r) {
    await r.del(`fails:${key}`, `lock:${key}`);
    return;
  }
  store.delete(key);
}

export async function assertWithinRate(key: string, max: number, windowMs: number): Promise<void> {
  const r = getRedis();
  if (r) {
    const k = `rate:${key}`;
    const n = await r.incr(k);
    if (n === 1) await r.pexpire(k, windowMs);
    if (n > max) {
      const ttl = await r.pttl(k);
      throw new Error(`Rate limit exceeded — try again in ${Math.ceil(ttl / 1000)}s.`);
    }
    return;
  }
  const t = now();
  const hits = (rateStore.get(key) ?? []).filter((ts) => t - ts < windowMs);
  if (hits.length >= max) {
    const retry = Math.ceil((windowMs - (t - hits[0])) / 1000);
    throw new Error(`Rate limit exceeded — try again in ${retry}s.`);
  }
  hits.push(t);
  rateStore.set(key, hits);
}
