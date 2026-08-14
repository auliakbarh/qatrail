import { describe, it, expect } from "vitest";
import { userTestResolvers } from "./resolvers/userTest.js";

const ROW = { id: "ut1", createdById: "owner", number: 3 };

// Minimal fake context: the two lookups the gate makes, plus the writes it should
// only reach once the gate lets it through.
function ctx(userId: string, role: string) {
  const calls: string[] = [];
  return {
    calls,
    ctx: {
      userId,
      role,
      prisma: {
        user: { findUnique: async () => ({ id: userId, role }) },
        userTest: {
          findUnique: async () => ROW,
          update: async () => (calls.push("update"), ROW),
          delete: async () => (calls.push("delete"), ROW),
          create: async () => (calls.push("create"), ROW),
        },
        watch: { deleteMany: async () => ({}) },
        comment: { deleteMany: async () => ({}) },
      },
    } as any,
  };
}

const input = { projectId: "p1", account: "qa@test", password: null, environment: "STAGING" as const, note: null };
const m = userTestResolvers.Mutation as any;

describe("userTest write gate", () => {
  it("refuses an ENGINEER on all three mutations", async () => {
    const { ctx: c } = ctx("eng", "ENGINEER");
    await expect(m.createUserTest(null, { input }, c)).rejects.toThrow(/QA only/);
    await expect(m.updateUserTest(null, { id: "ut1", input }, c)).rejects.toThrow(/QA only/);
    await expect(m.deleteUserTest(null, { id: "ut1" }, c)).rejects.toThrow(/QA only/);
  });

  it("refuses a QA who is not the creator", async () => {
    const { ctx: c, calls } = ctx("other", "QA");
    await expect(m.updateUserTest(null, { id: "ut1", input }, c)).rejects.toThrow(/creator/);
    await expect(m.deleteUserTest(null, { id: "ut1" }, c)).rejects.toThrow(/creator/);
    expect(calls).toEqual([]);
  });

  it("lets the creator through", async () => {
    const { ctx: c, calls } = ctx("owner", "QA");
    await m.updateUserTest(null, { id: "ut1", input }, c);
    await m.deleteUserTest(null, { id: "ut1" }, c);
    expect(calls).toEqual(["update", "delete"]);
  });

  it("lets an admin through on someone else's row", async () => {
    const { ctx: c, calls } = ctx("boss", "ADMIN");
    await m.updateUserTest(null, { id: "ut1", input }, c);
    expect(calls).toEqual(["update"]);
  });
});
