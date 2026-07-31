import { useState, Fragment } from "react";
import { useQuery } from "@apollo/client";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { drillPath } from "../store/nav";
import { ANALYTICS } from "../graphql/analytics";
import { SESSION_TESTS } from "../graphql/sessiontest";
import { PROJECTS, FEATURES } from "../graphql/hierarchy";
import { Printer, ChevronDown, ChevronRight } from "lucide-react";
import { FilterBar } from "../components/FilterBar";
import { SortableTh, nextSort } from "../components/SortableTh";
import { DateRangePicker } from "../components/DateRangePicker";
import { searchRows, sortRows } from "../lib/list";
import { printAnalyticsReport } from "../lib/printReport";
import { useAuth } from "../store/auth";

function fmtMins(m: number | null): string {
  if (m == null) return "—";
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${(m / 60).toFixed(1)}h`;
  return `${(m / 1440).toFixed(1)}d`;
}

function Stat({ n, label }: { n: string; label: string }) {
  return (
    <div className="rounded border border-border bg-card px-4 py-3">
      <div className="text-2xl font-semibold tabular-nums">{n}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function Card({ title, action, children }: { title: string; action?: any; children: any }) {
  return (
    <div className="rounded border border-border">
      <div className="flex items-center justify-between gap-2 border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

export default function Analytics() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [projectId, setProjectId] = useState<string>("");
  const [featureId, setFeatureId] = useState<string>("");
  const [sessionTestId, setSessionTestId] = useState<string>("");
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const { data: projData } = useQuery(PROJECTS);
  const { data: featData } = useQuery(FEATURES, { variables: { projectId }, skip: !projectId });
  const { data: sessData } = useQuery(SESSION_TESTS, { variables: { projectId: projectId || null }, skip: !projectId });
  const { data, loading } = useQuery(ANALYTICS, {
    variables: {
      projectId: projectId || null,
      featureId: featureId || null,
      sessionTestId: sessionTestId || null,
      from,
      to,
    },
    fetchPolicy: "cache-and-network",
  });

  const a = data?.analytics;
  const projectName = (id: string) =>
    (projData?.projects ?? []).find((p: any) => p.id === id)?.name ?? "—";
  // Print/PDF uses the same numbers already on screen; project names come from
  // the picker's data, so the report needs no extra query.
  const exportPdf = () => {
    if (!a) return;
    const scope = sessionTestId
      ? (sessData?.sessionTests ?? []).find((s2: any) => s2.id === sessionTestId)?.key ?? t("an.scopeAll")
      : featureId
        ? (featData?.features ?? []).find((f: any) => f.id === featureId)?.name ?? t("an.scopeAll")
        : projectId
          ? projectName(projectId)
          : t("an.scopeAll");
    printAnalyticsReport(
      { ...a, keyCoverage: (a.keyCoverage ?? []).map((k: any) => ({ ...k, projectName: projectName(k.projectId) })) },
      {
        scope,
        range: from || to ? `${from ?? "…"} → ${to ?? "…"}` : t("an.rangeAll"),
        printedBy: user?.name ?? "—",
      },
    );
  };
  const small = "h-8 rounded border border-border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring";

  const maxCvR = Math.max(1, ...(a?.createdVsResolved ?? []).flatMap((p: any) => [p.created, p.resolved]));
  const sla = a?.slaBreakdown ?? { met: 0, atRisk: 0, breached: 0 };
  const slaCount = sla.met + sla.atRisk + sla.breached;
  const hasSla = slaCount > 0;
  const slaTotal = Math.max(1, slaCount);
  const metPct = (sla.met / slaTotal) * 100;
  const riskPct = (sla.atRisk / slaTotal) * 100;
  // No production issues → neutral grey ring instead of a misleading full-red one.
  const slaGradient = hasSla
    ? `conic-gradient(var(--good) 0 ${metPct}%, var(--warn) ${metPct}% ${metPct + riskPct}%, var(--destructive) ${metPct + riskPct}% 100%)`
    : `conic-gradient(var(--muted) 0 100%)`;

  return (
    <div className="h-full space-y-4 overflow-y-auto p-6">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={projectId}
          onChange={(e) => {
            setProjectId(e.target.value);
            setFeatureId("");
            setSessionTestId("");
          }}
          className={small}
        >
          <option value="">{t("an.scopeAll")}</option>
          {(projData?.projects ?? []).map((p: any) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {projectId && (
          <select
            value={featureId}
            onChange={(e) => {
              setFeatureId(e.target.value);
              if (e.target.value) setSessionTestId("");
            }}
            className={small}
          >
            <option value="">{t("an.allFeatures")}</option>
            {(featData?.features ?? []).map((f: any) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        )}
        {/* A session is its own scope: picking one reports on that cycle only. */}
        {projectId && (
          <select
            value={sessionTestId}
            onChange={(e) => {
              setSessionTestId(e.target.value);
              if (e.target.value) setFeatureId("");
            }}
            className={small}
          >
            <option value="">{t("an.allSessions")}</option>
            {(sessData?.sessionTests ?? []).map((s2: any) => (
              <option key={s2.id} value={s2.id}>
                {s2.key} · {s2.kindLabel}
              </option>
            ))}
          </select>
        )}
        <div className="ml-auto flex items-center gap-2">
          <DateRangePicker from={from} to={to} onChange={(f, tt) => { setFrom(f); setTo(tt); }} />
          <button
            onClick={exportPdf}
            disabled={!a}
            className="flex h-8 items-center gap-1.5 rounded border border-border px-3 text-xs hover:bg-muted disabled:opacity-50"
          >
            <Printer className="h-3.5 w-3.5" /> {t("an.exportPdf")}
          </button>
        </div>
      </div>

      {loading && !a && <div className="text-sm text-muted-foreground">{t("c.loading")}</div>}

      {a && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat n={String(a.totalFindings)} label={t("an.totalFindings", { d: a.totalDefects, b: a.totalBugs })} />
            <Stat n={`${a.resolutionRate}%`} label={t("an.resolutionRate")} />
            <Stat n={fmtMins(a.avgResolveMins)} label={t("an.avgResolve")} />
            <Stat n={a.slaCompliance == null ? "—" : `${a.slaCompliance}%`} label={t("an.slaCompliance")} />
          </div>

          <Card title={t("an.createdVsResolved")}>
            {a.createdVsResolved.every((p: any) => p.created === 0 && p.resolved === 0) ? (
              <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                {t("an.noDataYet")}
              </div>
            ) : (
            <div className="flex h-40 items-stretch gap-3">
              {a.createdVsResolved.map((p: any) => (
                <div key={p.period} className="group relative flex h-full flex-1 flex-col items-center justify-end gap-1">
                  <div className="flex w-full flex-1 items-end justify-center gap-1">
                    <div
                      className="w-3 rounded-t bg-primary"
                      style={{ height: `${Math.max(p.created ? 2 : 0, (p.created / maxCvR) * 100)}%` }}
                    />
                    <div
                      className="w-3 rounded-t bg-muted-foreground/50"
                      style={{ height: `${Math.max(p.resolved ? 2 : 0, (p.resolved / maxCvR) * 100)}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground">{p.period.slice(5)}</span>
                  {/* instant hover tooltip */}
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded border border-border bg-background px-2 py-1 text-[10px] shadow-md group-hover:block">
                    <div className="font-medium">{p.period}</div>
                    <div className="text-muted-foreground">{t("an.tipCreatedResolved", { c: p.created, r: p.resolved })}</div>
                  </div>
                </div>
              ))}
            </div>
            )}
            <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-primary" />{t("an.created")}</span>
              <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-muted-foreground/50" />{t("an.resolved")}</span>
            </div>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card title={t("an.slaCompliance")}>
              <div className="flex items-center gap-5">
                <div className="group relative">
                  <div
                    className="flex h-28 w-28 items-center justify-center rounded-full"
                    style={{ background: slaGradient }}
                  >
                    <div className="flex h-[72px] w-[72px] flex-col items-center justify-center rounded-full bg-card">
                      <span className="text-lg font-semibold">{hasSla ? `${a.slaCompliance ?? 0}%` : "—"}</span>
                      <span className="text-[10px] text-muted-foreground">{hasSla ? t("an.metLower") : t("an.noDataShort")}</span>
                    </div>
                  </div>
                  {hasSla && (
                    <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded border border-border bg-background px-2 py-1 text-[10px] shadow-md group-hover:block">
                      <TipRow color="var(--good)" label={t("sla.met")} n={sla.met} total={slaCount} />
                      <TipRow color="var(--warn)" label={t("sla.atRisk")} n={sla.atRisk} total={slaCount} />
                      <TipRow color="var(--destructive)" label={t("sla.breached")} n={sla.breached} total={slaCount} />
                    </div>
                  )}
                </div>
                <div className="space-y-1.5 text-xs">
                  <Legend color="var(--good)" label={`${t("sla.met")} ${sla.met}`} />
                  <Legend color="var(--warn)" label={`${t("sla.atRisk")} ${sla.atRisk}`} />
                  <Legend color="var(--destructive)" label={`${t("sla.breached")} ${sla.breached}`} />
                </div>
              </div>
            </Card>

            <Card title={t("an.progressByStatus")}>
              <StatusPie breakdown={a.statusBreakdown} />
            </Card>
          </div>

          <Card title={t("an.confidenceCoverage")}>
            <div className="mb-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">{t("an.overallReadiness")}</span>
                <span className="text-muted-foreground">
                  {t("an.readinessDetail", { p: a.confidence.percent, passed: a.confidence.passed, total: a.confidence.total })}
                </span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-muted">
                <div className="h-2 rounded-full bg-primary" style={{ width: `${a.confidence.percent}%` }} />
              </div>
            </div>
            <KeyCoverageTable rows={a.keyCoverage} projectName={projectName} />
          </Card>

          <WorkloadSection rows={a.workload} />
        </>
      )}
    </div>
  );
}

