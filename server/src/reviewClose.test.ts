import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

// Credentials stubbed in, JIRA_DONE_TRANSITION deliberately left empty — that is
// the default deployment, and the one where no ticket may be moved. env.ts
// snapshots process.env at import time and a static import would be hoisted
// above these stubs, so EVERY module here is imported dynamically (same reason
// as jiraFailure.test.ts). Without this the test would read the developer's own
// .env and pass or fail depending on whose machine it runs on.
vi.stubEnv("JIRA_BASE_URL", "https://jira.test");
vi.stubEnv("JIRA_EMAIL", "qa@test");
vi.stubEnv("JIRA_API_TOKEN", "t");
vi.stubEnv("JIRA_DONE_TRANSITION", "");
const { pickDoneTransition, transitionIssue, transitionIssues } = await import("./jira.js");
const { prisma } = await import("./db.js");
const { closeScopeIssues } = await import("./resolvers/workflow.js");

describe("pickDoneTransition", () => {
  const list = [
    { id: "11", name: "To Do", to: { name: "To Do" } },
    { id: "21", name: "Close Issue", to: { name: "Done" } },
    { id: "31", name: "Reopen", to: { name: "Reopened" } },
  ];

  it("matches the transition's own name", () => {
    expect(pickDoneTransition(list, "Close Issue")).toBe("21");
  });

  it("falls back to the status the transition lands in", () => {
    // The button is called "Close Issue" but the workflow's status is "Done" —
    // either spelling of the knob has to work.
    expect(pickDoneTransition(list, "Done")).toBe("21");
  });

  it("ignores case and surrounding space", () => {
    expect(pickDoneTransition(list, "  done  ")).toBe("21");
    expect(pickDoneTransition(list, "CLOSE ISSUE")).toBe("21");
  });

  it("prefers a transition name over another transition's target status", () => {
    const shadowed = [
      { id: "1", name: "Reopened", to: { name: "Reopened" } },
      { id: "2", name: "Finish", to: { name: "Reopened" } },
    ];
    expect(pickDoneTransition(shadowed, "Reopened")).toBe("1");
  });

  it("returns null rather than guessing", () => {
    expect(pickDoneTransition(list, "Selesai")).toBe(null);
    expect(pickDoneTransition(list, "")).toBe(null);
    expect(pickDoneTransition([], "Done")).toBe(null);
    expect(pickDoneTransition([{ id: "9", name: "Ship" }], "Done")).toBe(null);
  });
});

describe("transitionIssue", () => {
  it("with no transition named, never even asks JIRA what transitions exist", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(await transitionIssue("CAI-730")).toBe(false);
    expect(await transitionIssues(["CAI-730", "CAI-731"])).toBe(0);
    // Moving someone else's ticket is an outward, hard-to-undo act: with no
    // transition named, JIRA is not contacted at all.
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("moves the ticket once a transition is named", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if ((init?.method ?? "GET") === "GET") {
        return new Response(JSON.stringify({ transitions: [{ id: "21", name: "Close Issue", to: { name: "Done" } }] }));
      }
      // 204 must be constructed with a null body — Response rejects a body here.
      return new Response(null, { status: 204 });
    });
    expect(await transitionIssue("CAI-730", "Done")).toBe(true);
    expect(calls).toEqual([
      "GET https://jira.test/rest/api/3/issue/CAI-730/transitions",
      "POST https://jira.test/rest/api/3/issue/CAI-730/transitions",
    ]);
    vi.unstubAllGlobals();
  });

  it("leaves the ticket alone when the named transition is not on offer", async () => {
    vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => {
      if ((init?.method ?? "GET") !== "GET") throw new Error("must not POST");
      return new Response(JSON.stringify({ transitions: [{ id: "11", name: "To Do", to: { name: "To Do" } }] }));
    });
    expect(await transitionIssue("CAI-730", "Done")).toBe(false);
    vi.unstubAllGlobals();
  });
});

// DB-backed, gated like the other integration tests:
//   RUN_DB_TESTS=1 npm test --workspace server
const enabled = process.env.RUN_DB_TESTS === "1";
const TAG = "itest-reviewclose";
const ctxFor = (userId: string, role: string) => ({ prisma, userId, role, userName: "test" }) as any;

