import { describe, it, expect } from "vitest";
import { classifyResolve, respondBreached, slaApplies, canMarkProductionIssue, resolveProductionFlag, type SlaTarget } from "./sla.js";

const targets: Record<string, SlaTarget> = {
  HIGH: { respondMins: 60, resolveMins: 240 },
  LOW: { respondMins: null, resolveMins: 4320 },
};
const now = new Date("2026-07-22T12:00:00Z");
const ago = (mins: number) => new Date(now.getTime() - mins * 60000);

describe("classifyResolve", () => {
  it("met when resolved within target", () => {
    expect(classifyResolve({ createdAt: ago(100), resolvedAt: ago(10), priority: "HIGH" }, targets, now)).toBe("met");
  });
  it("breached when resolved after target", () => {
    expect(classifyResolve({ createdAt: ago(500), resolvedAt: ago(10), priority: "HIGH" }, targets, now)).toBe("breached");
  });
  it("breached when open past target", () => {
    expect(classifyResolve({ createdAt: ago(300), resolvedAt: null, priority: "HIGH" }, targets, now)).toBe("breached");
  });
  it("atRisk when open past 80% of window", () => {
    // 240 target → 80% = 192; 200 mins elapsed
    expect(classifyResolve({ createdAt: ago(200), resolvedAt: null, priority: "HIGH" }, targets, now)).toBe("atRisk");
  });
  it("met when open and well within window", () => {
    expect(classifyResolve({ createdAt: ago(30), resolvedAt: null, priority: "HIGH" }, targets, now)).toBe("met");
  });
  it("met when no target for the priority", () => {
    expect(classifyResolve({ createdAt: ago(9999), resolvedAt: null, priority: "MEDIUM" }, targets, now)).toBe("met");
  });
});

describe("respondBreached", () => {
  it("true when past respond window and no response", () => {
    expect(respondBreached({ createdAt: ago(120), respondedAt: null, priority: "HIGH" }, targets, now)).toBe(true);
  });
  it("false once responded", () => {
    expect(respondBreached({ createdAt: ago(120), respondedAt: ago(30), priority: "HIGH" }, targets, now)).toBe(false);
  });
  it("false when priority has no respond target", () => {
    expect(respondBreached({ createdAt: ago(9999), respondedAt: null, priority: "LOW" }, targets, now)).toBe(false);
  });
});

describe("production-issue gate", () => {
  const prod = { environment: "PRODUCTION", isProductionIssue: true };
  it("SLA applies only when prod env AND flagged", () => {
    expect(slaApplies(prod)).toBe(true);
    expect(slaApplies({ environment: "PRODUCTION", isProductionIssue: false })).toBe(false);
    expect(slaApplies({ environment: "STAGING", isProductionIssue: true })).toBe(false);
  });
  it("markable only for unresolved prod issues outside an app test", () => {
    const base = { environment: "PRODUCTION", appTestId: null, resolvedAt: null };
    expect(canMarkProductionIssue(base)).toBe(true);
    expect(canMarkProductionIssue({ ...base, appTestId: "at1" })).toBe(false);
    expect(canMarkProductionIssue({ ...base, resolvedAt: now })).toBe(false);
    expect(canMarkProductionIssue({ ...base, environment: "STAGING" })).toBe(false);
  });
  it("stored flag forced false for app-test / non-prod, frozen after resolve", () => {
    const cur = { appTestId: null, resolvedAt: null, isProductionIssue: false };
    expect(resolveProductionFlag(prod, cur)).toBe(true);
    expect(resolveProductionFlag(prod, { ...cur, appTestId: "at1" })).toBe(false);
    expect(resolveProductionFlag({ environment: "STAGING", isProductionIssue: true }, cur)).toBe(false);
    // resolved: input ignored, current value stands (both directions)
    expect(resolveProductionFlag({ environment: "PRODUCTION", isProductionIssue: false }, { ...cur, resolvedAt: now, isProductionIssue: true })).toBe(true);
    expect(resolveProductionFlag(prod, { ...cur, resolvedAt: now })).toBe(false);
  });
});
