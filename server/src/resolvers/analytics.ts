import type { Context } from "../context.js";
import { requireAuth } from "../context.js";
import { featureCoverage, projectCoverage, allCoverage } from "../coverage.js";
import { slaTargets, classifyResolve } from "../sla.js";

// Build the issue `where` filter for the requested scope.
function issueWhere(projectId?: string | null, featureId?: string | null) {
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

export const analyticsResolvers = {
  Query: {
    async analytics(
      _: unknown,
      args: { projectId?: string | null; featureId?: string | null; from?: string | null; to?: string | null },
      ctx: Context,
    ) {
      requireAuth(ctx);
      const cacheKey = JSON.stringify([args.projectId ?? "", args.featureId ?? "", args.from ?? "", args.to ?? ""]);
      const hit = cache.get(cacheKey);
      if (hit && Date.now() - hit.at < CACHE_MS) return hit.val;
      const where: any = issueWhere(args.projectId, args.featureId);
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
      const prodResolved = issues.filter((i) => i.environment === "PRODUCTION" && i.resolvedAt);
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
      const prod = issues.filter((i) => i.environment === "PRODUCTION");
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

      // Confidence coverage for the scope.
      const confidence = args.featureId
        ? await featureCoverage(args.featureId)
        : args.projectId
          ? await projectCoverage(args.projectId)
          : await allCoverage();

      // Key coverage — features in scope.
      const features = await ctx.prisma.feature.findMany({
        where: args.featureId
          ? { id: args.featureId }
          : args.projectId
            ? { projectId: args.projectId }
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
      };
      cache.set(cacheKey, { at: Date.now(), val: result });
      return result;
    },
  },
};
