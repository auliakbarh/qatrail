import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "./db.js";
import { deriveSessionStatus, sessionTestResolvers } from "./resolvers/sessionTest.js";
import { appTestResolvers } from "./resolvers/appTest.js";
import { recordResolvers } from "./resolvers/record.js";
import { canMarkProductionIssue, resolveProductionFlag } from "./sla.js";
import { sessionTestCoverage } from "./coverage.js";

describe("deriveSessionStatus", () => {
  const base = { closed: false, caseCount: 3, coveragePercent: 0, minPassPercent: 90, activity: 0 };
  it("CLOSED wins regardless of other state", () => {
    expect(deriveSessionStatus({ ...base, closed: true, coveragePercent: 100 })).toBe("CLOSED");
  });
  it("OPEN with no test case, even after the target was met vacuously", () => {
    expect(deriveSessionStatus({ ...base, caseCount: 0, coveragePercent: 0 })).toBe("OPEN");
  });
  it("OPEN while assigned but nothing ran yet", () => {
    expect(deriveSessionStatus(base)).toBe("OPEN");
  });
  it("IN_TESTING once there is activity below the target", () => {
    expect(deriveSessionStatus({ ...base, coveragePercent: 50, activity: 2 })).toBe("IN_TESTING");
  });
  it("PASSED at the agreed target, not only at 100%", () => {
    expect(deriveSessionStatus({ ...base, coveragePercent: 90, activity: 3 })).toBe("PASSED");
    expect(deriveSessionStatus({ ...base, coveragePercent: 89, activity: 3 })).toBe("IN_TESTING");
  });
});

describe("session findings never carry SLA", () => {
  const cur = { appTestId: null, sessionTestId: "st1", resolvedAt: null, isProductionIssue: false };
  it("resolveProductionFlag forces false for a session issue", () => {
    expect(resolveProductionFlag({ environment: "PRODUCTION", isProductionIssue: true }, cur)).toBe(false);
    // Same input without the session link is honoured — proves the session is the reason.
    expect(resolveProductionFlag({ environment: "PRODUCTION", isProductionIssue: true }, { ...cur, sessionTestId: null })).toBe(true);
  });
  it("canMarkProductionIssue hides the toggle for a session issue", () => {
    expect(canMarkProductionIssue({ environment: "PRODUCTION", appTestId: null, sessionTestId: "st1", resolvedAt: null })).toBe(false);
    expect(canMarkProductionIssue({ environment: "PRODUCTION", appTestId: null, sessionTestId: null, resolvedAt: null })).toBe(true);
  });
});

// DB-backed, gated like the other integration tests:
//   RUN_DB_TESTS=1 npm test --workspace server
const enabled = process.env.RUN_DB_TESTS === "1";
const S = sessionTestResolvers.Mutation;
const TAG = "itest-session";
const ctxFor = (userId: string) => ({ prisma, userId, userName: "test" }) as any;

