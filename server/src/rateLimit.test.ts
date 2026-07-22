import { describe, it, expect } from "vitest";
import { assertNotLocked, recordFailure, recordSuccess, assertWithinRate } from "./rateLimit.js";

// No REDIS_URL in tests → exercises the in-memory fallback path.

describe("login throttle (in-memory)", () => {
  it("locks after 5 failures and clears on success", async () => {
    const key = "user-a@test";
    await expect(assertNotLocked(key)).resolves.toBeUndefined();
    for (let i = 0; i < 5; i++) await recordFailure(key);
    await expect(assertNotLocked(key)).rejects.toThrow(/Too many failed/);
    await recordSuccess(key);
    await expect(assertNotLocked(key)).resolves.toBeUndefined();
  });

  it("does not lock below the threshold", async () => {
    const key = "user-b@test";
    for (let i = 0; i < 4; i++) await recordFailure(key);
    await expect(assertNotLocked(key)).resolves.toBeUndefined();
  });
});

describe("sliding-window rate limit (in-memory)", () => {
  it("throws once the max within the window is exceeded", async () => {
    const key = "forgot:user-c@test";
    for (let i = 0; i < 3; i++) await assertWithinRate(key, 3, 60_000);
    await expect(assertWithinRate(key, 3, 60_000)).rejects.toThrow(/Rate limit/);
  });
});
