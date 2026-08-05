// Read-only REST surface for server-to-server consumers (IT Portal).
// Contract: docs/API_PUBLIC.md. GET only, no CORS, no mutations — ever.
import { Router, type Request, type Response, type NextFunction } from "express";
import { prisma } from "../db.js";
import { logger } from "../logger.js";
import { appTestCoverage, sessionTestCoverage } from "../coverage.js";
import { deriveStatus } from "../appTestStatus.js";
import { deriveSessionStatus } from "../resolvers/sessionTest.js";
import { parseKey, type EntityKind } from "./keys.js";
import { requirePublicApiKey, PublicApiError, type PublicApiRequest } from "./auth.js";
import { mapAppTest, mapSessionTest, mapIssue, mapIssueSummary } from "./map.js";

const CACHE_HEADER = "private, max-age=30";
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const WORK_STATUSES = new Set(["OPEN", "IN_PROGRESS", "NEED_REVIEW", "IN_REVIEW", "CLOSED", "REOPENED", "HOLD"]);

/** Row locator from a human key or cuid; 400 when the shape is unusable. */
function whereFromKey(kind: EntityKind, raw: string): { id: string } | { number: number } {
  const parsed = parseKey(kind, raw);
  if (!parsed) throw new PublicApiError(400, "BAD_KEY", `Unrecognised key: ${raw}`);
  return parsed.id ? { id: parsed.id } : { number: parsed.number! };
}

function parseStatusFilter(value: unknown): string[] | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const wanted = value
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const unknown = wanted.filter((s) => !WORK_STATUSES.has(s));
  if (unknown.length) throw new PublicApiError(400, "BAD_KEY", `Unknown status: ${unknown.join(", ")}`);
  return wanted;
}

function parseLimit(value: unknown): number {
  if (typeof value !== "string" || !value.trim()) return DEFAULT_LIMIT;
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n <= 0) throw new PublicApiError(400, "BAD_KEY", "limit must be a positive integer");
  return Math.min(n, MAX_LIMIT);
}

/** Open = not closed and not archived — same definition coverage.ts uses. */
const OPEN_ISSUE_WHERE = { status: { not: "CLOSED" as const }, archived: false };

async function appTestPayload(raw: string) {
  const at = await prisma.appTest.findUnique({
    where: whereFromKey("APP", raw) as any,
    include: { project: { select: { id: true, name: true } } },
  });
  if (!at) throw new PublicApiError(404, "NOT_FOUND", "App test not found");

  const assignedCount = at.closedAt ? 0 : await prisma.appTestCase.count({ where: { appTestId: at.id } });
  const coverage = assignedCount > 0 ? await appTestCoverage(at.id) : { total: 0, passed: 0, percent: 0 };
  const openIssueCount = await prisma.issue.count({ where: { appTestId: at.id, ...OPEN_ISSUE_WHERE } });
  const activity =
    (await prisma.recordTest.count({ where: { appTestId: at.id } })) +
    (await prisma.issue.count({ where: { appTestId: at.id } }));

  const status = deriveStatus({
    closed: !!at.closedAt,
    assignedCount,
    coveragePercent: coverage.percent,
    activity,
  });
  return mapAppTest(at as any, { status, coverage, openIssueCount });
}

async function sessionTestPayload(raw: string) {
  const st = await prisma.sessionTest.findUnique({
    where: whereFromKey("ST", raw) as any,
    include: { project: { select: { id: true, name: true } } },
  });
  if (!st) throw new PublicApiError(404, "NOT_FOUND", "Session test not found");

  const caseCount = await prisma.sessionTestCase.count({ where: { sessionTestId: st.id } });
  const coverage = caseCount > 0 ? await sessionTestCoverage(st.id) : { total: 0, passed: 0, percent: 0 };
  const openIssueCount = await prisma.issue.count({ where: { sessionTestId: st.id, ...OPEN_ISSUE_WHERE } });
  const activity =
    (await prisma.recordTest.count({ where: { sessionTestId: st.id } })) +
    (await prisma.issue.count({ where: { sessionTestId: st.id } }));

  const status = deriveSessionStatus({
    closed: !!st.closedAt,
    caseCount,
    coveragePercent: coverage.percent,
    minPassPercent: st.minPassPercent,
    activity,
  });
  return mapSessionTest(st as any, { status, coverage, openIssueCount });
}

