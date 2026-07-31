import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "./db.js";
import { testCaseResolvers } from "./resolvers/testcase.js";
import { recordResolvers } from "./resolvers/record.js";
import { appTestResolvers } from "./resolvers/appTest.js";
import { featureCoverage } from "./coverage.js";

// The approval gate against a real DB: a pending case is invisible, untestable
// and unassignable, an approved one behaves as before, and an edit re-opens the
// review. Gated on RUN_DB_TESTS=1 like the other integration tests.
//   RUN_DB_TESTS=1 npm test --workspace server
const enabled = process.env.RUN_DB_TESTS === "1";
const Q = testCaseResolvers.Query;
const M = testCaseResolvers.Mutation;
const TAG = "itest-approval";

const ctxFor = (userId: string, role: string) => ({ prisma, userId, userName: "test", role } as any);

const input = (name: string) => ({
  name,
  description: null,
  precondition: null,
  note: null,
  kind: null,
  steps: [{ step: "open the app", expectedResult: "it opens" }],
  attachments: [],
});

describe.skipIf(!enabled)("test case approval (integration)", () => {
  let qaId = "", leadId = "", engId = "", projectId = "", featureId = "";

  beforeAll(async () => {
    const qa = await prisma.user.create({ data: { email: `${TAG}-qa@test.local`, name: "QA", role: "QA" } });
    const lead = await prisma.user.create({ data: { email: `${TAG}-lead@test.local`, name: "Lead", role: "QA_LEAD" } });
    const eng = await prisma.user.create({ data: { email: `${TAG}-eng@test.local`, name: "Eng", role: "ENGINEER" } });
    qaId = qa.id; leadId = lead.id; engId = eng.id;
    const project = await prisma.project.create({ data: { name: `${TAG}-proj`, createdById: qa.id } });
    projectId = project.id;
    const feature = await prisma.feature.create({ data: { projectId: project.id, name: `${TAG}-feat` } });
    featureId = feature.id;
  });

  afterAll(async () => {
    if (projectId) await prisma.project.delete({ where: { id: projectId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { email: { startsWith: TAG } } });
  });

  it("a QA's new case is PENDING, hidden from the list, and shows up as pending", async () => {
    const tc = await M.createTestCase(null, { featureId, input: input(`${TAG}-hidden`) }, ctxFor(qaId, "QA"));
    expect(tc.approval).toBe("PENDING");

    const listed = await Q.testCases(null, { featureId }, ctxFor(qaId, "QA"));
    expect(listed.map((t: any) => t.id)).not.toContain(tc.id);

    // Still readable on its own — the detail page, comments and watch stay open.
    const one = await Q.testCase(null, { id: tc.id }, ctxFor(engId, "ENGINEER"));
    expect(one?.id).toBe(tc.id);

    const pending = await Q.pendingTestCases(null, { projectId }, ctxFor(engId, "ENGINEER"));
    expect(pending.map((t: any) => t.id)).toContain(tc.id);

    // Not part of the agreed catalogue: it can't move the coverage denominator.
    const cov = await featureCoverage(featureId);
    expect(cov.total).toBe(0);
  });

  it("a pending case refuses runs and assignments", async () => {
    const tc = await M.createTestCase(null, { featureId, input: input(`${TAG}-norun`) }, ctxFor(qaId, "QA"));

    await expect(
      recordResolvers.Mutation.createRecordTest(
        null,
        { testCaseId: tc.id, input: { executedAt: new Date().toISOString(), note: null, result: "PASS", attachments: [] } },
        ctxFor(qaId, "QA"),
      ),
    ).rejects.toThrow(/waiting for approval/);

    const at = await appTestResolvers.Mutation.createAppTest(
      null,
      {
        input: {
          projectId, environment: "STAGING", platform: "ANDROID", appVersion: "1.0.0",
          backendVersion: null, downloadLink: "https://example.test/a.apk", note: null, jiraTickets: [],
        },
      },
      ctxFor(engId, "ENGINEER"),
    );
    await expect(
      appTestResolvers.Mutation.assignTestCases(null, { appTestId: at.id, testCaseIds: [tc.id] }, ctxFor(qaId, "QA")),
    ).rejects.toThrow(/waiting for approval/);
  });

  it("QA may not approve; a QA lead may, and then the case is testable", async () => {
    const tc = await M.createTestCase(null, { featureId, input: input(`${TAG}-approve`) }, ctxFor(qaId, "QA"));

    await expect(M.approveTestCase(null, { id: tc.id }, ctxFor(qaId, "QA"))).rejects.toThrow(/Forbidden/);

    const approved = await M.approveTestCase(null, { id: tc.id }, ctxFor(leadId, "QA_LEAD"));
    expect(approved.approval).toBe("APPROVED");
    expect(approved.reviewedById).toBe(leadId);
    expect(approved.reviewedAt).toBeTruthy();

    const listed = await Q.testCases(null, { featureId }, ctxFor(qaId, "QA"));
    expect(listed.map((t: any) => t.id)).toContain(tc.id);

    const rec = await recordResolvers.Mutation.createRecordTest(
      null,
      { testCaseId: tc.id, input: { executedAt: new Date().toISOString(), note: null, result: "PASS", attachments: [] } },
      ctxFor(qaId, "QA"),
    );
    expect(rec.result).toBe("PASS");
  });

  it("editing an approved case sends it back to PENDING", async () => {
    const tc = await M.createTestCase(null, { featureId, input: input(`${TAG}-edit`) }, ctxFor(qaId, "QA"));
    await M.approveTestCase(null, { id: tc.id }, ctxFor(leadId, "QA_LEAD"));

    const edited = await M.updateTestCase(null, { id: tc.id, input: input(`${TAG}-edit-v2`) }, ctxFor(qaId, "QA"));
    expect(edited.approval).toBe("PENDING");
    expect(edited.reviewedAt).toBeNull();
    expect(edited.reviewedById).toBeNull();
  });

  it("reject needs a reason, keeps the row, and stays on the pending list", async () => {
    const tc = await M.createTestCase(null, { featureId, input: input(`${TAG}-reject`) }, ctxFor(qaId, "QA"));

    await expect(M.rejectTestCase(null, { id: tc.id, reason: "  " }, ctxFor(leadId, "QA_LEAD"))).rejects.toThrow(/why/);

    const rejected = await M.rejectTestCase(null, { id: tc.id, reason: "steps are unclear" }, ctxFor(leadId, "QA_LEAD"));
    expect(rejected.approval).toBe("REJECTED");
    expect(rejected.rejectReason).toBe("steps are unclear");

    const pending = await Q.pendingTestCases(null, { projectId }, ctxFor(qaId, "QA"));
    expect(pending.map((t: any) => t.id)).toContain(tc.id);
  });

  it("bulk approve takes what it may and skips the rest", async () => {
    const mine = await M.createTestCase(null, { featureId, input: input(`${TAG}-bulk-1`) }, ctxFor(qaId, "QA"));
    const theirs = await M.createTestCase(null, { featureId, input: input(`${TAG}-bulk-2`) }, ctxFor(leadId, "QA_LEAD"));

    // The lead may approve the QA's case but never their own.
    const res = await M.approveTestCases(null, { ids: [mine.id, theirs.id] }, ctxFor(leadId, "QA_LEAD"));
    expect(res).toEqual({ approved: 1, skipped: 1 });
    expect((await prisma.testCase.findUnique({ where: { id: mine.id } }))!.approval).toBe("APPROVED");
    expect((await prisma.testCase.findUnique({ where: { id: theirs.id } }))!.approval).toBe("PENDING");
  });

  it("counts only what this user may approve", async () => {
    expect(await Q.pendingApprovalCount(null, {}, ctxFor(qaId, "QA"))).toBe(0);
    expect(await Q.pendingApprovalCount(null, {}, ctxFor(leadId, "QA_LEAD"))).toBeGreaterThan(0);
  });
});