describe.skipIf(!enabled)("session tests (integration)", () => {
  let qaId = "", adminId = "", projectId = "", tcId = "", tc2Id = "";

  beforeAll(async () => {
    const qa = await prisma.user.create({ data: { email: `${TAG}-qa@test.local`, name: "QA", role: "QA" } });
    const admin = await prisma.user.create({ data: { email: `${TAG}-admin@test.local`, name: "Admin", role: "ADMIN" } });
    qaId = qa.id; adminId = admin.id;
    const project = await prisma.project.create({ data: { name: `${TAG}-proj`, createdById: qa.id } });
    projectId = project.id;
    const feature = await prisma.feature.create({ data: { projectId: project.id, name: `${TAG}-feat` } });
    const tc = await prisma.testCase.create({ data: { featureId: feature.id, name: `${TAG}-tc`, createdById: qa.id } });
    const tc2 = await prisma.testCase.create({ data: { featureId: feature.id, name: `${TAG}-tc2`, createdById: qa.id } });
    tcId = tc.id; tc2Id = tc2.id;
  });

  afterAll(async () => {
    if (projectId) await prisma.project.delete({ where: { id: projectId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { email: { startsWith: TAG } } });
  });

  const newSession = (minPassPercent = 100) =>
    S.createSessionTest(
      null,
      {
        input: {
          projectId,
          testedAt: new Date().toISOString(),
          kind: "UAT",
          kindOther: null,
          stakeholders: ["Ops", ""],
          minPassPercent,
          note: null,
        },
      },
      ctxFor(qaId),
    );

  it("rejects OTHER without a label and an out-of-range target", async () => {
    await expect(
      S.createSessionTest(
        null,
        { input: { projectId, testedAt: new Date().toISOString(), kind: "OTHER", kindOther: "  ", stakeholders: [], minPassPercent: 50, note: null } },
        ctxFor(qaId),
      ),
    ).rejects.toThrow(/name the test type/i);
    await expect(
      S.createSessionTest(
        null,
        { input: { projectId, testedAt: new Date().toISOString(), kind: "SIT", kindOther: null, stakeholders: [], minPassPercent: 120, note: null } },
        ctxFor(qaId),
      ),
    ).rejects.toThrow(/between 0 and 100/i);
  });

  it("trims blank stakeholders away", async () => {
    const st = await newSession();
    expect(st.stakeholders).toEqual(["Ops"]);
  });

  it("scopes coverage to the session's own runs", async () => {
    const st = await newSession();
    await S.assignSessionTestCases(null, { sessionTestId: st.id, testCaseIds: [tcId, tc2Id], appIds: [] }, ctxFor(qaId));
    // A PASS recorded outside the session must not count for it.
    await recordResolvers.Mutation.createRecordTest(
      null,
      { testCaseId: tcId, input: { executedAt: new Date().toISOString(), result: "PASS", note: null, attachments: [] } },
      ctxFor(qaId),
    );
    expect((await sessionTestCoverage(st.id)).percent).toBe(0);

    await recordResolvers.Mutation.createRecordTest(
      null,
      { testCaseId: tcId, input: { executedAt: new Date().toISOString(), result: "PASS", note: null, sessionTestId: st.id, attachments: [] } },
      ctxFor(qaId),
    );
    expect((await sessionTestCoverage(st.id)).percent).toBe(50);
  });

  it("treats BLOCKED as no verdict: not passed, own row status, note required", async () => {
    const st = await newSession();
    await S.assignSessionTestCases(null, { sessionTestId: st.id, testCaseIds: [tcId], appIds: [] }, ctxFor(qaId));
    await expect(
      recordResolvers.Mutation.createRecordTest(
        null,
        { testCaseId: tcId, input: { executedAt: new Date().toISOString(), result: "BLOCKED", note: " ", attachments: [] } },
        ctxFor(qaId),
      ),
    ).rejects.toThrow(/blocked the test/i);

    await recordResolvers.Mutation.createRecordTest(
      null,
      {
        testCaseId: tcId,
        input: { executedAt: new Date().toISOString(), result: "BLOCKED", note: "staging API down", sessionTestId: st.id, attachments: [] },
      },
      ctxFor(qaId),
    );
    expect((await sessionTestCoverage(st.id)).percent).toBe(0);
    const rows: any[] = await sessionTestResolvers.Query.sessionTestCases(null, { sessionTestId: st.id }, ctxFor(qaId));
    expect(rows.find((r) => r.testCase.id === tcId)?.status).toBe("BLOCKED");
  });

  it("close requires a summary and happens once", async () => {
    const st = await newSession();
    await expect(S.closeSessionTest(null, { id: st.id, summary: "   " }, ctxFor(qaId))).rejects.toThrow(/summary is required/i);
    const closed = await S.closeSessionTest(null, { id: st.id, summary: "signed off" }, ctxFor(qaId));
    expect(closed.closedAt).toBeTruthy();
    await expect(S.closeSessionTest(null, { id: st.id, summary: "again" }, ctxFor(qaId))).rejects.toThrow(/already closed/i);
  });

  it("QA cannot delete a session that has results, an admin can", async () => {
    const st = await newSession();
    await S.assignSessionTestCases(null, { sessionTestId: st.id, testCaseIds: [tcId], appIds: [] }, ctxFor(qaId));
    await recordResolvers.Mutation.createRecordTest(
      null,
      { testCaseId: tcId, input: { executedAt: new Date().toISOString(), result: "FAIL", note: null, sessionTestId: st.id, attachments: [] } },
      ctxFor(qaId),
    );
    await expect(S.deleteSessionTest(null, { id: st.id }, ctxFor(qaId))).rejects.toThrow(/only an admin/i);
    expect(await S.deleteSessionTest(null, { id: st.id }, ctxFor(adminId))).toBe(true);
    // The run survives the session it was made in.
    expect(await prisma.recordTest.count({ where: { testCaseId: tcId, sessionTestId: null } })).toBeGreaterThan(0);
  });

  it("only links app tests from the session's own project", async () => {
    const st = await newSession();
    const other = await prisma.project.create({ data: { name: `${TAG}-other`, createdById: qaId } });
    const foreign = await prisma.appTest.create({
      data: { projectId: other.id, createdById: adminId, environment: "STAGING", platform: "WEB", downloadLink: "https://x.test" },
    });
    await expect(
      S.addSessionTestApp(null, { sessionTestId: st.id, input: { appTestId: foreign.id } }, ctxFor(qaId)),
    ).rejects.toThrow(/another project/i);
    await prisma.project.delete({ where: { id: other.id } });
  });

  it("snapshots versions when linking an app test, so a later build cannot rewrite the report", async () => {
    const st = await newSession();
    const at = await prisma.appTest.create({
      data: {
        projectId, createdById: adminId, environment: "STAGING", platform: "ANDROID",
        appVersion: "1.0.0", backendVersion: "2.0.0", downloadLink: "https://x.test/v1",
      },
    });
    await S.addSessionTestApp(null, { sessionTestId: st.id, input: { appTestId: at.id } }, ctxFor(qaId));
    await prisma.appTest.update({ where: { id: at.id }, data: { appVersion: "9.9.9" } });
    const app = await prisma.sessionTestApp.findFirst({ where: { sessionTestId: st.id } });
    expect(app?.versionFe).toBe("1.0.0");
    expect(app?.name).toBe(`APP-${at.number}`);
  });

  it("requires a name for a manually typed app", async () => {
    const st = await newSession();
    await expect(S.addSessionTestApp(null, { sessionTestId: st.id, input: { name: " " } }, ctxFor(qaId))).rejects.toThrow(/name is required/i);
  });
});

describe.skipIf(!enabled)("moveAppTestProject (integration)", () => {
  const MTAG = "itest-move";
  let adminId = "", qaId = "", srcProjectId = "", dstProjectId = "", tcId = "", appTestId = "";

  beforeAll(async () => {
    const admin = await prisma.user.create({ data: { email: `${MTAG}-admin@test.local`, name: "Admin", role: "ADMIN" } });
    const qa = await prisma.user.create({ data: { email: `${MTAG}-qa@test.local`, name: "QA", role: "QA" } });
    adminId = admin.id; qaId = qa.id;
    const src = await prisma.project.create({ data: { name: `${MTAG}-src`, createdById: qa.id } });
    const dst = await prisma.project.create({ data: { name: `${MTAG}-dst`, createdById: qa.id } });
    srcProjectId = src.id; dstProjectId = dst.id;
    const feature = await prisma.feature.create({ data: { projectId: src.id, name: `${MTAG}-feat` } });
    const tc = await prisma.testCase.create({ data: { featureId: feature.id, name: `${MTAG}-tc`, createdById: qa.id } });
    tcId = tc.id;
    const at = await prisma.appTest.create({
      data: { projectId: src.id, createdById: admin.id, environment: "STAGING", platform: "WEB", downloadLink: "https://x.test" },
    });
    appTestId = at.id;
    await prisma.appTestCase.create({ data: { appTestId: at.id, testCaseId: tc.id, assignedById: qa.id } });
  });

  afterAll(async () => {
    for (const id of [srcProjectId, dstProjectId]) {
      if (id) await prisma.project.delete({ where: { id } }).catch(() => {});
    }
    await prisma.user.deleteMany({ where: { email: { startsWith: MTAG } } });
  });

  it("is admin-only", async () => {
    await expect(
      appTestResolvers.Mutation.moveAppTestProject(null, { id: appTestId, projectId: dstProjectId, mode: "DROP" }, ctxFor(qaId)),
    ).rejects.toThrow(/admin only/i);
  });

  it("CLONE carries the assignments over as copies in the target project", async () => {
    await appTestResolvers.Mutation.moveAppTestProject(
      null,
      { id: appTestId, projectId: dstProjectId, mode: "CLONE" },
      ctxFor(adminId),
    );
    const rows = await prisma.appTestCase.findMany({
      where: { appTestId },
      include: { testCase: { include: { feature: true } } },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].testCaseId).not.toBe(tcId);
    expect(rows[0].testCase.feature.projectId).toBe(dstProjectId);
    // The original case stays put in the source project.
    expect(await prisma.testCase.findUnique({ where: { id: tcId } })).not.toBeNull();
  });

  it("DROP releases the assignments", async () => {
    await appTestResolvers.Mutation.moveAppTestProject(
      null,
      { id: appTestId, projectId: srcProjectId, mode: "DROP" },
      ctxFor(adminId),
    );
    expect(await prisma.appTestCase.count({ where: { appTestId } })).toBe(0);
    expect((await prisma.appTest.findUnique({ where: { id: appTestId } }))?.projectId).toBe(srcProjectId);
  });
});
