import { describe, it, expect } from "vitest";
import { readOnlyGuard } from "./context.js";
import { resolvers } from "./resolvers/index.js";

const ctx = (role: string) => ({ role }) as any;

describe("viewer read-only gate", () => {
  it("denies a non-allowlisted mutation to a VIEWER and passes everyone else", () => {
    const m = readOnlyGuard({ createProject: () => "ran", changePassword: () => "ran" });
    expect(() => m.createProject(null, {}, ctx("VIEWER"), null)).toThrow(/read-only/);
    expect(m.changePassword(null, {}, ctx("VIEWER"), null)).toBe("ran");
    expect(m.createProject(null, {}, ctx("QA"), null)).toBe("ran");
  });

  it("keeps the real Mutation map wrapped", () => {
    // Fails if someone unwraps resolvers/index.ts — the gate lives in one place.
    const denied = ["createProject", "createIssue", "addComment", "setWatch", "createUserTest", "createUser", "createSessionTest"];
    for (const field of denied) {
      expect(() => (resolvers.Mutation as any)[field](null, {}, ctx("VIEWER"), null), field).toThrow(/read-only/);
    }
  });
});
