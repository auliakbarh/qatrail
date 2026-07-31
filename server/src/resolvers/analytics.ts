import type { Context } from "../context.js";
import { requireAuth } from "../context.js";
import { featureCoverage, projectCoverage, allCoverage, sessionTestCoverage } from "../coverage.js";
import { slaTargets, classifyResolve, slaApplies } from "../sla.js";

// Build the issue `where` filter for the requested scope. A session is the most
// specific scope: only findings raised inside that testing session count.
function issueWhere(projectId?: string | null, featureId?: string | null, sessionTestId?: string | null) {
  if (sessionTestId) return { sessionTestId, archived: false };
  if (featureId) return { testCase: { featureId }, archived: false };
  if (projectId) return { testCase: { feature: { projectId } }, archived: false };
  return { archived: false };
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// TTL cache: analytics scans all in-scope issues + coverage on every load. Cache
// the computed result per (scope, range) for a short window. Staleness ≤ TTL is
// fine — the client also refetches (cache-and-network).
const CACHE_MS = 30_000;
const cache = new Map<string, { at: number; val: any }>();

// Who did what in this scope and window: one row per person who shows up at all.
// Counts come from grouped queries — no per-user round trips — and the row keeps
// every column so one table can serve QA, QA lead and engineer work alike.
async function workloadRows(
  ctx: Context,
  s: {
    projectId?: string | null;
    featureId?: string | null;
    sessionTestId?: string | null;
    from?: string | null;
    to?: string | null;
  },
) {
  const range =
    s.from || s.to
      ? {
          ...(s.from ? { gte: new Date(s.from) } : {}),
          ...(s.to ? { lte: new Date(s.to.length === 10 ? `${s.to}T23:59:59.999Z` : s.to) } : {}),
        }
      : undefined;
  // Test case / record scope. A session narrows runs to that session; test cases
  // themselves have no session, so they stay at project scope.
  const caseScope = s.featureId
    ? { featureId: s.featureId }
    : s.projectId
      ? { feature: { projectId: s.projectId } }
      : {};
  const recordScope = s.sessionTestId ? { sessionTestId: s.sessionTestId } : { testCase: caseScope };

  const [cases, records, reported, assigned, resolvedIssues, reviews, requestReviews, appTests] = await Promise.all([
    ctx.prisma.testCase.groupBy({
      by: ["createdById"],
      where: { ...caseScope, ...(range ? { createdAt: range } : {}) },
      _count: { _all: true },
    }),
    ctx.prisma.recordTest.groupBy({
      by: ["executedById"],
      where: { ...recordScope, ...(range ? { executedAt: range } : {}) },
      _count: { _all: true },
    }),
    ctx.prisma.issue.groupBy({
      by: ["reporterId"],
      where: { ...issueWhere(s.projectId, s.featureId, s.sessionTestId), ...(range ? { createdAt: range } : {}) },
      _count: { _all: true },
    }),
    ctx.prisma.issue.groupBy({
      by: ["assigneeId"],
      where: { ...issueWhere(s.projectId, s.featureId, s.sessionTestId), ...(range ? { createdAt: range } : {}) },
      _count: { _all: true },
    }),
    // Resolve time is the engineer's number, so it's measured per assignee.
    ctx.prisma.issue.findMany({
      where: {
        ...issueWhere(s.projectId, s.featureId, s.sessionTestId),
        resolvedAt: { not: null, ...(range ?? {}) },
      },
      select: { assigneeId: true, createdAt: true, resolvedAt: true },
    }),
    ctx.prisma.testCase.groupBy({
      by: ["reviewedById"],
      where: { ...caseScope, reviewedById: { not: null }, ...(range ? { reviewedAt: range } : {}) },
      _count: { _all: true },
    }),
    // Requests carry the project they were made in, so this narrows with the
    // scope like every other column. Rows from before that column existed have a
    // null projectId and only show up at "all projects".
    ctx.prisma.approvalRequest.groupBy({
      by: ["reviewedById"],
      where: {
        reviewedById: { not: null },
        state: { not: "PENDING" },
        ...(s.projectId ? { projectId: s.projectId } : {}),
        ...(range ? { reviewedAt: range } : {}),
      },
      _count: { _all: true },
    }),
    ctx.prisma.appTest.groupBy({
      by: ["createdById"],
      where: { ...(s.projectId ? { projectId: s.projectId } : {}), ...(range ? { createdAt: range } : {}) },
      _count: { _all: true },
    }),
  ]);

  type Row = {
    userId: string;
    name: string;
    role: string;
    testCasesCreated: number;
    recordsRun: number;
    issuesReported: number;
    approvals: number;
    appTestsSubmitted: number;
    issuesAssigned: number;
    issuesResolved: number;
    avgResolveMins: number | null;
  };
  const rows = new Map<string, Row>();
  const row = (id: string): Row => {
    let r = rows.get(id);
    if (!r) {
      r = {
        userId: id, name: "", role: "",
        testCasesCreated: 0, recordsRun: 0, issuesReported: 0, approvals: 0,
        appTestsSubmitted: 0, issuesAssigned: 0, issuesResolved: 0, avgResolveMins: null,
      };
      rows.set(id, r);
    }
    return r;
  };
  for (const g of cases) row(g.createdById).testCasesCreated = g._count._all;
  for (const g of records) row(g.executedById).recordsRun = g._count._all;
  for (const g of reported) row(g.reporterId).issuesReported = g._count._all;
  for (const g of assigned) row(g.assigneeId).issuesAssigned = g._count._all;
  for (const g of reviews) if (g.reviewedById) row(g.reviewedById).approvals += g._count._all;
  for (const g of requestReviews) if (g.reviewedById) row(g.reviewedById).approvals += g._count._all;
  for (const g of appTests) row(g.createdById).appTestsSubmitted = g._count._all;

  const resolveMins = new Map<string, number[]>();
  for (const i of resolvedIssues) {
    const mins = (i.resolvedAt!.getTime() - i.createdAt.getTime()) / 60000;
    resolveMins.set(i.assigneeId, [...(resolveMins.get(i.assigneeId) ?? []), mins]);
  }
  for (const [id, mins] of resolveMins) {
    const r = row(id);
    r.issuesResolved = mins.length;
    r.avgResolveMins = Math.round(mins.reduce((a, b) => a + b, 0) / mins.length);
  }

  const users = await ctx.prisma.user.findMany({
    where: { id: { in: [...rows.keys()] } },
    select: { id: true, name: true, role: true },
  });
  for (const u of users) {
    const r = rows.get(u.id)!;
    r.name = u.name;
    r.role = u.role;
  }
  // Deleted users would come back nameless; drop them rather than show a blank row.
  return [...rows.values()]
    .filter((r) => r.name)
    .sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name));
}

