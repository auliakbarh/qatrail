import { prisma } from "./db.js";
import { appTestCoverage } from "./coverage.js";
import { testReviewRequired } from "./approval.js";

export type AppTestStatus = "OPEN" | "ASSIGNED" | "IN_TESTING" | "IN_REVIEW" | "PASSED" | "CLOSED";
export type TestReviewState = "IN_REVIEW" | "CHANGES_REQUESTED" | "APPROVED" | null;

// Pure status derivation (unit-testable, no DB). Ordering:
//   closed              -> CLOSED
//   waiting on a peer   -> IN_REVIEW
//   no assigned cases   -> OPEN
//   coverage 100%       -> PASSED
//   any record/issue    -> IN_TESTING
//   else                -> ASSIGNED
//
// With peer review on (reviewRequired), full coverage is not enough: PASSED
// needs another QA's approval, so an unsubmitted or sent-back app test stays
// IN_TESTING however green it is. A submitted one reads IN_REVIEW until the
// reviewer decides, even if a late FAIL lands meanwhile — the review is what
// the reviewer is looking at, and their decision is what moves it on.
// reviewState is only ever read when reviewRequired, so switching the setting
// off releases every app test that was waiting, with no data to clean up.
export function deriveStatus(s: {
  closed: boolean;
  assignedCount: number;
  coveragePercent: number;
  activity: number;
  reviewRequired?: boolean;
  reviewState?: TestReviewState;
}): AppTestStatus {
  if (s.closed) return "CLOSED";
  if (s.reviewRequired && s.reviewState === "IN_REVIEW") return "IN_REVIEW";
  if (s.assignedCount === 0) return "OPEN";
  if (s.coveragePercent === 100) {
    if (!s.reviewRequired || s.reviewState === "APPROVED") return "PASSED";
    return "IN_TESTING";
  }
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

  const status = deriveStatus({
    closed: !!at.closedAt,
    assignedCount,
    coveragePercent,
    activity,
    reviewRequired: await testReviewRequired(),
    reviewState: at.reviewState as TestReviewState,
  });

  // Stamp passedAt on first entry into PASSED; clear on regression out of it.
  const passedAt = status === "PASSED" ? (at.passedAt ?? new Date()) : null;
  if (at.status !== status || at.passedAt?.getTime() !== passedAt?.getTime()) {
    await prisma.appTest.update({ where: { id: appTestId }, data: { status, passedAt } });
  }
}