describe.skipIf(!enabled)("closeScopeIssues (integration)", () => {
  let qaId = "";
  let engId = "";
  let appTestId = "";
  let otherAppTestId = "";
  let testCaseId = "";

  const issue = (data: Record<string, any>) =>
    prisma.issue.create({
      data: {
        testCaseId,
        type: "DEFECT",
        title: `${TAG}-issue`,
        description: "d",
        environment: "STAGING",
        platform: "ANDROID",
        testAccount: "a",
        testedAt: new Date(),
        steps: "s",
        actualResult: "a",
        expectedResult: "e",
        priority: "LOW",
        reporterId: qaId,
        assigneeId: engId,
        ...data,
      },
    });

  beforeAll(async () => {
    const qa = await prisma.user.create({ data: { email: `${TAG}-qa@test.local`, name: "QA", role: "QA" } });
    const eng = await prisma.user.create({ data: { email: `${TAG}-eng@test.local`, name: "Eng", role: "ENGINEER" } });
    qaId = qa.id;
    engId = eng.id;
    const project = await prisma.project.create({ data: { name: `${TAG}-proj`, createdById: qa.id } });
    const feature = await prisma.feature.create({ data: { projectId: project.id, name: `${TAG}-feat` } });
    const tc = await prisma.testCase.create({
      data: { featureId: feature.id, name: `${TAG}-tc`, createdById: qa.id, approval: "APPROVED" },
    });
    testCaseId = tc.id;
    const mk = () =>
      prisma.appTest.create({
        data: {
          projectId: project.id,
          createdById: qa.id,
          environment: "STAGING",
          platform: "ANDROID",
          downloadLink: "https://x",
        },
      });
    appTestId = (await mk()).id;
    otherAppTestId = (await mk()).id;
  });

  afterAll(async () => {
    await prisma.statusEvent.deleteMany({ where: { issue: { title: `${TAG}-issue` } } });
    await prisma.issue.deleteMany({ where: { title: `${TAG}-issue` } });
    await prisma.appTest.deleteMany({ where: { id: { in: [appTestId, otherAppTestId] } } });
    await prisma.testCase.deleteMany({ where: { name: `${TAG}-tc` } });
    await prisma.feature.deleteMany({ where: { name: `${TAG}-feat` } });
    await prisma.project.deleteMany({ where: { name: `${TAG}-proj` } });
    await prisma.user.deleteMany({ where: { email: { startsWith: TAG } } });
  });

  it("closes the scope's open findings and records who ended them", async () => {
    const open = await issue({ appTestId, status: "OPEN" });
    const inReview = await issue({ appTestId, status: "NEED_REVIEW" });
    const n = await closeScopeIssues(ctxFor(qaId, "QA"), { id: qaId }, { appTestId }, "APP report approved");
    expect(n).toBe(2);
    for (const id of [open.id, inReview.id]) {
      const after = await prisma.issue.findUnique({ where: { id } });
      expect(after?.status).toBe("CLOSED");
      expect(after?.closedAt).not.toBeNull();
      const ev = await prisma.statusEvent.findMany({ where: { issueId: id } });
      expect(ev.map((e) => e.toVal)).toContain("CLOSED");
      expect(ev[0].byId).toBe(qaId);
    }
  });

  it("leaves closed and archived findings alone, so a second approve is a no-op", async () => {
    const archived = await issue({ appTestId, status: "OPEN", archived: true });
    const n = await closeScopeIssues(ctxFor(qaId, "QA"), { id: qaId }, { appTestId }, "again");
    expect(n).toBe(0);
    expect((await prisma.issue.findUnique({ where: { id: archived.id } }))?.status).toBe("OPEN");
  });

  it("never reaches outside its own scope", async () => {
    const elsewhere = await issue({ appTestId: otherAppTestId, status: "OPEN" });
    const loose = await issue({ status: "OPEN" }); // no app test, no session
    await closeScopeIssues(ctxFor(qaId, "QA"), { id: qaId }, { appTestId }, "scoped");
    expect((await prisma.issue.findUnique({ where: { id: elsewhere.id } }))?.status).toBe("OPEN");
    expect((await prisma.issue.findUnique({ where: { id: loose.id } }))?.status).toBe("OPEN");
  });
});