// Distinct color per issue status (semantic, separate from the mono accent).
const STATUS_COLORS: Record<string, string> = {
  OPEN: "#1971c2",
  IN_PROGRESS: "#f08c00",
  NEED_REVIEW: "#ae3ec9",
  IN_REVIEW: "#1098ad",
  CLOSED: "#2f9e44",
  REOPENED: "#e03131",
  HOLD: "#868e96",
};

function StatusPie({ breakdown }: { breakdown: { status: string; count: number }[] }) {
  const { t } = useTranslation();
  const total = breakdown.reduce((s, b) => s + b.count, 0);
  if (total === 0) {
    return (
      <div className="flex items-center gap-5">
        <div className="flex h-28 w-28 items-center justify-center rounded-full" style={{ background: "var(--muted)" }}>
          <div className="flex h-[72px] w-[72px] flex-col items-center justify-center rounded-full bg-card">
            <span className="text-lg font-semibold">—</span>
            <span className="text-[10px] text-muted-foreground">{t("an.noDataShort")}</span>
          </div>
        </div>
        <span className="text-xs text-muted-foreground">{t("issue.none")}</span>
      </div>
    );
  }
  // Build conic-gradient segments in order.
  let acc = 0;
  const stops = breakdown
    .map((b) => {
      const start = (acc / total) * 100;
      acc += b.count;
      const end = (acc / total) * 100;
      const color = STATUS_COLORS[b.status] ?? "#868e96";
      return `${color} ${start}% ${end}%`;
    })
    .join(", ");

  return (
    <div className="flex flex-wrap items-center gap-5">
      <div className="group relative">
        <div className="flex h-28 w-28 items-center justify-center rounded-full" style={{ background: `conic-gradient(${stops})` }}>
          <div className="flex h-[72px] w-[72px] flex-col items-center justify-center rounded-full bg-card">
            <span className="text-lg font-semibold tabular-nums">{total}</span>
            <span className="text-[10px] text-muted-foreground">{t("an.issuesLower")}</span>
          </div>
        </div>
        <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded border border-border bg-background px-2 py-1 text-[10px] shadow-md group-hover:block">
          {breakdown.map((b) => (
            <div key={b.status} className="flex items-center gap-1.5">
              <i className="inline-block h-2 w-2 rounded-sm" style={{ background: STATUS_COLORS[b.status] ?? "#868e96" }} />
              <span>{b.status}</span>
              <span className="tabular-nums text-muted-foreground">{b.count} ({Math.round((b.count / total) * 100)}%)</span>
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-1.5 text-xs">
        {breakdown.map((b) => (
          <div key={b.status} className="flex items-center gap-1.5">
            <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: STATUS_COLORS[b.status] ?? "#868e96" }} />
            <span className="text-muted-foreground">{b.status}</span>
            <span className="tabular-nums">{b.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function KeyCoverageTable({ rows, projectName }: { rows: any[]; projectName: (id: string) => string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const openFeature = (r: any) => {
    navigate(drillPath({ projectId: r.projectId, featureId: r.featureId }));
  };
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const onSort = (key: string) => {
    const n = nextSort({ key: sortKey, dir: sortDir }, key);
    setSortKey(n.key);
    setSortDir(n.dir);
  };
  const toggle = (label: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });
  const list = sortRows(searchRows(rows ?? [], search, ["name"]), sortKey as any, sortDir);
  // Features always belong to a project, so they read as groups — and at "all
  // projects" scope a flat list of feature names is ambiguous without it.
  const groups = new Map<string, any[]>();
  for (const k of list) {
    const label = projectName(k.projectId);
    groups.set(label, [...(groups.get(label) ?? []), k]);
  }

  return (
    <div>
      <FilterBar search={search} onSearch={setSearch} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="w-8 px-3 py-2 text-left text-xs font-medium text-muted-foreground">#</th>
              <SortableTh label={t("dash.feature")} colKey="name" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <SortableTh label={t("dash.passPct")} colKey="percent" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <SortableTh label={t("an.minPct")} colKey="min" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <SortableTh label={t("an.passed")} colKey="passed" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <SortableTh label={t("dash.ready")} colKey="ready" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-muted-foreground">{t("an.noFeatures")}</td>
              </tr>
            )}
            {[...groups].map(([label, gr]) => (
              <Fragment key={label}>
                <tr className="cursor-pointer bg-muted/40 hover:bg-muted/60" onClick={() => toggle(label)}>
                  <td colSpan={6} className="px-3 py-1.5 text-xs font-medium text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      {collapsed.has(label) ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      {label} · {gr.length}
                    </span>
                  </td>
                </tr>
                {!collapsed.has(label) && gr.map((k: any, idx: number) => (
              <tr key={k.featureId} className="border-b border-border/50 last:border-0 hover:bg-muted/30">
                <td className="px-3 py-2 text-xs tabular-nums text-muted-foreground">{idx + 1}</td>
                <td className="px-3 py-2">
                  <button onClick={() => openFeature(k)} className="font-medium hover:underline">
                    {k.name}
                  </button>
                </td>
                <td className="px-3 py-2 tabular-nums">
                  <span className={k.percent >= k.min ? "text-foreground" : "text-destructive"}>{k.percent}%</span>
                </td>
                <td className="px-3 py-2 tabular-nums text-muted-foreground">{k.min}%</td>
                <td className="px-3 py-2 tabular-nums text-muted-foreground">{k.passed}/{k.total}</td>
                <td className="px-3 py-2">
                  <span
                    className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${
                      k.ready ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground"
                    }`}
                  >
                    {k.ready ? t("dash.ready") : t("dash.below")}
                  </span>
                </td>
              </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Work by person, split per role: what QA does, what a QA lead does and what an
// engineer does are different jobs, so one shared row of columns would be mostly
// blank. Each role gets its own table with only the columns that mean something
// for it.
const WORKLOAD_COLUMNS: Record<string, { key: string; label: string; mins?: boolean }[]> = {
  QA: [
    { key: "testCasesCreated", label: "an.wTestCases" },
    { key: "recordsRun", label: "an.wRuns" },
    { key: "issuesReported", label: "an.wReported" },
  ],
  QA_LEAD: [
    { key: "approvals", label: "an.wApprovals" },
    { key: "testCasesCreated", label: "an.wTestCases" },
    { key: "recordsRun", label: "an.wRuns" },
    { key: "issuesReported", label: "an.wReported" },
  ],
  ENGINEER: [
    { key: "appTestsSubmitted", label: "an.wAppTests" },
    { key: "issuesAssigned", label: "an.wAssigned" },
    { key: "issuesResolved", label: "an.wResolved" },
    { key: "avgResolveMins", label: "an.wAvgResolve", mins: true },
  ],
  ADMIN: [
    { key: "approvals", label: "an.wApprovals" },
    { key: "testCasesCreated", label: "an.wTestCases" },
    { key: "recordsRun", label: "an.wRuns" },
    { key: "issuesReported", label: "an.wReported" },
    { key: "issuesResolved", label: "an.wResolved" },
  ],
};
WORKLOAD_COLUMNS.SUPER_ADMIN = WORKLOAD_COLUMNS.ADMIN;
WORKLOAD_COLUMNS.VIEWER = [];
// Role order matches the sidebar's sense of seniority, not the alphabet.
const ROLE_ORDER = ["QA_LEAD", "QA", "ENGINEER", "ADMIN", "SUPER_ADMIN", "VIEWER"];

function RoleWorkloadCard({ role, rows }: { role: string; rows: any[] }) {
  const { t } = useTranslation();
  const [sortKey, setSortKey] = useState("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const onSort = (key: string) => {
    const n = nextSort({ key: sortKey, dir: sortDir }, key);
    setSortKey(n.key);
    setSortDir(n.dir);
  };
  const cols = WORKLOAD_COLUMNS[role] ?? WORKLOAD_COLUMNS.QA;
  const list = sortRows(rows, sortKey as any, sortDir);

  return (
    <Card title={`${role} · ${rows.length}`}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <SortableTh label={t("an.wPerson")} colKey="name" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              {cols.map((c) => (
                <SortableTh key={c.key} label={t(c.label)} colKey={c.key} sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              ))}
            </tr>
          </thead>
          <tbody>
            {list.map((w: any) => (
              <tr key={w.userId} className="border-b border-border/50 last:border-0 hover:bg-muted/30">
                <td className="px-3 py-2 font-medium">{w.name}</td>
                {cols.map((c) => (
                  <td key={c.key} className="px-3 py-2 tabular-nums">
                    {c.mins ? fmtMins(w[c.key]) : w[c.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function WorkloadSection({ rows }: { rows: any[] }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const list = searchRows(rows ?? [], search, ["name", "role"]);
  const byRole = new Map<string, any[]>();
  for (const w of list) byRole.set(w.role, [...(byRole.get(w.role) ?? []), w]);
  const roles = [...byRole.keys()].sort((a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b));

  return (
    <div className="space-y-4">
      {/* One card per role: the same search narrows them all, but each role keeps
          its own header, columns and sort. */}
      <div className="rounded border border-border px-5 py-4">
        <div className="mb-3 text-sm font-semibold">{t("an.workload")}</div>
        <FilterBar search={search} onSearch={setSearch} />
        {roles.length === 0 && <div className="text-sm text-muted-foreground">{t("an.noDataYet")}</div>}
      </div>
      {roles.map((role) => (
        <RoleWorkloadCard key={role} role={role} rows={byRole.get(role)!} />
      ))}
    </div>
  );
}

// Distinct color per issue status (semantic, separate from the mono accent).
function TipRow({ color, label, n, total }: { color: string; label: string; n: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <i className="inline-block h-2 w-2 rounded-sm" style={{ background: color }} />
      <span>{label}</span>
      <span className="tabular-nums text-muted-foreground">{n} ({total ? Math.round((n / total) * 100) : 0}%)</span>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
      {label}
    </div>
  );
}
