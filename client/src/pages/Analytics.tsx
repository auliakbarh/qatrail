import { useState } from "react";
import { useQuery } from "@apollo/client";
import { ANALYTICS } from "../graphql/analytics";
import { PROJECTS, FEATURES } from "../graphql/hierarchy";

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

function Card({ title, children }: { title: string; children: any }) {
  return (
    <div className="rounded border border-border">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

export default function Analytics() {
  const [projectId, setProjectId] = useState<string>("");
  const [featureId, setFeatureId] = useState<string>("");
  const { data: projData } = useQuery(PROJECTS);
  const { data: featData } = useQuery(FEATURES, { variables: { projectId }, skip: !projectId });
  const { data, loading } = useQuery(ANALYTICS, {
    variables: { projectId: projectId || null, featureId: featureId || null },
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
          <option value="">Scope: All</option>
          {(projData?.projects ?? []).map((p: any) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {projectId && (
          <select value={featureId} onChange={(e) => setFeatureId(e.target.value)} className={small}>
            <option value="">All features</option>
            {(featData?.features ?? []).map((f: any) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {loading && !a && <div className="text-sm text-muted-foreground">Loading…</div>}

      {a && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat n={String(a.totalFindings)} label={`Total findings · ${a.totalDefects} defect / ${a.totalBugs} bug`} />
            <Stat n={`${a.resolutionRate}%`} label="Resolution rate" />
            <Stat n={fmtMins(a.avgResolveMins)} label="Avg resolve (prod)" />
            <Stat n={a.slaCompliance == null ? "—" : `${a.slaCompliance}%`} label="SLA compliance (prod)" />
          </div>

          <Card title="Created vs resolved (6 mo)">
            <div className="flex h-40 items-end gap-3">
              {a.createdVsResolved.map((p: any) => (
                <div key={p.period} className="flex flex-1 flex-col items-center justify-end gap-1">
                  <div className="flex h-full w-full items-end justify-center gap-1">
                    <div
                      className="w-3 rounded-t bg-primary"
                      style={{ height: `${(p.created / maxCvR) * 100}%` }}
                      title={`created ${p.created}`}
                    />
                    <div
                      className="w-3 rounded-t bg-muted-foreground/50"
                      style={{ height: `${(p.resolved / maxCvR) * 100}%` }}
                      title={`resolved ${p.resolved}`}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground">{p.period.slice(5)}</span>
                </div>
              ))}
            </div>
            <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-primary" />Created</span>
              <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-muted-foreground/50" />Resolved</span>
            </div>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card title="SLA compliance (prod)">
              <div className="flex items-center gap-5">
                <div
                  className="flex h-28 w-28 items-center justify-center rounded-full"
                  style={{ background: slaGradient }}
                >
                  <div className="flex h-[72px] w-[72px] flex-col items-center justify-center rounded-full bg-card">
                    <span className="text-lg font-semibold">{hasSla ? `${a.slaCompliance ?? 0}%` : "—"}</span>
                    <span className="text-[10px] text-muted-foreground">{hasSla ? "met" : "no data"}</span>
                  </div>
                </div>
                <div className="space-y-1.5 text-xs">
                  <Legend color="var(--good)" label={`Met ${sla.met}`} />
                  <Legend color="var(--warn)" label={`At risk ${sla.atRisk}`} />
                  <Legend color="var(--destructive)" label={`Breached ${sla.breached}`} />
                </div>
              </div>
            </Card>

            <Card title="Progress by status">
              <StatusPie breakdown={a.statusBreakdown} />
            </Card>
          </div>

          <Card title="Confidence / Key coverage">
            <div className="mb-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">Overall readiness</span>
                <span className="text-muted-foreground">
                  {a.confidence.percent}% ({a.confidence.passed}/{a.confidence.total} test cases)
                </span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-muted">
                <div className="h-2 rounded-full bg-primary" style={{ width: `${a.confidence.percent}%` }} />
              </div>
            </div>
            <div className="space-y-1.5">
              {a.keyCoverage.length === 0 && <div className="text-xs text-muted-foreground">No features</div>}
              {a.keyCoverage.map((k: any) => (
                <div key={k.name} className="flex items-center gap-2 text-xs">
                  <span className="w-40 shrink-0 truncate">{k.name}</span>
                  <div className="h-1.5 flex-1 rounded-full bg-muted">
                    <div className="h-1.5 rounded-full bg-primary" style={{ width: `${k.percent}%` }} />
                  </div>
                  <span className="w-24 text-right tabular-nums text-muted-foreground">
                    {k.percent}% · {k.passed}/{k.total}
                  </span>
                  <span
                    className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${
                      k.ready ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground"
                    }`}
                  >
                    {k.ready ? "Ready" : "Below"}
                  </span>
                </div>
              ))}
            </div>
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
  const total = breakdown.reduce((s, b) => s + b.count, 0);
  if (total === 0) {
    return (
      <div className="flex items-center gap-5">
        <div className="flex h-28 w-28 items-center justify-center rounded-full" style={{ background: "var(--muted)" }}>
          <div className="flex h-[72px] w-[72px] flex-col items-center justify-center rounded-full bg-card">
            <span className="text-lg font-semibold">—</span>
            <span className="text-[10px] text-muted-foreground">no data</span>
          </div>
        </div>
        <span className="text-xs text-muted-foreground">No issues</span>
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
      <div className="flex h-28 w-28 items-center justify-center rounded-full" style={{ background: `conic-gradient(${stops})` }}>
        <div className="flex h-[72px] w-[72px] flex-col items-center justify-center rounded-full bg-card">
          <span className="text-lg font-semibold tabular-nums">{total}</span>
          <span className="text-[10px] text-muted-foreground">issues</span>
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

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
      {label}
    </div>
  );
}
