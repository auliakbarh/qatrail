import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "./db.js";
import { appTestResolvers } from "./resolvers/appTest.js";

// A new build continues the SAME app test: assignments/records survive and a
// closed round reopens. Gated on RUN_DB_TESTS=1 like the other integration test.
//   RUN_DB_TESTS=1 npm test --workspace server
const enabled = process.env.RUN_DB_TESTS === "1";
const M = appTestResolvers.Mutation;
const TAG = "itest-build";

const ctxFor = (userId: string) => ({ prisma, userId, userName: "test" } as any);

describe.skipIf(!enabled)("app test builds (integration)", () => {
  let engId = "", qaId = "", projectId = "", tcId = "", appTestId = "";

  beforeAll(async () => {
    const eng = await prisma.user.create({ data: { email: `${TAG}-eng@test.local`, name: "Eng", role: "ENGINEER" } });
    const qa = await prisma.user.create({ data: { email: `${TAG}-qa@test.local`, name: "QA", role: "QA" } });
    engId = eng.id; qaId = qa.id;
    const project = await prisma.project.create({ data: { name: `${TAG}-proj`, createdById: qa.id } });
    projectId = project.id;
    const feature = await prisma.feature.create({ data: { projectId: project.id, name: `${TAG}-feat` } });
    const tc = await prisma.testCase.create({ data: { featureId: feature.id, name: `${TAG}-tc`, createdById: qa.id } });
    tcId = tc.id;
    const at = await M.createAppTest(
      null,
      {
        input: {
          projectId: project.id, environment: "STAGING", platform: "ANDROID", appVersion: "1.0.0",
          backendVersion: null, downloadLink: "https://example.test/v1.apk", note: "first", jiraTickets: [],
        },
      },
      ctxFor(eng.id),
    );
    appTestId = at.id;
  });

  afterAll(async () => {
    if (projectId) await prisma.project.delete({ where: { id: projectId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { email: { startsWith: TAG } } });
  });

  it("records build #1 on create", async () => {
    const builds = await prisma.appTestBuild.findMany({ where: { appTestId } });
    expect(builds).toHaveLength(1);
    expect(builds[0].downloadLink).toBe("https://example.test/v1.apk");
  });

  it("new build keeps assignments/records and reopens a closed round", async () => {
    await M.assignTestCases(null, { appTestId, testCaseIds: [tcId] }, ctxFor(qaId));
    await prisma.recordTest.create({
      data: { testCaseId: tcId, appTestId, executedById: qaId, executedAt: new Date(), result: "FAIL" },
    });
    const closed = await M.closeAppTestTesting(null, { appTestId }, ctxFor(qaId));
    expect(closed!.status).toBe("CLOSED");

    const after = await M.addAppTestBuild(
      null,
      { appTestId, input: { downloadLink: "https://example.test/v2.apk", appVersion: "1.0.1", note: "fixed" } },
      ctxFor(engId),
    );
    expect(after!.downloadLink).toBe("https://example.test/v2.apk");
    expect(after!.appVersion).toBe("1.0.1");
    expect(after!.closedAt).toBeNull();
    expect(after!.status).toBe("IN_TESTING"); // reopened, prior FAIL record still counted

    // History newest-first, assignment untouched (QA does not re-assign).
    const builds: any[] = await appTestResolvers.AppTest.builds({ id: appTestId }, null, ctxFor(engId));
    expect(builds.map((b) => b.downloadLink)).toEqual(["https://example.test/v2.apk", "https://example.test/v1.apk"]);
    expect(await prisma.appTestCase.count({ where: { appTestId } })).toBe(1);
    expect(await prisma.recordTest.count({ where: { appTestId } })).toBe(1);
  });

  it("editing the link also appends to the history", async () => {
    await M.updateAppTest(
      null,
      {
        id: appTestId,
        input: {
          projectId, environment: "STAGING", platform: "ANDROID", appVersion: "1.0.2",
          backendVersion: null, downloadLink: "https://example.test/v3.apk", note: null, jiraTickets: [],
        },
      },
      ctxFor(engId),
    );
    expect(await prisma.appTestBuild.count({ where: { appTestId } })).toBe(3);
  });
});
