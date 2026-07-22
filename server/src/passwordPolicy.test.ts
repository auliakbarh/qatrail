import { describe, it, expect } from "vitest";
import { unmetPasswordRules, isStrongPassword } from "./passwordPolicy.js";

describe("passwordPolicy", () => {
  it("flags every unmet rule for a weak password", () => {
    expect(unmetPasswordRules("abc").sort()).toEqual(["length", "number", "symbol", "upper"].sort());
  });

  it("accepts a compliant password", () => {
    expect(isStrongPassword("H3nan4sset!")).toBe(true);
    expect(unmetPasswordRules("H3nan4sset!")).toEqual([]);
  });

  it("rejects when any single class is missing", () => {
    expect(isStrongPassword("alllowercase1!")).toBe(false); // no upper
    expect(isStrongPassword("ALLUPPER1!")).toBe(false); // no lower
    expect(isStrongPassword("NoNumber!!")).toBe(false); // no digit
    expect(isStrongPassword("NoSymbol123")).toBe(false); // no symbol
    expect(isStrongPassword("Ab1!")).toBe(false); // too short
  });
});
