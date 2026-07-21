import { prisma } from "./db.js";

// SLA applies to PRODUCTION issues only (per requirement). Targets are
// admin-editable rows keyed by priority (minutes). respondMins may be null.

export interface SlaTarget {
  respondMins: number | null;
  resolveMins: number;
}

export async function slaTargets(): Promise<Record<string, SlaTarget>> {
  const rows = await prisma.slaTarget.findMany();
  const map: Record<string, SlaTarget> = {};
  for (const r of rows) map[r.priority] = { respondMins: r.respondMins, resolveMins: r.resolveMins };
  return map;
}

// Short-lived cache so per-issue slaStatus resolvers don't hit the DB N times.
let _cache: Record<string, SlaTarget> | null = null;
let _cachedAt = 0;
export async function cachedSlaTargets(): Promise<Record<string, SlaTarget>> {
  const now = Date.now();
  if (_cache && now - _cachedAt < 10_000) return _cache;
  _cache = await slaTargets();
  _cachedAt = now;
  return _cache;
}

const mins = (a: Date, b: Date) => (a.getTime() - b.getTime()) / 60000;

export type SlaBucket = "met" | "atRisk" | "breached";

// Classify one production issue against its resolve target.
// - resolved: met if within target, else breached.
// - open: breached if past target, atRisk if >80% elapsed, else met (on track).
export function classifyResolve(
  issue: { createdAt: Date; resolvedAt: Date | null; priority: string },
  targets: Record<string, SlaTarget>,
  now: Date,
): SlaBucket {
  const t = targets[issue.priority];
  if (!t) return "met";
  const elapsed = mins(issue.resolvedAt ?? now, issue.createdAt);
  if (issue.resolvedAt) return elapsed <= t.resolveMins ? "met" : "breached";
  if (elapsed > t.resolveMins) return "breached";
  if (elapsed > 0.8 * t.resolveMins) return "atRisk";
  return "met";
}

// Respond-clock breach: production issue with a respondMins target, no
// respondedAt yet, past the respond window.
export function respondBreached(
  issue: { createdAt: Date; respondedAt: Date | null; priority: string },
  targets: Record<string, SlaTarget>,
  now: Date,
): boolean {
  const t = targets[issue.priority];
  if (!t || t.respondMins == null || issue.respondedAt) return false;
  return mins(now, issue.createdAt) > t.respondMins;
}
