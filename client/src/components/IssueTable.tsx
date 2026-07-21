import { useState, Fragment } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { SortableTh, nextSort } from "./SortableTh";
import { searchRows, sortRows, groupRows } from "../lib/list";
import { cn } from "../lib/utils";

function Badge({ children, variant = "muted" }: { children: any; variant?: "muted" | "primary" | "destructive" | "outline" }) {
  const c = {
    muted: "bg-muted text-muted-foreground",
    primary: "bg-primary text-primary-foreground",
    destructive: "bg-destructive text-white",
    outline: "border border-border text-muted-foreground",
  }[variant];
  return <span className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium", c)}>{children}</span>;
}

function SlaBadge({ s }: { s: string }) {
  if (s === "NA") return <span className="text-xs text-muted-foreground">—</span>;
  const map: Record<string, string> = {
    MET: "bg-[var(--good)] text-white",
    AT_RISK: "bg-[var(--warn)] text-white",
    BREACHED: "bg-destructive text-white",
  };
  const label = s === "AT_RISK" ? "At risk" : s.charAt(0) + s.slice(1).toLowerCase();
  return <span className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium", map[s] ?? "bg-muted")}>{label}</span>;
}

const small = "h-8 rounded border border-border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring";

function Filter({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-muted-foreground">{label}:</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={small}>
        <option value="">ALL</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </div>
  );
}
const STATUSES = ["OPEN", "IN_PROGRESS", "NEED_REVIEW", "IN_REVIEW", "CLOSED", "REOPENED", "HOLD"];
const PRIORITIES = ["LOW", "MEDIUM", "HIGH"];

export function IssueTable({ issues, loading, showPeople }: { issues: any[]; loading: boolean; showPeople?: boolean }) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fPriority, setFPriority] = useState("");
  const [fSla, setFSla] = useState("");
  const [fType, setFType] = useState("");
  const [sortKey, setSortKey] = useState("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [groupKey, setGroupKey] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggle = (l: string) => setCollapsed((p) => { const n = new Set(p); n.has(l) ? n.delete(l) : n.add(l); return n; });
  const onSort = (k: string) => { const n = nextSort({ key: sortKey, dir: sortDir }, k); setSortKey(n.key); setSortDir(n.dir); };

  let rows = searchRows(issues ?? [], search, ["title", "status", "priority"]);
  if (fStatus) rows = rows.filter((r: any) => r.status === fStatus);
  if (fPriority) rows = rows.filter((r: any) => r.priority === fPriority);
  if (fSla) rows = rows.filter((r: any) => r.slaStatus === fSla);
  if (fType) rows = rows.filter((r: any) => r.type === fType);
  rows = sortRows(rows, sortKey as any, sortDir);
  const groups: [string, any[]][] = groupKey ? Object.entries(groupRows(rows, groupKey as any)) : [["", rows]];
  const colCount = showPeople ? 9 : 7;
  const fmtDate = (iso: string) => new Date(iso).toLocaleString();

  return (
    <div>
      {/* Row 1: search ↔ group-by */}
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className={`${small} w-56 pl-7`} />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Group by:</span>
          <select value={groupKey} onChange={(e) => setGroupKey(e.target.value)} className={small}>
            <option value="">-</option>
            <option value="status">STATUS</option>
            <option value="priority">PRIORITY</option>
            <option value="type">TYPE</option>
          </select>
        </div>
      </div>
      {/* Row 2: filters */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Filter label="Status" value={fStatus} onChange={setFStatus} options={STATUSES} />
        <Filter label="Priority" value={fPriority} onChange={setFPriority} options={PRIORITIES} />
        <Filter label="Type" value={fType} onChange={setFType} options={["DEFECT", "BUG"]} />
        <Filter label="SLA" value={fSla} onChange={setFSla} options={["MET", "AT_RISK", "BREACHED", "NA"]} />
        <span className="ml-auto text-xs text-muted-foreground">{rows.length} issue(s)</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="w-8 px-3 py-2 text-left text-xs font-medium text-muted-foreground">#</th>
              <SortableTh label="Issue" colKey="title" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <SortableTh label="Type" colKey="type" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <SortableTh label="Priority" colKey="priority" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <SortableTh label="Status" colKey="status" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <SortableTh label="SLA" colKey="slaStatus" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <SortableTh label="Created" colKey="createdAt" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              {showPeople && <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Assignee</th>}
              {showPeople && <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Reporter</th>}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={colCount} className="py-8 text-center text-muted-foreground">Loading…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={colCount} className="py-8 text-center text-muted-foreground">No issues</td></tr>}
            {groups.map(([label, gr]) => (
              <Fragment key={label || "all"}>
                {groupKey && (
                  <tr className="cursor-pointer bg-muted/40 hover:bg-muted/60" onClick={() => toggle(label)}>
                    <td colSpan={colCount} className="px-3 py-1.5 text-xs font-medium text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        {collapsed.has(label) ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        {label} · {gr.length}
                      </span>
                    </td>
                  </tr>
                )}
                {!collapsed.has(label) && gr.map((i: any, idx: number) => (
                  <tr key={i.id} className="cursor-pointer border-b border-border/50 last:border-0 hover:bg-muted/30" onClick={() => navigate(`/issues/${i.id}`)}>
                    <td className="px-3 py-2 text-xs tabular-nums text-muted-foreground">{idx + 1}</td>
                    <td className="px-3 py-2 font-medium">{i.title}</td>
                    <td className="px-3 py-2"><Badge variant={i.type === "DEFECT" ? "destructive" : "outline"}>{i.type}</Badge></td>
                    <td className="px-3 py-2"><Badge variant="outline">{i.priority}</Badge></td>
                    <td className="px-3 py-2"><Badge>{i.status}</Badge></td>
                    <td className="px-3 py-2"><SlaBadge s={i.slaStatus} /></td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{fmtDate(i.createdAt)}</td>
                    {showPeople && <td className="px-3 py-2 text-muted-foreground">{i.assignee?.name ?? "—"}</td>}
                    {showPeople && <td className="px-3 py-2 text-muted-foreground">{i.reporter?.name ?? "—"}</td>}
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
