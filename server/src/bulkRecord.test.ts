import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "./db.js";
import { assertBlockerNoted, recordResolvers } from "./resolvers/record.js";
import { appTestResolvers } from "./resolvers/appTest.js";

describe("assertBlockerNoted", () => {
  it("refuses a BLOCKED run with no blocker written down", () => {
    expect(() => assertBlockerNoted("BLOCKED", null)).toThrow(/what blocked/);
    expect(() => assertBlockerNoted("BLOCKED", "   ")).toThrow(/what blocked/);
  });
  it("lets a BLOCKED run through once the blocker is named, and never questions the others", () => {
    expect(() => assertBlockerNoted("BLOCKED", "backend down")).not.toThrow();
    expect(() => assertBlockerNoted("PASS", null)).not.toThrow();
    expect(() => assertBlockerNoted("FAIL", null)).not.toThrow();
  });
});

// DB-backed, gated like the other integration tests:
//   RUN_DB_TESTS=1 npm test --workspace server
const enabled = process.env.RUN_DB_TESTS === "1";
const M = recordResolvers.Mutation;
const TAG = "itest-bulkrec";
const ctxFor = (userId: string, role: string) => ({ prisma, userId, role, userName: "test" }) as any;

describe.skipIf(!enabled)("createRecordTests (integration)", () => {
  let qaId = "", engId = "", appTestId = "", tcIds: string[] = [], pendingTcId = "";

  beforeAll(async () => {
    const qa = await prisma.user.create({ data: { email: `${TAG}-qa@test.local`, name: "QA", role: "QA" } });
    const eng = await prisma.user.create({ data: { email: `${TAG}-eng@test.local`, name: "Eng", role: "ENGINEER" } });
    qaId = qa.id; engId = eng.id;
    const project = await prisma.project.create({ data: { name: `${TAG}-proj`, createdById: qa.id } });
    const feature = await prisma.feature.create({ data: { projectId: project.id, name: `${TAG}-feat` } });
    for (const n of [1, 2, 3]) {
      const tc = await prisma.testCase.create({
        data: { featureId: feature.id, name: `${TAG}-tc${n}`, createdById: qa.id, approval: "APPROVED" },
      });
      tcIds.push(tc.id);
    }
    const pending = await prisma.testCase.create({
      data: { featureId: feature.id, name: `${TAG}-tc-pending`, createdById: qa.id, approval: "PENDING" },
    });
    pendingTcId = pending.id;
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
    await appTestResolvers.Mutation.assignTestCases(null, { appTestId, testCaseIds: tcIds }, ctxFor(qaId, "QA"));
  });

  afterAll(async () => {
    await prisma.project.deleteMany({ where: { name: { startsWith: TAG } } });
    const users = await prisma.user.findMany({ where: { email: { startsWith: TAG } }, select: { id: true } });
    const ids = users.map((u) => u.id);
    await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  });

  const run = (inputs: any[]) =>
    M.createRecordTests(null, { executedAt: new Date().toISOString(), appTestId, sessionTestId: null, inputs }, ctxFor(qaId, "QA"));

  it("writes one record per row, all carrying the batch's app test, and moves the app test's status", async () => {
    const before = await prisma.appTest.findUnique({ where: { id: appTestId } });
    expect(before?.status).toBe("ASSIGNED");

    const recs = await run([
      { testCaseId: tcIds[0], result: "PASS", note: null, attachments: [] },
      { testCaseId: tcIds[1], result: "BLOCKED", note: "staging down", attachments: [] },
    ]);

    expect(recs).toHaveLength(2);
    expect(recs.every((r: any) => r.appTestId === appTestId)).toBe(true);
    expect(recs.every((r: any) => r.sessionTestId === null)).toBe(true);
    // Recompute ran for the batch: a run happened, so the app test is in testing.
    const after = await prisma.appTest.findUnique({ where: { id: appTestId } });
    expect(after?.status).toBe("IN_TESTING");
  });

  it("writes nothing at all when one row is bad", async () => {
    const count = () => prisma.recordTest.count({ where: { appTestId } });
    const before = await count();

    // BLOCKED without a blocker: the good row next to it must not land either.
    await expect(
      run([
        { testCaseId: tcIds[2], result: "PASS", note: null, attachments: [] },
        { testCaseId: tcIds[0], result: "BLOCKED", note: "  ", attachments: [] },
      ]),
    ).rejects.toThrow(/what blocked/);
    expect(await count()).toBe(before);

    // A case nobody approved yet closes the whole batch too.
    await expect(
      run([
        { testCaseId: tcIds[2], result: "PASS", note: null, attachments: [] },
        { testCaseId: pendingTcId, result: "PASS", note: null, attachments: [] },
      ]),
    ).rejects.toThrow(/waiting for approval/);
    expect(await count()).toBe(before);
  });

  it("refuses an empty batch", async () => {
    await expect(run([])).rejects.toThrow(/at least one/);
  });
});
