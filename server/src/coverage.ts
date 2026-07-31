import { prisma } from "./db.js";

// A test case is "passed" when its most recent RecordTest result is PASS AND it
// has no open issue (any issue not CLOSED and not archived). An unresolved issue
// keeps the case from counting as passed even if the latest run was green. A
// BLOCKED run is not a verdict, so it never counts as passed either.
// pass% = passed test cases / total test cases (0 when there are none).

export interface Coverage {
  total: number;
  passed: number;
  percent: number; // 0..100, integer
}

function pct(passed: number, total: number): number {
  return total === 0 ? 0 : Math.round((passed / total) * 100);
}

// Records/issues belonging to one testing context. Passing a scope narrows
// coverage to that context's own runs and findings.
export type CoverageScope = { appTestId?: string; sessionTestId?: string };

// Coverage for a set of test case ids — two batched queries regardless of N:
//   1. all records for these test cases, newest first → latest result per case;
//   2. grouped count of open issues per case.
// With a scope, only records/issues of that app test / session count — this
// yields per-app-test or per-session coverage over its assigned cases.
async function coverageForTestCases(testCaseIds: string[], scope: CoverageScope = {}): Promise<Coverage> {
  const total = testCaseIds.length;
  if (total === 0) return { total: 0, passed: 0, percent: 0 };

  const records = await prisma.recordTest.findMany({
    where: { testCaseId: { in: testCaseIds }, ...scope },
    orderBy: { executedAt: "desc" },
    select: { testCaseId: true, result: true },
  });
  const latest = new Map<string, string>();
  for (const r of records) if (!latest.has(r.testCaseId)) latest.set(r.testCaseId, r.result);

  const openGroups = await prisma.issue.groupBy({
    by: ["testCaseId"],
    where: { testCaseId: { in: testCaseIds }, archived: false, status: { not: "CLOSED" }, ...scope },
    _count: { _all: true },
  });
  const hasOpenIssue = new Set(openGroups.map((g) => g.testCaseId));

  let passed = 0;
  for (const id of testCaseIds) {
    if (latest.get(id) === "PASS" && !hasOpenIssue.has(id)) passed += 1;
  }
  return { total, passed, percent: pct(passed, total) };
}

// Short TTL cache. featureCoverage/projectCoverage are each called twice per
// entity per request (coverage + ready field resolvers) and once per list row;
// caching by scope dedupes those. Stale by at most CACHE_MS — the client already
// refetches (cache-and-network), so this is safe.
const CACHE_MS = 10_000;
const cache = new Map<string, { at: number; val: Coverage }>();
async function cached(key: string, fn: () => Promise<Coverage>): Promise<Coverage> {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.at < CACHE_MS) return hit.val;
  const val = await fn();
  cache.set(key, { at: now, val });
  return val;
}

// Catalogue coverage counts APPROVED + active cases only: one awaiting review
// isn't agreed content yet (so adding cases can't drag a project's pass% down),
// and a retired one is no longer part of what gets tested.
export async function featureCoverage(featureId: string): Promise<Coverage> {
  return cached(`f:${featureId}`, async () => {
    const tcs = await prisma.testCase.findMany({ where: { featureId, approval: "APPROVED", active: true }, select: { id: true } });
    return coverageForTestCases(tcs.map((t) => t.id));
  });
}

export async function projectCoverage(projectId: string): Promise<Coverage> {
  return cached(`p:${projectId}`, async () => {
    const tcs = await prisma.testCase.findMany({
      where: { feature: { projectId }, approval: "APPROVED", active: true },
      select: { id: true },
    });
    return coverageForTestCases(tcs.map((t) => t.id));
  });
}

export async function allCoverage(): Promise<Coverage> {
  return cached("all", async () => {
    const tcs = await prisma.testCase.findMany({ where: { approval: "APPROVED", active: true }, select: { id: true } });
    return coverageForTestCases(tcs.map((t) => t.id));
  });
}

// Coverage over the cases assigned to an app test, scoped to that app test's
// own records/issues. Not cached — recomputed on demand (also drives status).
// Deliberately NOT filtered on approval: an assignment was reviewed when it was
// made, and dropping it here would silently move a signed-off app test's
// progress. Only new assignments/records/issues are gated.
export async function appTestCoverage(appTestId: string): Promise<Coverage> {
  const rows = await prisma.appTestCase.findMany({ where: { appTestId }, select: { testCaseId: true } });
  return coverageForTestCases(rows.map((r) => r.testCaseId), { appTestId });
}

// Same idea for a testing session: only the session's own runs/findings count,
// so a case passed in an earlier cycle still has to be re-run in this one.
// Unfiltered on approval for the same reason as appTestCoverage.
export async function sessionTestCoverage(sessionTestId: string): Promise<Coverage> {
  const rows = await prisma.sessionTestCase.findMany({ where: { sessionTestId }, select: { testCaseId: true } });
  return coverageForTestCases(rows.map((r) => r.testCaseId), { sessionTestId });
}
