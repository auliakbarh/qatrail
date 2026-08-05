import { describe, it, expect } from "vitest";
import { generateKey, hashKey, hashesEqual, parseKey, formatKey } from "./keys.js";

describe("generateKey / hashKey", () => {
  it("generates distinct prefixed keys", () => {
    const a = generateKey();
    const b = generateKey();
    expect(a).not.toBe(b);
    expect(a.startsWith("qat_")).toBe(true);
  });
  it("hashes to stable 64-char hex", () => {
    const raw = generateKey();
    expect(hashKey(raw)).toBe(hashKey(raw));
    expect(hashKey(raw)).toMatch(/^[0-9a-f]{64}$/);
  });
  it("different keys hash differently", () => {
    expect(hashKey(generateKey())).not.toBe(hashKey(generateKey()));
  });
});

describe("hashesEqual", () => {
  it("true for identical digests", () => {
    const h = hashKey("x");
    expect(hashesEqual(h, h)).toBe(true);
  });
  it("false for different digests of equal length", () => {
    expect(hashesEqual(hashKey("x"), hashKey("y"))).toBe(false);
  });
  it("false — not throw — on unequal length", () => {
    expect(hashesEqual(hashKey("x"), "abc")).toBe(false);
  });
});

describe("parseKey", () => {
  it("parses human keys per kind", () => {
    expect(parseKey("APP", "APP-12")).toEqual({ kind: "APP", number: 12 });
    expect(parseKey("ST", "ST-4")).toEqual({ kind: "ST", number: 4 });
    expect(parseKey("ISSUE", "ISSUE-88")).toEqual({ kind: "ISSUE", number: 88 });
  });
  it("is case-insensitive and trims", () => {
    expect(parseKey("APP", "  app-12 ")).toEqual({ kind: "APP", number: 12 });
  });
  it("rejects the wrong prefix for the kind", () => {
    expect(parseKey("APP", "ST-4")).toBeNull();
    expect(parseKey("ISSUE", "APP-12")).toBeNull();
  });
  it("rejects zero, negative and non-numeric suffixes", () => {
    expect(parseKey("APP", "APP-0")).toBeNull();
    expect(parseKey("APP", "APP--1")).toBeNull();
    expect(parseKey("APP", "APP-x")).toBeNull();
    expect(parseKey("APP", "APP-")).toBeNull();
  });
  it("accepts a cuid", () => {
    const id = "clz1abcdefghijklmnopqrst";
    expect(parseKey("APP", id)).toEqual({ kind: "APP", id });
  });
  it("rejects empty and junk", () => {
    expect(parseKey("APP", "")).toBeNull();
    expect(parseKey("APP", "   ")).toBeNull();
    expect(parseKey("APP", "'; drop table users; --")).toBeNull();
  });
});

describe("formatKey", () => {
  it("round-trips with parseKey", () => {
    expect(parseKey("ST", formatKey("ST", 7))).toEqual({ kind: "ST", number: 7 });
  });
});
