import { describe, it, expect } from "vitest";
import { canReadTestSecret } from "./context.js";
import { encryptSecret } from "./crypto.js";
import { env } from "./env.js";
import { issueResolvers } from "./resolvers/issue.js";
import { userTestResolvers } from "./resolvers/userTest.js";

const ctx = (role: string | null) => ({ role }) as any;
const stored = encryptSecret("s3cr3t-pass", env.secretEncKey);

// Both fields decrypt on read, so both have to ask the same question. The test
// runs the real resolvers, not the helper alone — a resolver that forgets to call
// it is the failure mode worth catching.
describe("who may read a stored test credential", () => {
  const read = {
    "Issue.testPassword": (role: string | null) =>
      (issueResolvers.Issue as any).testPassword({ testPassword: stored }, null, ctx(role)),
    "UserTest.password": (role: string | null) =>
      (userTestResolvers.UserTest as any).password({ password: stored }, null, ctx(role)),
  };

  for (const [field, get] of Object.entries(read)) {
    it(`${field}: hides the credential from a VIEWER and from anonymous`, () => {
      expect(get("VIEWER")).toBeNull();
      expect(get(null)).toBeNull();
    });

    it(`${field}: gives it to every role that acts on a test`, () => {
      for (const role of ["ENGINEER", "QA", "QA_LEAD", "ADMIN", "SUPER_ADMIN"]) {
        expect(get(role), role).toBe("s3cr3t-pass");
      }
    });
  }

  it("says the same thing as the helper", () => {
    expect(canReadTestSecret("VIEWER")).toBe(false);
    expect(canReadTestSecret(null)).toBe(false);
    expect(canReadTestSecret("ENGINEER")).toBe(true);
  });
});
