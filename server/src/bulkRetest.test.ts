import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "./db.js";
import { workflowResolvers } from "./resolvers/workflow.js";
import { appTestResolvers } from "./resolvers/appTest.js";

// DB-backed, gated like the other integration tests:
//   RUN_DB_TESTS=1 npm test --workspace server
const enabled = process.env.RUN_DB_TESTS === "1";
const M = workflowResolvers.Mutation;
const TAG = "itest-bulkretest";
const ctxFor = (userId: string, role: string) => ({ prisma, userId, role, userName: "test" }) as any;

describe.skipIf(!enabled)("bulkRetest (integration)", () => {
  let qaId = "", engId = "", appTestId = "", featureId = "";

  const testCase = async (name: string) => {
    const tc = await prisma.testCase.create({
      data: { featureId, name: `${TAG}-${name}`, createdById: qaId, approval: "APPROVED" },
    });
    return tc.id;
  };

  // An issue parked exactly where a retest picks it up.
  const needReview = async (opts: { testCaseId: string; appTest?: boolean; status?: any }) =>
    prisma.issue.create({
      data: {
        testCaseId: opts.testCaseId,
        type: "DEFECT",
        title: `${TAG}-issue`,
        description: "d",
        environment: "STAGING",
        platform: "ANDROID",
        testAccount: "acc",
        testedAt: new Date(),
        steps: "s",
        actualResult: "a",
        expectedResult: "e",
        priority: "MEDIUM",
        status: opts.status ?? "NEED_REVIEW",
        reporterId: qaId,
        assigneeId: engId,
        appTestId: opts.appTest ? appTestId : null,
      },
    });

  beforeAll(async () => {
    const qa = await prisma.user.create({ data: { email: `${TAG}-qa@test.local`, name: "QA", role: "QA" } });
    const eng = await prisma.user.create({ data: { email: `${TAG}-eng@test.local`, name: "Eng", role: "ENGINEER" } });
    qaId = qa.id; engId = eng.id;
    const project = await prisma.project.create({ data: { name: `${TAG}-proj`, createdById: qa.id } });
    const feature = await prisma.feature.create({ data: { projectId: project.id, name: `${TAG}-feat` } });
    featureId = feature.id;
    const at = await appTestResolvers.Mutation.createAppTest(
      null,
      {
        input: {
          projectId: project.id, environment: "STAGING", platform: "ANDROID", appVersion: "1.0.0",
          backendVersion: null, downloadLink: "https://example.test/a.apk", note: null, jiraTickets: [],
        },
      },
      ctxFor(engId, "ENGINEER"),
    );
    appTestId = at.id;
  });

  afterAll(async () => {
    await prisma.project.deleteMany({ where: { name: { startsWith: TAG } } });
    const users = await prisma.user.findMany({ where: { email: { startsWith: TAG } }, select: { id: true } });
    const ids = users.map((u) => u.id);
    await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  });

  const retest = (inputs: any[]) =>
    M.bulkRetest(null, { executedAt: new Date().toISOString(), inputs }, ctxFor(qaId, "QA"));

  it("PASS closes, FAIL reopens, BLOCKED leaves the issue alone — one record each", async () => {
    const [a, b, c] = await Promise.all([
      needReview({ testCaseId: await testCase("pass") }),
      needReview({ testCaseId: await testCase("fail") }),
      needReview({ testCaseId: await testCase("blocked") }),
    ]);

    const res = await retest([
      { issueId: a.id, result: "PASS", note: null, attachments: [] },
      { issueId: b.id, result: "FAIL", note: "still broken", attachments: [] },
      { issueId: c.id, result: "BLOCKED", note: "env down", attachments: [] },
    ]);
    expect(res).toEqual({ retested: 3, skipped: 0 });

    const after = await prisma.issue.findMany({ where: { id: { in: [a.id, b.id, c.id] } }, select: { id: true, status: true } });
    const status = Object.fromEntries(after.map((i) => [i.id, i.status]));
    expect(status[a.id]).toBe("CLOSED");
    expect(status[b.id]).toBe("REOPENED");
    expect(status[c.id]).toBe("NEED_REVIEW");

    // A verdict leaves a trail; a blocked run has nothing to say about the issue.
    expect(await prisma.statusEvent.count({ where: { issueId: a.id, toVal: "CLOSED" } })).toBe(1);
    expect(await prisma.statusEvent.count({ where: { issueId: c.id } })).toBe(0);

    for (const i of [a, b, c]) {
      const recs = await prisma.recordTest.findMany({ where: { retestIssueId: i.id } });
      expect(recs).toHaveLength(1);
    }
  });

  it("the record inherits the issue's own scope, so app test progress keeps moving", async () => {
    const issue = await needReview({ testCaseId: await testCase("scoped"), appTest: true });

    await retest([{ issueId: issue.id, result: "PASS", note: null, attachments: [] }]);

    const rec = await prisma.recordTest.findFirst({ where: { retestIssueId: issue.id } });
    expect(rec?.appTestId).toBe(appTestId);
    expect(rec?.sessionTestId).toBeNull();
  });

  it("counts what it cannot do instead of failing the batch", async () => {
    const ok = await needReview({ testCaseId: await testCase("mixed-ok") });
    const wrongStatus = await needReview({ testCaseId: await testCase("mixed-open"), status: "IN_PROGRESS" });

    const res = await retest([
      { issueId: ok.id, result: "PASS", note: null, attachments: [] },
      { issueId: wrongStatus.id, result: "PASS", note: null, attachments: [] },
      { issueId: "does-not-exist", result: "PASS", note: null, attachments: [] },
    ]);
    expect(res).toEqual({ retested: 1, skipped: 2 });
    // The good row still went through.
    expect((await prisma.issue.findUnique({ where: { id: ok.id } }))?.status).toBe("CLOSED");
    expect(await prisma.recordTest.count({ where: { retestIssueId: wrongStatus.id } })).toBe(0);
  });

  it("refuses the QA's own bad input before writing anything", async () => {
    const issue = await needReview({ testCaseId: await testCase("noblocker") });

    await expect(
      retest([{ issueId: issue.id, result: "BLOCKED", note: "  ", attachments: [] }]),
    ).rejects.toThrow(/what blocked/);
    expect(await prisma.recordTest.count({ where: { retestIssueId: issue.id } })).toBe(0);

    await expect(retest([])).rejects.toThrow(/at least one/);
  });
});
