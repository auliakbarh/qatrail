import { useState } from "react";
import { useQuery } from "@apollo/client";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useNav } from "../store/nav";
import { ANALYTICS } from "../graphql/analytics";
import { PROJECTS, FEATURES } from "../graphql/hierarchy";
import { FilterBar } from "../components/FilterBar";
import { SortableTh, nextSort } from "../components/SortableTh";
import { DateRangePicker } from "../components/DateRangePicker";
import { searchRows, sortRows } from "../lib/list";

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
  const [projectId, setProjectId] = useState<string>("");
  const [featureId, setFeatureId] = useState<string>("");
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const { data: projData } = useQuery(PROJECTS);
  const { data: featData } = useQuery(FEATURES, { variables: { projectId }, skip: !projectId });
  const { data, loading } = useQuery(ANALYTICS, {
    variables: { projectId: projectId || null, featureId: featureId || null, from, to },
    fetchPolicy: "cache-and-network",
  });

  const a = data?.analytics;
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
          <select value={featureId} onChange={(e) => setFeatureId(e.target.value)} className={small}>
            <option value="">{t("an.allFeatures")}</option>
            {(featData?.features ?? []).map((f: any) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        )}
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

          <Card
            title={t("an.createdVsResolved")}
            action={<DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />}
          >
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
            <KeyCoverageTable rows={a.keyCoverage} />
          </Card>
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

function KeyCoverageTable({ rows }: { rows: any[] }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const openFeature = (r: any) => {
    useNav.setState({ projectId: r.projectId, featureId: r.featureId, testCaseId: null, issueId: null, panel: null });
    navigate("/");
  };
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const onSort = (key: string) => {
    const n = nextSort({ key: sortKey, dir: sortDir }, key);
    setSortKey(n.key);
    setSortDir(n.dir);
  };
  const list = sortRows(searchRows(rows ?? [], search, ["name"]), sortKey as any, sortDir);

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
            {list.map((k: any, idx: number) => (
              <tr key={k.name} className="border-b border-border/50 last:border-0 hover:bg-muted/30">
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
          </tbody>
        </table>
      </div>
    </div>
  );
}

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