export const analyticsResolvers = {
  Query: {
    async analytics(
      _: unknown,
      args: {
        projectId?: string | null;
        featureId?: string | null;
        sessionTestId?: string | null;
        from?: string | null;
        to?: string | null;
      },
      ctx: Context,
    ) {
      requireAuth(ctx);
      const cacheKey = JSON.stringify([
        args.projectId ?? "",
        args.featureId ?? "",
        args.sessionTestId ?? "",
        args.from ?? "",
        args.to ?? "",
      ]);
      const hit = cache.get(cacheKey);
      if (hit && Date.now() - hit.at < CACHE_MS) return hit.val;
      const where: any = issueWhere(args.projectId, args.featureId, args.sessionTestId);
      // Date range scopes findings by creation date (inclusive of the end day).
      if (args.from || args.to) {
        where.createdAt = {};
        if (args.from) where.createdAt.gte = new Date(args.from);
        if (args.to) where.createdAt.lte = new Date(args.to.length === 10 ? `${args.to}T23:59:59.999Z` : args.to);
      }
      const issues = await ctx.prisma.issue.findMany({
        where,
        select: {
          type: true,
          status: true,
          environment: true,
          isProductionIssue: true,
          priority: true,
          createdAt: true,
          respondedAt: true,
          resolvedAt: true,
        },
      });

      const total = issues.length;
      const totalDefects = issues.filter((i) => i.type === "DEFECT").length;
      const totalBugs = total - totalDefects;
      const resolved = issues.filter((i) => i.resolvedAt != null).length;
      const resolutionRate = total === 0 ? 0 : Math.round((resolved / total) * 100);

      // Avg resolve time (production, resolved).
      const prodResolved = issues.filter((i) => slaApplies(i) && i.resolvedAt);
      const avgResolveMins =
        prodResolved.length === 0
          ? null
          : Math.round(
              prodResolved.reduce((s, i) => s + (i.resolvedAt!.getTime() - i.createdAt.getTime()) / 60000, 0) /
                prodResolved.length,
            );

      // SLA (production).
      const now = new Date();
      const targets = await slaTargets();
      const prod = issues.filter(slaApplies);
      let met = 0,
        atRisk = 0,
        breached = 0;
      for (const i of prod) {
        const b = classifyResolve(i, targets, now);
        if (b === "met") met += 1;
        else if (b === "atRisk") atRisk += 1;
        else breached += 1;
      }
      const slaCompliance = prod.length === 0 ? null : Math.round((met / prod.length) * 100);

      // Status breakdown.
      const statusMap: Record<string, number> = {};
      for (const i of issues) statusMap[i.status] = (statusMap[i.status] ?? 0) + 1;
      const statusBreakdown = Object.entries(statusMap).map(([status, count]) => ({ status, count }));

      // Created vs resolved — months across [from, to], else last 6 months.
      const months: string[] = [];
      if (args.from && args.to) {
        const start = new Date(args.from);
        const end = new Date(args.to);
        let y = start.getUTCFullYear();
        let m = start.getUTCMonth();
        const ey = end.getUTCFullYear();
        const em = end.getUTCMonth();
        let guard = 0;
        while ((y < ey || (y === ey && m <= em)) && guard++ < 36) {
          months.push(`${y}-${String(m + 1).padStart(2, "0")}`);
          m++;
          if (m > 11) { m = 0; y++; }
        }
      } else {
        for (let k = 5; k >= 0; k--) {
          const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - k, 1));
          months.push(monthKey(d));
        }
      }
      const createdVsResolved = months.map((period) => ({
        period,
        created: issues.filter((i) => monthKey(i.createdAt) === period).length,
        resolved: issues.filter((i) => i.resolvedAt && monthKey(i.resolvedAt) === period).length,
      }));

      // A session scope reports on its own cases; its project still drives the
      // per-feature breakdown below.
      const sessionProjectId = args.sessionTestId
        ? (await ctx.prisma.sessionTest.findUnique({ where: { id: args.sessionTestId }, select: { projectId: true } }))
            ?.projectId ?? null
        : null;

      // Confidence coverage for the scope.
      const confidence = args.sessionTestId
        ? await sessionTestCoverage(args.sessionTestId)
        : args.featureId
          ? await featureCoverage(args.featureId)
          : args.projectId
            ? await projectCoverage(args.projectId)
            : await allCoverage();

      // Key coverage — features in scope.
      const features = await ctx.prisma.feature.findMany({
        where: args.featureId
          ? { id: args.featureId }
          : (args.projectId ?? sessionProjectId)
            ? { projectId: (args.projectId ?? sessionProjectId)! }
            : {},
        select: { id: true, projectId: true, name: true, minPassPercent: true },
        orderBy: { name: "asc" },
      });
      const keyCoverage = await Promise.all(
        features.map(async (f) => {
          const cov = await featureCoverage(f.id);
          return {
            featureId: f.id,
            projectId: f.projectId,
            name: f.name,
            percent: cov.percent,
            passed: cov.passed,
            total: cov.total,
            min: f.minPassPercent,
            ready: cov.percent >= f.minPassPercent,
          };
        }),
      );

      const workload = await workloadRows(ctx, {
        projectId: args.projectId ?? sessionProjectId,
        featureId: args.featureId,
        sessionTestId: args.sessionTestId,
        from: args.from,
        to: args.to,
      });

      const result = {
        totalFindings: total,
        totalDefects,
        totalBugs,
        resolutionRate,
        avgResolveMins,
        slaCompliance,
        confidence,
        statusBreakdown,
        slaBreakdown: { met, atRisk, breached },
        createdVsResolved,
        keyCoverage,
        workload,
      };
      cache.set(cacheKey, { at: Date.now(), val: result });
      return result;
    },
  },
};
