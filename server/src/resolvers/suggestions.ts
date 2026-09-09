import type { Context } from "../context.js";
import { requireAuth } from "../context.js";

// Distinct existing values for a form field, to power auto-suggest datalists.
// Passwords are intentionally never suggested.
export const suggestionsResolvers = {
  Query: {
    async suggestions(_: unknown, args: { field: string }, ctx: Context) {
      requireAuth(ctx);
      const uniq = (xs: (string | null)[]) =>
        [...new Set(xs.filter((v): v is string => !!v && v.trim() !== ""))].sort().slice(0, 100);

      if (args.field === "appVersion" || args.field === "backendVersion") {
        const col = args.field as "appVersion" | "backendVersion";
        const [issues, apps] = await Promise.all([
          ctx.prisma.issue.findMany({ distinct: [col], select: { [col]: true } }),
          ctx.prisma.appTest.findMany({ distinct: [col], select: { [col]: true } }),
        ]);
        return uniq([...issues.map((r) => (r as any)[col]), ...apps.map((r) => (r as any)[col])]);
      }
      if (args.field === "testAccount") {
        const rows = await ctx.prisma.issue.findMany({ distinct: ["testAccount"], select: { testAccount: true } });
        return uniq(rows.map((r) => r.testAccount));
      }
      if (args.field === "stakeholder") {
        const rows = await ctx.prisma.sessionTest.findMany({ select: { stakeholders: true } });
        return uniq(rows.flatMap((r) => r.stakeholders));
      }
      // Grouping labels are free text, so the datalist is what keeps a project
      // from growing "UI", "ui" and "U I" as three separate groups.
      if (args.field === "category") {
        const rows = await ctx.prisma.feature.findMany({ distinct: ["category"], select: { category: true } });
        return uniq(rows.map((r) => r.category));
      }
      if (args.field === "folder") {
        const rows = await ctx.prisma.testCase.findMany({ distinct: ["folder"], select: { folder: true } });
        return uniq(rows.map((r) => r.folder));
      }
      if (args.field === "appName") {
        const rows = await ctx.prisma.sessionTestApp.findMany({ distinct: ["name"], select: { name: true } });
        return uniq(rows.map((r) => r.name));
      }
      return [];
    },
  },
};
