import { describe, it, expect } from "vitest";
import { mapAppTest, mapSessionTest, mapIssue, mapIssueSummary, FORBIDDEN_FIELDS } from "./map.js";

const project = { id: "clzproject0000000000000", name: "HAM Mobile" };
const coverage = { total: 42, passed: 30, percent: 71 };
const at = new Date("2026-08-04T09:41:00.000Z");

// Rows carry extra columns on purpose — the mappers must drop them.
const appTestRow = {
  number: 12,
  id: "clzapptest000000000000",
  project,
  environment: "STAGING",
  platform: "ANDROID",
  appVersion: "2.4.0",
  backendVersion: "1.9.3",
  passedAt: null,
  closedAt: null,
  createdAt: at,
  updatedAt: at,
  downloadLink: "https://drive.example.com/secret-build.apk",
  note: "internal note",
  createdById: "clzuser00000000000000",
} as any;

const sessionRow = {
  number: 4,
  id: "clzsession00000000000",
  project,
  kind: "UAT",
  minPassPercent: 90,
  testedAt: at,
  closedAt: null,
  createdAt: at,
  updatedAt: at,
  stakeholders: ["ops@hpam.co.id"],
  summary: "signed off with 2 minor findings",
  note: "internal",
} as any;

const issueRow = {
  number: 88,
  id: "clzissue0000000000000",
  title: "Saldo tidak muncul setelah top-up",
  type: "BUG",
  status: "IN_PROGRESS",
  review: "ACCEPTED",
  priority: "HIGH",
  environment: "PRODUCTION",
  isProductionIssue: true,
  archived: false,
  respondedAt: at,
  resolvedAt: null,
  closedAt: null,
  createdAt: at,
  updatedAt: at,
  appTest: { number: 12 },
  sessionTest: null,
  testAccount: "user@example.com",
  testPassword: "encrypted-blob",
  steps: "1. top up 2. open balance",
  description: "balance stays stale",
  actualResult: "old balance",
  expectedResult: "new balance",
  preconditions: "logged in",
  reporterId: "clzuser00000000000000",
  assigneeId: "clzuser11111111111111",
  jiraKey: "HAM-321",
} as any;

describe("mapAppTest", () => {
  const out = mapAppTest(appTestRow, { status: "IN_TESTING", coverage, openIssueCount: 3 });

  it("exposes the human key and derived values", () => {
    expect(out.key).toBe("APP-12");
    expect(out.status).toBe("IN_TESTING");
    expect(out.coverage).toEqual(coverage);
    expect(out.openIssueCount).toBe(3);
  });
  it("serialises dates as ISO strings", () => {
    expect(out.createdAt).toBe("2026-08-04T09:41:00.000Z");
    expect(out.closedAt).toBeNull();
  });
  it("drops the build link and internal note", () => {
    expect(out).not.toHaveProperty("downloadLink");
    expect(out).not.toHaveProperty("note");
    expect(out).not.toHaveProperty("createdById");
  });
});

describe("mapSessionTest", () => {
  const out = mapSessionTest(sessionRow, { status: "IN_TESTING", coverage, openIssueCount: 5 });

  it("exposes the human key, kind and go/no-go threshold", () => {
    expect(out.key).toBe("ST-4");
    expect(out.kind).toBe("UAT");
    expect(out.minPassPercent).toBe(90);
  });
  it("drops stakeholders and the sign-off summary", () => {
    expect(out).not.toHaveProperty("stakeholders");
    expect(out).not.toHaveProperty("summary");
  });
});

describe("mapIssue", () => {
  const out = mapIssue(issueRow, project);

  it("exposes status, review, priority and scope keys", () => {
    expect(out.key).toBe("ISSUE-88");
    expect(out.status).toBe("IN_PROGRESS");
    expect(out.review).toBe("ACCEPTED");
    expect(out.priority).toBe("HIGH");
    expect(out.scope).toEqual({ appTest: "APP-12", sessionTest: null });
  });
  it("never exposes test credentials or issue bodies", () => {
    for (const field of ["testAccount", "testPassword", "steps", "description", "actualResult", "expectedResult", "preconditions"]) {
      expect(out).not.toHaveProperty(field);
    }
  });
  it("never exposes reporter, assignee or JIRA linkage", () => {
    expect(out).not.toHaveProperty("reporterId");
    expect(out).not.toHaveProperty("assigneeId");
    expect(out).not.toHaveProperty("jiraKey");
  });
});

describe("mapIssueSummary", () => {
  it("keeps only what a list needs", () => {
    const out = mapIssueSummary(issueRow);
    expect(Object.keys(out).sort()).toEqual(["createdAt", "key", "priority", "status", "title"]);
  });
});

describe("no forbidden field survives any mapper", () => {
  const outputs = [
    mapAppTest(appTestRow, { status: "IN_TESTING", coverage, openIssueCount: 3 }),
    mapSessionTest(sessionRow, { status: "IN_TESTING", coverage, openIssueCount: 5 }),
    mapIssue(issueRow, project),
    mapIssueSummary(issueRow),
  ];

  it.each(FORBIDDEN_FIELDS)("%s is absent from every mapped shape", (field) => {
    for (const out of outputs) {
      expect(JSON.stringify(out)).not.toContain(`"${field}":`);
    }
  });
});
