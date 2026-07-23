import { prisma } from "./db.js";

// A test case is "passed" when its most recent RecordTest result is PASS AND it
// has no open issue (any issue not CLOSED and not archived). An unresolved issue
// keeps the case from counting as passed even if the latest run was green.
// pass% = passed test cases / total test cases (0 when there are none).

export interface Coverage {
  total: number;
  passed: number;
  percent: number; // 0..100, integer
}

function pct(passed: number, total: number): number {
  return total === 0 ? 0 : Math.round((passed / total) * 100);
}

// Coverage for a set of test case ids — two batched queries regardless of N:
//   1. all records for these test cases, newest first → latest result per case;
//   2. grouped count of open issues per case.
// When appTestId is given, only records/issues scoped to that app test count —
// this yields per-app-test coverage over its assigned cases.
async function coverageForTestCases(testCaseIds: string[], appTestId?: string): Promise<Coverage> {
  const total = testCaseIds.length;
  if (total === 0) return { total: 0, passed: 0, percent: 0 };

  const scope = appTestId ? { appTestId } : {};
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

export async function featureCoverage(featureId: string): Promise<Coverage> {
  return cached(`f:${featureId}`, async () => {
    const tcs = await prisma.testCase.findMany({ where: { featureId }, select: { id: true } });
    return coverageForTestCases(tcs.map((t) => t.id));
  });
}

export async function projectCoverage(projectId: string): Promise<Coverage> {
  return cached(`p:${projectId}`, async () => {
    const tcs = await prisma.testCase.findMany({ where: { feature: { projectId } }, select: { id: true } });
    return coverageForTestCases(tcs.map((t) => t.id));
  });
}

export async function allCoverage(): Promise<Coverage> {
  return cached("all", async () => {
    const tcs = await prisma.testCase.findMany({ select: { id: true } });
    return coverageForTestCases(tcs.map((t) => t.id));
  });
}

// Coverage over the cases assigned to an app test, scoped to that app test's
// own records/issues. Not cached — recomputed on demand (also drives status).
export async function appTestCoverage(appTestId: string): Promise<Coverage> {
  const rows = await prisma.appTestCase.findMany({ where: { appTestId }, select: { testCaseId: true } });
  return coverageForTestCases(rows.map((r) => r.testCaseId), appTestId);
}
