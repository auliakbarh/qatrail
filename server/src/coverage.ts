import { prisma } from "./db.js";

// A test case is "passed" when its most recent RecordTest result is PASS.
// pass% = passed test cases / total test cases (0 when there are none).
// ponytail: recomputed per query with a small N+1; add caching only if the
// dashboard gets slow on large projects.

export interface Coverage {
  total: number;
  passed: number;
  percent: number; // 0..100, integer
}

function pct(passed: number, total: number): number {
  return total === 0 ? 0 : Math.round((passed / total) * 100);
}

// Coverage for a set of test case ids.
async function coverageForTestCases(testCaseIds: string[]): Promise<Coverage> {
  const total = testCaseIds.length;
  if (total === 0) return { total: 0, passed: 0, percent: 0 };
  let passed = 0;
  for (const id of testCaseIds) {
    const latest = await prisma.recordTest.findFirst({
      where: { testCaseId: id },
      orderBy: { executedAt: "desc" },
      select: { result: true },
    });
    if (latest?.result === "PASS") passed += 1;
  }
  return { total, passed, percent: pct(passed, total) };
}

export async function featureCoverage(featureId: string): Promise<Coverage> {
  const tcs = await prisma.testCase.findMany({ where: { featureId }, select: { id: true } });
  return coverageForTestCases(tcs.map((t) => t.id));
}

export async function projectCoverage(projectId: string): Promise<Coverage> {
  const tcs = await prisma.testCase.findMany({
    where: { feature: { projectId } },
    select: { id: true },
  });
  return coverageForTestCases(tcs.map((t) => t.id));
}
