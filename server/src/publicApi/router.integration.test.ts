import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import { prisma } from "../db.js";
import { publicApiRouter, publicApiErrorHandler } from "./router.js";
import { generateKey, hashKey } from "./keys.js";

// Public API against a real DB + a real Express app. Gated on RUN_DB_TESTS=1 so
// the default unit run (and CI without Postgres) skips it.
//   RUN_DB_TESTS=1 npm test --workspace server
const enabled = process.env.RUN_DB_TESTS === "1";
const TAG = "itest-publicapi";
const APP_ID = `${TAG}-portal`;

const app = express();
app.set("trust proxy", true);
app.use("/api/public/v1", publicApiRouter, publicApiErrorHandler);

let baseUrl = "";
let server: ReturnType<typeof app.listen>;
let rawKey = "";
let appTestNumber = 0;
let sessionNumber = 0;
let issueNumber = 0;

/** fetch against the test server with the headers the contract requires. */
async function call(path: string, headers: Record<string, string> = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: { "x-api-key": rawKey, "x-app-id": APP_ID, origin: "https://portal.hpam.id", ...headers },
  });
  return { status: res.status, body: (await res.json()) as any, cacheControl: res.headers.get("cache-control") };
}

describe.skipIf(!enabled)("public API (integration)", () => {
  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        baseUrl = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
        resolve();
      });
    });

    const qa = await prisma.user.create({ data: { email: `${TAG}-qa@test.local`, name: "QA", role: "QA" } });
    const eng = await prisma.user.create({ data: { email: `${TAG}-eng@test.local`, name: "Eng", role: "ENGINEER" } });
    const project = await prisma.project.create({ data: { name: `${TAG}-proj`, createdById: qa.id } });
    const feature = await prisma.feature.create({ data: { projectId: project.id, name: `${TAG}-feat` } });
    const tc = await prisma.testCase.create({ data: { featureId: feature.id, name: `${TAG}-tc`, createdById: qa.id } });

    const appTest = await prisma.appTest.create({
      data: {
        projectId: project.id,
        createdById: eng.id,
        environment: "STAGING",
        platform: "ANDROID",
        appVersion: "2.4.0",
        downloadLink: "https://drive.example.com/secret-build.apk",
        note: "internal only",
      },
    });
    appTestNumber = appTest.number;
    await prisma.appTestCase.create({ data: { appTestId: appTest.id, testCaseId: tc.id, assignedById: qa.id } });

    const session = await prisma.sessionTest.create({
      data: {
        projectId: project.id,
        createdById: qa.id,
        testedAt: new Date(),
        kind: "UAT",
        minPassPercent: 90,
        stakeholders: ["ops@hpam.co.id"],
        summary: "internal sign-off note",
      },
    });
    sessionNumber = session.number;

    const rec = await prisma.recordTest.create({
      data: { testCaseId: tc.id, executedById: qa.id, executedAt: new Date(), result: "FAIL", appTestId: appTest.id },
    });
    const issue = await prisma.issue.create({
      data: {
        testCaseId: tc.id,
        recordTestId: rec.id,
        appTestId: appTest.id,
        type: "BUG",
        title: `${TAG}-issue`,
        description: "internal description",
        environment: "STAGING",
        platform: "ANDROID",
        testAccount: "user@example.com",
        testPassword: "encrypted-blob",
        testedAt: new Date(),
        steps: "1. do 2. see",
        actualResult: "wrong",
        expectedResult: "right",
        priority: "HIGH",
        reporterId: qa.id,
        assigneeId: eng.id,
      },
    });
    issueNumber = issue.number;

    rawKey = generateKey();
    await prisma.publicApiClient.create({
      data: {
        appId: APP_ID,
        name: "IT Portal (test)",
        keyHash: hashKey(rawKey),
        allowedOrigins: ["portal.hpam.id"],
        allowedIps: [],
        createdById: qa.id,
      },
    });
  });

  afterAll(async () => {
    await prisma.publicApiClient.deleteMany({ where: { appId: { startsWith: TAG } } });
    await prisma.issue.deleteMany({ where: { title: { startsWith: TAG } } });
    await prisma.recordTest.deleteMany({ where: { testCase: { name: { startsWith: TAG } } } });
    await prisma.appTest.deleteMany({ where: { project: { name: { startsWith: TAG } } } });
    await prisma.sessionTest.deleteMany({ where: { project: { name: { startsWith: TAG } } } });
    await prisma.project.deleteMany({ where: { name: { startsWith: TAG } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: TAG } } });
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("rejects a request with no credentials", async () => {
    const res = await fetch(`${baseUrl}/api/public/v1/app-tests/APP-${appTestNumber}`);
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHORIZED");
  });

  it("rejects a wrong key", async () => {
    const { status, body } = await call(`/app-tests/APP-${appTestNumber}`, { "x-api-key": generateKey() });
    expect(status).toBe(401);
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects a key used with the wrong appId", async () => {
    const { status } = await call(`/app-tests/APP-${appTestNumber}`, { "x-app-id": "someone-else" });
    expect(status).toBe(401);
  });

  it("rejects an origin outside the allow-list even with a valid key", async () => {
    const { status, body } = await call(`/app-tests/APP-${appTestNumber}`, { origin: "https://evil.example.com" });
    expect(status).toBe(403);
    expect(body.error.code).toBe("FORBIDDEN_ORIGIN");
  });

  it("rejects a client whose key is inactive", async () => {
    await prisma.publicApiClient.update({ where: { appId: APP_ID }, data: { active: false } });
    const { status } = await call(`/app-tests/APP-${appTestNumber}`);
    await prisma.publicApiClient.update({ where: { appId: APP_ID }, data: { active: true } });
    expect(status).toBe(401);
  });

  it("returns an app test with coverage and no build link", async () => {
    const { status, body, cacheControl } = await call(`/app-tests/APP-${appTestNumber}`);
    expect(status).toBe(200);
    expect(body.key).toBe(`APP-${appTestNumber}`);
    expect(body.coverage).toMatchObject({ total: 1, passed: 0 });
    expect(body.openIssueCount).toBe(1);
    expect(body.status).toBe("IN_TESTING");
    expect(body).not.toHaveProperty("downloadLink");
    expect(body).not.toHaveProperty("note");
    expect(cacheControl).toBe("private, max-age=30");
  });

  it("returns a session test with its go/no-go threshold", async () => {
    const { status, body } = await call(`/session-tests/ST-${sessionNumber}`);
    expect(status).toBe(200);
    expect(body.key).toBe(`ST-${sessionNumber}`);
    expect(body.minPassPercent).toBe(90);
    expect(body).not.toHaveProperty("stakeholders");
    expect(body).not.toHaveProperty("summary");
  });

  it("returns an issue without credentials or bodies", async () => {
    const { status, body } = await call(`/issues/ISSUE-${issueNumber}`);
    expect(status).toBe(200);
    expect(body.status).toBe("OPEN");
    expect(body.scope.appTest).toBe(`APP-${appTestNumber}`);
    for (const field of ["testAccount", "testPassword", "steps", "description", "actualResult", "expectedResult"]) {
      expect(body).not.toHaveProperty(field);
    }
  });

  it("lists issues of an app test and filters by status", async () => {
    const all = await call(`/app-tests/APP-${appTestNumber}/issues`);
    expect(all.status).toBe(200);
    expect(all.body.total).toBe(1);
    expect(Object.keys(all.body.issues[0]).sort()).toEqual(["createdAt", "key", "priority", "status", "title"]);

    const closed = await call(`/app-tests/APP-${appTestNumber}/issues?status=CLOSED`);
    expect(closed.body.total).toBe(0);
  });

  it("accepts the internal cuid as well as the human key", async () => {
    const row = await prisma.appTest.findUnique({ where: { number: appTestNumber }, select: { id: true } });
    const { status, body } = await call(`/app-tests/${row!.id}`);
    expect(status).toBe(200);
    expect(body.key).toBe(`APP-${appTestNumber}`);
  });

  it("400 for a malformed key, 404 for a missing row", async () => {
    expect((await call("/app-tests/not-a-key")).status).toBe(400);
    expect((await call("/app-tests/APP-999999")).status).toBe(404);
    expect((await call("/nope")).status).toBe(404);
  });

  it("rejects an unknown status filter", async () => {
    const { status, body } = await call(`/app-tests/APP-${appTestNumber}/issues?status=NOPE`);
    expect(status).toBe(400);
    expect(body.error.code).toBe("BAD_KEY");
  });

  it("stamps lastUsedAt", async () => {
    await call(`/app-tests/APP-${appTestNumber}`);
    // lastUsedAt is fire-and-forget; give it a tick to land.
    await new Promise((r) => setTimeout(r, 100));
    const client = await prisma.publicApiClient.findUnique({ where: { appId: APP_ID } });
    expect(client?.lastUsedAt).not.toBeNull();
  });
});
