import { describe, it, expect } from "vitest";
import { resolvers } from "./index.js";

// A domain file can export a type resolver map (AppTest, AppTestBuild, …) and
// forget to wire it into index.ts. GraphQL then falls back to default resolvers,
// a non-null field like `createdBy` resolves to null, and the whole parent object
// comes back null ("App test not found"). Cheap guard: every type map exported by
// a domain file must be merged here.
const ROOT = new Set(["Query", "Mutation", "Subscription"]);
const mods = import.meta.glob("./*.ts", { eager: true }) as Record<string, Record<string, unknown>>;

describe("resolver merge", () => {
  it("merges every type resolver map exported by a domain file", () => {
    const missing: string[] = [];
    for (const [path, mod] of Object.entries(mods)) {
      if (path.endsWith("/index.ts") || path.endsWith(".test.ts")) continue;
      for (const exported of Object.values(mod)) {
        if (!exported || typeof exported !== "object") continue;
        for (const type of Object.keys(exported)) {
          if (!/^[A-Z]/.test(type) || ROOT.has(type)) continue;
          if (!(type in resolvers)) missing.push(`${type} (${path})`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});
