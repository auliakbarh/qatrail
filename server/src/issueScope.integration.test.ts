import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "./db.js";
import { workflowResolvers } from "./resolvers/workflow.js";

// Re-pointing an issue at an app test / testing session, against a real DB.
// Gated on RUN_DB_TESTS=1 like the other integration suites.
//   RUN_DB_TESTS=1 npm test --workspace server
const enabled = process.env.RUN_DB_TESTS === "1";
const M = workflowResolvers.Mutation;
const TAG = "itest-scope";

const ctxFor = (userId: string) => ({ prisma, userId, userName: "test" } as any);

describe.skipIf(!enabled)("setIssueScope (integration)", () => {
  let qaId = "", engId = "", tcId = "", projectId = "", otherProjectId = "";
  let appTestId = "", otherAppTestId = "", sessionTestId = "";

  const makeIssue = (overrides: Record<string, any> = {}) =>
    prisma.issue.create({
      data: {
        testCaseId: tcId, type: "BUG", title: `${TAG}-issue`, description: "d",
        environment: "PRODUCTION", platform: "WEB", testAccount: "acct", testedAt: new Date(),
        steps: "s", actualResult: "a", expectedResult: "e", priority: "HIGH",
        reporterId: qaId, assigneeId: engId, ...overrides,
      },
    });

  beforeAll(async () => {
    const qa = await prisma.user.create({ data: { email: `${TAG}-qa@test.local`, name: "QA", role: "QA" } });
    const eng = await prisma.user.create({ data: { email: `${TAG}-eng@test.local`, name: "Eng", role: "ENGINEER" } });
    qaId = qa.id; engId = eng.id;

    const project = await prisma.project.create({ data: { name: `${TAG}-proj`, createdById: qa.id } });
    projectId = project.id;
    const other = await prisma.project.create({ data: { name: `${TAG}-proj-other`, createdById: qa.id } });
    otherProjectId = other.id;

    const feature = await prisma.feature.create({ data: { projectId, name: `${TAG}-feat` } });
    const tc = await prisma.testCase.create({ data: { featureId: feature.id, name: `${TAG}-tc`, createdById: qa.id } });
    tcId = tc.id;

    const app = (pid: string) =>
      prisma.appTest.create({
        data: {
          projectId: pid, createdById: eng.id, environment: "STAGING", platform: "ANDROID",
          downloadLink: "https://example.test/build",
        },
      });
    appTestId = (await app(projectId)).id;
    otherAppTestId = (await app(otherProjectId)).id;

    const session = await prisma.sessionTest.create({
      data: { projectId, createdById: qa.id, testedAt: new Date(), kind: "SIT" },
    });
    sessionTestId = session.id;
  });

  afterAll(async () => {
    for (const id of [projectId, otherProjectId]) {
      if (id) await prisma.project.delete({ where: { id } }).catch(() => {});
    }
    await prisma.user.deleteMany({ where: { email: { startsWith: TAG } } });
  });

  it("links an issue to an app test and records it in the timeline", async () => {
    const issue = await makeIssue();
    const updated = await M.setIssueScope(null, { id: issue.id, appTestId }, ctxFor(qaId));
    expect(updated.appTestId).toBe(appTestId);
    expect(updated.sessionTestId).toBeNull();

    const ev = await prisma.statusEvent.findFirst({ where: { issueId: issue.id, kind: "scope" } });
    expect(ev?.fromVal).toBe("none");
    expect(ev?.toVal).toMatch(/^APP-\d+$/);
  });

  it("moves the link to a session and back to nothing", async () => {
    const issue = await makeIssue();
    await M.setIssueScope(null, { id: issue.id, appTestId }, ctxFor(qaId));

    const moved = await M.setIssueScope(null, { id: issue.id, sessionTestId }, ctxFor(qaId));
    expect(moved.appTestId).toBeNull();
    expect(moved.sessionTestId).toBe(sessionTestId);

    const cleared = await M.setIssueScope(null, { id: issue.id }, ctxFor(qaId));
    expect(cleared.appTestId).toBeNull();
    expect(cleared.sessionTestId).toBeNull();
  });

  it("refuses both scopes at once", async () => {
    const issue = await makeIssue();
    await expect(
      M.setIssueScope(null, { id: issue.id, appTestId, sessionTestId }, ctxFor(qaId)),
    ).rejects.toThrow(/not both/);
  });

  it("refuses a target from another project", async () => {
    const issue = await makeIssue();
    await expect(
      M.setIssueScope(null, { id: issue.id, appTestId: otherAppTestId }, ctxFor(qaId)),
    ).rejects.toThrow(/same project/);
  });

  it("refuses to link a production issue — the SLA flag must be unmarked first", async () => {
    const issue = await makeIssue({ isProductionIssue: true });
    await expect(
      M.setIssueScope(null, { id: issue.id, appTestId }, ctxFor(qaId)),
    ).rejects.toThrow(/Unmark the production issue/);
    // Unlinking is still allowed: it never drops a flag.
    const cleared = await M.setIssueScope(null, { id: issue.id }, ctxFor(qaId));
    expect(cleared.isProductionIssue).toBe(true);
  });

  it("refuses an engineer who is neither reporter nor QA", async () => {
    const issue = await makeIssue();
    await expect(
      M.setIssueScope(null, { id: issue.id, appTestId }, ctxFor(engId)),
    ).rejects.toThrow(/Forbidden/);
  });
});
