import { describe, it, expect, vi } from "vitest";

// The DB row and the token are the two inputs of the context builder, so both are
// stubbed and the test asserts what the builder makes of them. `auth.js` is
// mocked as well to keep env.js (which snapshots process.env) out of the way.
let row: { sessionId: string | null; role: string; active: boolean } | null = null;
vi.mock("./db.js", () => ({
  prisma: { user: { findUnique: async () => row } },
}));
vi.mock("./auth.js", () => ({
  verifyToken: (t: string) => (t === "bad" ? null : { userId: "u1", name: "Aulia", sid: "s1" }),
}));

const { contextFromAuthHeader, requireAuth } = await import("./context.js");

describe("account state on every request", () => {
  it("builds a normal context for an active account", async () => {
    row = { sessionId: "s1", role: "QA", active: true };
    const ctx = await contextFromAuthHeader("Bearer ok");
    expect(ctx.userId).toBe("u1");
    expect(ctx.role).toBe("QA");
    expect(requireAuth(ctx)).toBe("u1");
  });

  it("refuses a deactivated account even with a valid token", async () => {
    row = { sessionId: "s1", role: "QA", active: false };
    const ctx = await contextFromAuthHeader("Bearer ok");
    expect(ctx.userId).toBeNull();
    expect(ctx.accountDisabled).toBe(true);
    // Its own code: the client must not offer a sign-in that would be refused.
    expect(() => requireAuth(ctx)).toThrowError(
      expect.objectContaining({ extensions: { code: "ACCOUNT_DISABLED" } }),
    );
  });

  it("still reports a superseded session, and does not confuse it with a disabled one", async () => {
    row = { sessionId: "s2", role: "QA", active: true };
    const ctx = await contextFromAuthHeader("Bearer ok");
    expect(ctx.sessionSuperseded).toBe(true);
    expect(ctx.accountDisabled).toBeUndefined();
    expect(() => requireAuth(ctx)).toThrowError(
      expect.objectContaining({ extensions: { code: "SESSION_SUPERSEDED" } }),
    );
  });
});
