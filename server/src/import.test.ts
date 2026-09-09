import { describe, it, expect } from "vitest";
import { validateImport, normalizeKind, label, featureCategories } from "./resolvers/testcase.js";

const step = (s: string) => ({ step: s, expectedResult: null });

describe("normalizeKind", () => {
  it("blank -> null, canonical case-insensitive, else INVALID", () => {
    expect(normalizeKind("")).toBe(null);
    expect(normalizeKind(null)).toBe(null);
    expect(normalizeKind("positive")).toBe("POSITIVE");
    expect(normalizeKind(" Negative ")).toBe("NEGATIVE");
    expect(normalizeKind("maybe")).toBe("INVALID");
  });
});

describe("validateImport", () => {
  const feat = new Set<string>(["login"]); // existing feature (lowercased)

  it("feature scope: accepts valid rows, counts steps", () => {
    const r = validateImport(
      [{ name: "TC A", kind: "POSITIVE", steps: [step("a"), step("b")] }, { name: "TC B", kind: "", steps: [] }],
      { projectScope: false, existingFeatures: feat },
    );
    expect(r.ok).toBe(true);
    expect(r.testCaseCount).toBe(2);
    expect(r.stepCount).toBe(2);
    expect(r.newFeatures).toEqual([]);
  });

  it("flags empty name and invalid kind with row numbers", () => {
    const r = validateImport(
      [{ name: "  ", kind: "POSITIVE", steps: [] }, { name: "ok", kind: "bogus", steps: [] }],
      { projectScope: false, existingFeatures: feat },
    );
    expect(r.ok).toBe(false);
    expect(r.errors).toEqual([
      { row: 1, message: "Name is required" },
      { row: 2, message: 'Invalid Kind "bogus" (use POSITIVE, NEGATIVE, or blank)' },
    ]);
  });

  it("project scope: feature required, new features detected (dedup + case-insensitive)", () => {
    const r = validateImport(
      [
        { feature: "Login", name: "a", steps: [] }, // exists -> not new
        { feature: "Signup", name: "b", steps: [] }, // new
        { feature: "signup", name: "c", steps: [] }, // same new, deduped
        { feature: "", name: "d", steps: [] }, // missing feature
      ],
      { projectScope: true, existingFeatures: feat },
    );
    expect(r.ok).toBe(false);
    expect(r.errors).toEqual([{ row: 4, message: "Feature is required at project scope" }]);
    expect(r.newFeatures).toEqual(["Signup"]);
  });
});

describe("label", () => {
  it("blank and whitespace collapse to null so a group can't split in two", () => {
    expect(label("UI")).toBe("UI");
    expect(label("  Cashback  ")).toBe("Cashback");
    expect(label("   ")).toBe(null);
    expect(label("")).toBe(null);
    expect(label(null)).toBe(null);
    expect(label(undefined)).toBe(null);
  });
});

describe("featureCategories", () => {
  const row = (feature: string | null, category?: string | null) => ({
    feature,
    category,
    name: "TC",
    steps: [],
  });

  it("first row naming a feature decides its category", () => {
    const m = featureCategories([row("Login", "UI"), row("Login", "API"), row("Payment", " API ")]);
    expect(m.get("login")).toBe("UI");
    expect(m.get("payment")).toBe("API");
  });

  it("blank category means unfiled, and a blank feature is not a key", () => {
    const m = featureCategories([row("Login", "  "), row("", "UI"), row(null, "UI")]);
    expect(m.get("login")).toBe(null);
    expect(m.has("")).toBe(false);
    expect(m.size).toBe(1);
  });
});