/** Issues of one testing scope. Archived rows never appear. */
async function scopeIssues(
  scope: { appTestId: string } | { sessionTestId: string },
  query: Request["query"],
) {
  const status = parseStatusFilter(query.status);
  const take = parseLimit(query.limit);
  const where = { ...scope, archived: false, ...(status ? { status: { in: status as any } } : {}) };

  const [total, rows] = await Promise.all([
    prisma.issue.count({ where }),
    prisma.issue.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      select: { number: true, title: true, status: true, priority: true, createdAt: true },
    }),
  ]);
  return { total, issues: rows.map(mapIssueSummary) };
}

export const publicApiRouter = Router();

publicApiRouter.use(requirePublicApiKey);

publicApiRouter.get("/app-tests/:key", async (req, res, next) => {
  try {
    res.set("Cache-Control", CACHE_HEADER).json(await appTestPayload(req.params.key));
  } catch (err) {
    next(err);
  }
});

publicApiRouter.get("/app-tests/:key/issues", async (req, res, next) => {
  try {
    const at = await prisma.appTest.findUnique({ where: whereFromKey("APP", req.params.key) as any, select: { id: true, number: true } });
    if (!at) throw new PublicApiError(404, "NOT_FOUND", "App test not found");
    const body = await scopeIssues({ appTestId: at.id }, req.query);
    res.set("Cache-Control", CACHE_HEADER).json({ key: `APP-${at.number}`, ...body });
  } catch (err) {
    next(err);
  }
});

publicApiRouter.get("/session-tests/:key", async (req, res, next) => {
  try {
    res.set("Cache-Control", CACHE_HEADER).json(await sessionTestPayload(req.params.key));
  } catch (err) {
    next(err);
  }
});

publicApiRouter.get("/session-tests/:key/issues", async (req, res, next) => {
  try {
    const st = await prisma.sessionTest.findUnique({ where: whereFromKey("ST", req.params.key) as any, select: { id: true, number: true } });
    if (!st) throw new PublicApiError(404, "NOT_FOUND", "Session test not found");
    const body = await scopeIssues({ sessionTestId: st.id }, req.query);
    res.set("Cache-Control", CACHE_HEADER).json({ key: `ST-${st.number}`, ...body });
  } catch (err) {
    next(err);
  }
});

publicApiRouter.get("/issues/:key", async (req, res, next) => {
  try {
    const issue = await prisma.issue.findUnique({
      where: whereFromKey("ISSUE", req.params.key) as any,
      include: {
        appTest: { select: { number: true } },
        sessionTest: { select: { number: true } },
        testCase: { select: { feature: { select: { project: { select: { id: true, name: true } } } } } },
      },
    });
    if (!issue) throw new PublicApiError(404, "NOT_FOUND", "Issue not found");
    const project = issue.testCase.feature.project;
    res.set("Cache-Control", CACHE_HEADER).json(mapIssue(issue as any, project));
  } catch (err) {
    next(err);
  }
});

// Anything else under the base path is a 404 in the same envelope, not HTML.
publicApiRouter.use((_req, _res, next) => next(new PublicApiError(404, "NOT_FOUND", "Unknown endpoint")));

/** Error handler for the public API only — keeps its envelope out of /graphql. */
export function publicApiErrorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const caller = (req as PublicApiRequest).publicApiCaller?.appId ?? null;
  if (err instanceof PublicApiError) {
    logger.info({ appId: caller, path: req.path, code: err.code, status: err.status }, "public API rejected");
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }
  // Unexpected: log the detail, return a generic message.
  logger.error({ err, appId: caller, path: req.path }, "public API failed");
  res.status(500).json({ error: { code: "INTERNAL", message: "Internal error" } });
}
