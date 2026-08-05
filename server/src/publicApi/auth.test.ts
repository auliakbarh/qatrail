import { describe, it, expect } from "vitest";
import { hostOf, callerAllowed, clientUsable } from "./auth.js";

describe("hostOf", () => {
  it("extracts a lowercase hostname", () => {
    expect(hostOf("https://Portal.HPAM.id/path")).toBe("portal.hpam.id");
  });
  it("null for absent or unparseable values", () => {
    expect(hostOf(undefined)).toBeNull();
    expect(hostOf(null)).toBeNull();
    expect(hostOf("")).toBeNull();
    expect(hostOf("not a url")).toBeNull();
  });
});

describe("callerAllowed", () => {
  const empty = { allowedOrigins: [], allowedIps: [] };

  it("refuses a client with an empty allow-list (closed by default)", () => {
    expect(callerAllowed(empty, { host: "portal.hpam.id", ip: "10.0.0.5" })).toBe(false);
  });
  it("allows a listed host", () => {
    const c = { allowedOrigins: ["portal.hpam.id"], allowedIps: [] };
    expect(callerAllowed(c, { host: "portal.hpam.id", ip: null })).toBe(true);
  });
  it("host match is case-insensitive on both sides", () => {
    const c = { allowedOrigins: ["Portal.HPAM.id"], allowedIps: [] };
    expect(callerAllowed(c, { host: "portal.hpam.id", ip: null })).toBe(true);
  });
  it("allows a listed IP when no origin header was sent", () => {
    const c = { allowedOrigins: [], allowedIps: ["10.0.0.5"] };
    expect(callerAllowed(c, { host: null, ip: "10.0.0.5" })).toBe(true);
  });
  it("refuses an unlisted host even when the key is right", () => {
    const c = { allowedOrigins: ["portal.hpam.id"], allowedIps: [] };
    expect(callerAllowed(c, { host: "evil.example.com", ip: "10.0.0.5" })).toBe(false);
  });
  it("refuses an unlisted IP", () => {
    const c = { allowedOrigins: [], allowedIps: ["10.0.0.5"] };
    expect(callerAllowed(c, { host: null, ip: "10.0.0.9" })).toBe(false);
  });
  // OR, not AND: one trusted signal is enough. Origin is a caller-controlled
  // header, so it can only ever add access, never take it away — for a
  // server-to-server caller the IP entry is the load-bearing one.
  it("allows a listed IP even when the Origin header is foreign", () => {
    const c = { allowedOrigins: ["portal.hpam.id"], allowedIps: ["10.0.0.5"] };
    expect(callerAllowed(c, { host: "evil.example.com", ip: "10.0.0.5" })).toBe(true);
  });
  it("allows a listed host even when the IP is not listed", () => {
    const c = { allowedOrigins: ["portal.hpam.id"], allowedIps: ["10.0.0.5"] };
    expect(callerAllowed(c, { host: "portal.hpam.id", ip: "203.0.113.9" })).toBe(true);
  });
  it("refuses when neither signal matches", () => {
    const c = { allowedOrigins: ["portal.hpam.id"], allowedIps: ["10.0.0.5"] };
    expect(callerAllowed(c, { host: "evil.example.com", ip: "203.0.113.9" })).toBe(false);
  });
  it("does not treat a subnet as a match (exact IPs only)", () => {
    const c = { allowedOrigins: [], allowedIps: ["10.0.0.0"] };
    expect(callerAllowed(c, { host: null, ip: "10.0.0.5" })).toBe(false);
  });
});

describe("clientUsable", () => {
  const now = new Date("2026-08-05T00:00:00Z");
  it("usable when active and unexpiring", () => {
    expect(clientUsable({ active: true, expiresAt: null }, now)).toBe(true);
  });
  it("unusable when inactive", () => {
    expect(clientUsable({ active: false, expiresAt: null }, now)).toBe(false);
  });
  it("unusable at or past expiry", () => {
    expect(clientUsable({ active: true, expiresAt: now }, now)).toBe(false);
    expect(clientUsable({ active: true, expiresAt: new Date(now.getTime() - 1) }, now)).toBe(false);
  });
  it("usable before expiry", () => {
    expect(clientUsable({ active: true, expiresAt: new Date(now.getTime() + 60_000) }, now)).toBe(true);
  });
});
