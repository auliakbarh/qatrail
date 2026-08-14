import { describe, it, expect } from "vitest";
import { typeDefs } from "./schema.js";
import { NOTIFIABLE, UNLOGGED } from "./discord.js";
import { resolvers } from "./resolvers/index.js";

// Every mutation is either audited (in LABELS, hence NOTIFIABLE) or listed as
// deliberately unlogged, with the reason written next to the list. There is no
// third state: a new mutation that nobody classified fails here, which is the
// only thing that keeps "every action that changes state gets an audit row" true
// a year from now.
const mutationFields = (): string[] => {
  const block = typeDefs.slice(typeDefs.indexOf("type Mutation {"));
  const body = block.slice(0, block.indexOf("\n  }"));
  return [...body.matchAll(/^\s+([a-zA-Z][a-zA-Z0-9]*)\s*[(:]/gm)].map((m) => m[1]);
};

describe("audit coverage", () => {
  const fields = mutationFields();

  it("reads the schema it is guarding", () => {
    expect(fields.length).toBeGreaterThan(50);
    expect(fields).toContain("createIssue");
  });

  it("classifies every mutation as audited or deliberately unlogged", () => {
    const unclassified = fields.filter((f) => !NOTIFIABLE.has(f) && !UNLOGGED.has(f));
    expect(unclassified, `add these to LABELS in discord.ts, or to UNLOGGED with a reason: ${unclassified.join(", ")}`)
      .toEqual([]);
  });

  it("keeps both lists pointing at mutations that exist", () => {
    const stale = [...NOTIFIABLE, ...UNLOGGED].filter((f) => !fields.includes(f));
    expect(stale, `no such mutation: ${stale.join(", ")}`).toEqual([]);
    for (const f of UNLOGGED) expect(NOTIFIABLE.has(f), f).toBe(false);
  });

  it("only names fields the Mutation map actually resolves", () => {
    const missing = fields.filter((f) => typeof (resolvers.Mutation as any)[f] !== "function");
    expect(missing, `declared in the schema but not resolved: ${missing.join(", ")}`).toEqual([]);
  });
});
