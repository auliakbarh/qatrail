import { prisma } from "./db.js";
import { appTestCoverage } from "./coverage.js";

export type AppTestStatus = "OPEN" | "ASSIGNED" | "IN_TESTING" | "PASSED" | "CLOSED";

// Pure status derivation (unit-testable, no DB). Ordering:
//   closed              -> CLOSED
//   no assigned cases   -> OPEN
//   coverage 100%       -> PASSED
//   any record/issue    -> IN_TESTING
//   else                -> ASSIGNED
export function deriveStatus(s: {
  closed: boolean;
  assignedCount: number;
  coveragePercent: number;
  activity: number;
}): AppTestStatus {
  if (s.closed) return "CLOSED";
  if (s.assignedCount === 0) return "OPEN";
  if (s.coveragePercent === 100) return "PASSED";
  return s.activity > 0 ? "IN_TESTING" : "ASSIGNED";
}

// Derive + persist an app test's status. Single source of truth — called after
// any change that can move it (assign/unassign, record, issue create/close/delete,
// close-testing).
export async function recomputeAppTest(appTestId: string): Promise<void> {
  const at = await prisma.appTest.findUnique({ where: { id: appTestId } });
  if (!at) return;

  const assignedCount = at.closedAt ? 0 : await prisma.appTestCase.count({ where: { appTestId } });
  const coveragePercent = !at.closedAt && assignedCount > 0 ? (await appTestCoverage(appTestId)).percent : 0;
  const activity =
    !at.closedAt && assignedCount > 0 && coveragePercent !== 100
      ? (await prisma.recordTest.count({ where: { appTestId } })) + (await prisma.issue.count({ where: { appTestId } }))
      : 0;

  const status = deriveStatus({ closed: !!at.closedAt, assignedCount, coveragePercent, activity });

  // Stamp passedAt on first entry into PASSED; clear on regression out of it.
  const passedAt = status === "PASSED" ? (at.passedAt ?? new Date()) : null;
  if (at.status !== status || at.passedAt?.getTime() !== passedAt?.getTime()) {
    await prisma.appTest.update({ where: { id: appTestId }, data: { status, passedAt } });
  }
}
