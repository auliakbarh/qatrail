import { describe, it, expect } from "vitest";
import { generatePassword } from "./genPassword.js";
import { isStrongPassword } from "./passwordPolicy.js";

describe("generatePassword", () => {
  it("always produces a policy-compliant password", () => {
    for (let i = 0; i < 200; i++) {
      const pw = generatePassword();
      expect(pw.length).toBeGreaterThanOrEqual(9);
      expect(isStrongPassword(pw)).toBe(true);
    }
  });

  it("avoids ambiguous characters (0 O 1 l I)", () => {
    for (let i = 0; i < 200; i++) {
      expect(generatePassword()).not.toMatch(/[0O1lI]/);
    }
  });
});
