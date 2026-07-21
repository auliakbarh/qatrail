// In-memory failed-login throttle. Per key (email): after MAX_FAILS failures
// within WINDOW_MS, lock for LOCK_MS. Successful login resets.
// ponytail: single-process only; move to Redis if scaled horizontally.

const MAX_FAILS = 5;
const WINDOW_MS = 5 * 60_000;
const LOCK_MS = 10 * 60_000;

interface Entry {
  fails: number;
  first: number;
  lockedUntil: number;
}

const store = new Map<string, Entry>();
const now = () => Date.now();

export function assertNotLocked(key: string): void {
  const e = store.get(key);
  if (e && e.lockedUntil > now()) {
    const mins = Math.ceil((e.lockedUntil - now()) / 60_000);
    throw new Error(`Too many failed attempts. Try again in ${mins} minute(s).`);
  }
}

export function recordFailure(key: string): void {
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

export function recordSuccess(key: string): void {
  store.delete(key);
}
