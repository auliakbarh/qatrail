import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "./db.js";
import { workflowResolvers } from "./resolvers/workflow.js";

// Full issue lifecycle against a real DB. Gated on RUN_DB_TESTS=1 so the
// default unit run (and CI without Postgres) skips it.
//   RUN_DB_TESTS=1 npm test --workspace server
const enabled = process.env.RUN_DB_TESTS === "1";
const M = workflowResolvers.Mutation;
const TAG = "itest-lifecycle";

const ctxFor = (userId: string) => ({ prisma, userId, userName: "test" } as any);

describe.skipIf(!enabled)("issue lifecycle (integration)", () => {
  let qaId = "", engId = "", issueId = "", projectId = "";

  beforeAll(async () => {
    const qa = await prisma.user.create({ data: { email: `${TAG}-qa@test.local`, name: "QA", role: "QA" } });
    const eng = await prisma.user.create({ data: { email: `${TAG}-eng@test.local`, name: "Eng", role: "ENGINEER" } });
    qaId = qa.id; engId = eng.id;
    const project = await prisma.project.create({ data: { name: `${TAG}-proj`, createdById: qa.id } });
    projectId = project.id;
    const feature = await prisma.feature.create({ data: { projectId: project.id, name: `${TAG}-feat` } });
    const tc = await prisma.testCase.create({ data: { featureId: feature.id, name: `${TAG}-tc`, createdById: qa.id } });
    const rec = await prisma.recordTest.create({
      data: { testCaseId: tc.id, executedById: qa.id, executedAt: new Date(), result: "FAIL" },
    });
    const issue = await prisma.issue.create({
      data: {
        testCaseId: tc.id, recordTestId: rec.id, type: "BUG", title: `${TAG}-issue`, description: "d",
        environment: "PRODUCTION", platform: "WEB", testAccount: "acct", testedAt: new Date(),
        steps: "s", actualResult: "a", expectedResult: "e", priority: "HIGH",
        reporterId: qa.id, assigneeId: eng.id,
      },
    });
    issueId = issue.id;
  });

  afterAll(async () => {
    if (projectId) await prisma.project.delete({ where: { id: projectId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { email: { startsWith: TAG } } });
  });

  it("OPEN → accept → solve → review-pass → CLOSED", async () => {
    const accepted = await M.issueAccept(null, { id: issueId }, ctxFor(engId));
    expect(accepted.status).toBe("IN_PROGRESS");

    const solved = await M.issueSolve(
      null,
      { id: issueId, postmortem: { rootCause: "rc", resolution: "fix" } },
      ctxFor(engId),
    );
    expect(solved.status).toBe("NEED_REVIEW");
    expect(solved.resolvedAt).toBeTruthy();

    const closed = await M.issueReview(null, { id: issueId, pass: true }, ctxFor(qaId));
    expect(closed.status).toBe("CLOSED");
    expect(closed.closedAt).toBeTruthy();

    // Engineer cannot act after close.
    await expect(M.issueAccept(null, { id: issueId }, ctxFor(engId))).rejects.toThrow(/Cannot accept/);
  });

  it("review-fail reopens for the engineer", async () => {
    // Drive a fresh issue to NEED_REVIEW then reject.
    const tc = await prisma.testCase.findFirst({ where: { name: `${TAG}-tc` } });
    const issue = await prisma.issue.create({
      data: {
        testCaseId: tc!.id, type: "DEFECT", title: `${TAG}-issue2`, description: "d", environment: "STAGING",
        platform: "WEB", testAccount: "acct", testedAt: new Date(), steps: "s", actualResult: "a",
        expectedResult: "e", priority: "LOW", reporterId: qaId, assigneeId: engId,
      },
    });
    await M.issueAccept(null, { id: issue.id }, ctxFor(engId));
    await M.issueSolve(null, { id: issue.id, postmortem: { rootCause: "rc", resolution: "fix" } }, ctxFor(engId));
    const reopened = await M.issueReview(null, { id: issue.id, pass: false, note: "still broken" }, ctxFor(qaId));
    expect(reopened.status).toBe("REOPENED");
    // Un-resolved again, or the SLA sweep (resolvedAt: null) never looks at it.
    expect(reopened.resolvedAt).toBeNull();
  });

  it("QA claims the fix: NEED_REVIEW → IN_REVIEW → CLOSED", async () => {
    const tc = await prisma.testCase.findFirst({ where: { name: `${TAG}-tc` } });
    const issue = await prisma.issue.create({
      data: {
        testCaseId: tc!.id, type: "DEFECT", title: `${TAG}-issue3`, description: "d", environment: "STAGING",
        platform: "WEB", testAccount: "acct", testedAt: new Date(), steps: "s", actualResult: "a",
        expectedResult: "e", priority: "LOW", reporterId: qaId, assigneeId: engId,
      },
    });
    await M.issueAccept(null, { id: issue.id }, ctxFor(engId));
    await M.issueSolve(null, { id: issue.id, postmortem: { rootCause: "rc", resolution: "fix" } }, ctxFor(engId));

    const claimed = await M.issueStartReview(null, { id: issue.id }, ctxFor(qaId));
    expect(claimed.status).toBe("IN_REVIEW");
    // Claiming twice is not a queue — only NEED_REVIEW can be picked up.
    await expect(M.issueStartReview(null, { id: issue.id }, ctxFor(qaId))).rejects.toThrow(/NEED_REVIEW/);
    // The verdict still lands from IN_REVIEW, not just from NEED_REVIEW.
    const closed = await M.issueReview(null, { id: issue.id, pass: true }, ctxFor(qaId));
    expect(closed.status).toBe("CLOSED");
  });
});
