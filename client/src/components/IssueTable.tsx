import { useState, useEffect } from "react";
import { useQuery, useApolloClient } from "@apollo/client";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Search, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { SortableTh, nextSort } from "./SortableTh";
import { ISSUES_PAGED } from "../graphql/issue";
import { downloadCsv } from "../lib/csv";
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
  const { t } = useTranslation();
  if (s === "NA") return <span className="text-xs text-muted-foreground">—</span>;
  const map: Record<string, string> = {
    MET: "bg-[var(--good)] text-white",
    AT_RISK: "bg-[var(--warn)] text-white",
    BREACHED: "bg-destructive text-white",
  };
  const labels: Record<string, string> = { MET: t("sla.met"), AT_RISK: t("sla.atRisk"), BREACHED: t("sla.breached") };
  return <span className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium", map[s] ?? "bg-muted")}>{labels[s] ?? s}</span>;
}

const small = "h-8 rounded border border-border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring";
const STATUSES = ["OPEN", "IN_PROGRESS", "NEED_REVIEW", "IN_REVIEW", "CLOSED", "REOPENED", "HOLD"];
const PRIORITIES = ["LOW", "MEDIUM", "HIGH"];
const PAGE_SIZE = 25;

function Filter({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-muted-foreground">{label}:</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={small}>
        <option value="">{t("c.all")}</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

// Server-driven issue table: search + status/priority/type filters + header sort +
// pagination all run in the API (scales to large datasets).
export function IssueTable({ scope }: { scope: "all" | "assigned" }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const apollo = useApolloClient();
  const showPeople = scope === "all";
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fPriority, setFPriority] = useState("");
  const [fType, setFType] = useState("");
  const [sortKey, setSortKey] = useState("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);

  // Debounce the search box.
  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(id);
  }, [searchInput]);
  // Any filter/sort change resets to page 1.
  useEffect(() => setPage(1), [search, fStatus, fPriority, fType, sortKey, sortDir]);

  const { data, loading } = useQuery(ISSUES_PAGED, {
    variables: {
      scope,
      filter: { search: search || null, status: fStatus || null, priority: fPriority || null, type: fType || null },
      sort: sortKey,
      dir: sortDir,
      page,
      pageSize: PAGE_SIZE,
    },
    fetchPolicy: "cache-and-network",
  });

  const onSort = (k: string) => { const n = nextSort({ key: sortKey, dir: sortDir }, k); setSortKey(n.key); setSortDir(n.dir); };

  // Export all rows matching the current filters (not just the page).
  const exportCsv = async () => {
    const res = await apollo.query({
      query: ISSUES_PAGED,
      variables: {
        scope,
        filter: { search: search || null, status: fStatus || null, priority: fPriority || null, type: fType || null },
        sort: sortKey, dir: sortDir, page: 1, pageSize: 5000,
      },
      fetchPolicy: "network-only",
    });
    const items = res.data?.issuesPaged?.items ?? [];
    downloadCsv(
      `issues-${scope}.csv`,
      ["ID", "Title", "Type", "Priority", "Status", "SLA", "Environment", "Platform", "Assignee", "Reporter", "Created"],
      items.map((i: any) => [i.key, i.title, i.type, i.priority, i.status, i.slaStatus, i.environment, i.platform, i.assignee?.name, i.reporter?.name, new Date(i.createdAt).toISOString()]),
    );
  };
  const rows = data?.issuesPaged?.items ?? [];
  const total = data?.issuesPaged?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const colCount = showPeople ? 10 : 8;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder={t("c.search")} className={`${small} w-56 pl-7`} />
        </div>
        <Filter label={t("c.status")} value={fStatus} onChange={setFStatus} options={STATUSES} />
        <Filter label={t("c.priority")} value={fPriority} onChange={setFPriority} options={PRIORITIES} />
        <Filter label={t("c.type")} value={fType} onChange={setFType} options={["DEFECT", "BUG"]} />
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-muted-foreground">{t("issue.count", { n: total })}</span>
          <button onClick={exportCsv} className="flex h-8 items-center gap-1.5 rounded border border-border px-2 text-xs hover:bg-muted">
            <Download className="h-3.5 w-3.5" /> {t("export.csv")}
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="w-8 px-3 py-2 text-left text-xs font-medium text-muted-foreground">#</th>
              <SortableTh label={t("c.id")} colKey="key" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <SortableTh label={t("issue.colIssue")} colKey="title" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <SortableTh label={t("c.type")} colKey="type" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <SortableTh label={t("c.priority")} colKey="priority" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <SortableTh label={t("c.status")} colKey="status" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("c.sla")}</th>
              <SortableTh label={t("c.created")} colKey="createdAt" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              {showPeople && <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("c.assignee")}</th>}
              {showPeople && <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("c.reporter")}</th>}
            </tr>
          </thead>
          <tbody>
            {loading && !data && <tr><td colSpan={colCount} className="py-8 text-center text-muted-foreground">{t("c.loading")}</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={colCount} className="py-8 text-center text-muted-foreground">{t("issue.none")}</td></tr>}
            {rows.map((i: any, idx: number) => (
              <tr key={i.id} className="cursor-pointer border-b border-border/50 last:border-0 hover:bg-muted/30" onClick={() => navigate(`/issues/${i.id}`)}>
                <td className="px-3 py-2 text-xs tabular-nums text-muted-foreground">{(page - 1) * PAGE_SIZE + idx + 1}</td>
                <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{i.key}</td>
                <td className="px-3 py-2 font-medium">{i.title}</td>
                <td className="px-3 py-2"><Badge variant={i.type === "DEFECT" ? "destructive" : "outline"}>{i.type}</Badge></td>
                <td className="px-3 py-2"><Badge variant="outline">{i.priority}</Badge></td>
                <td className="px-3 py-2"><Badge>{i.status}</Badge></td>
                <td className="px-3 py-2"><SlaBadge s={i.slaStatus} /></td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{new Date(i.createdAt).toLocaleString()}</td>
                {showPeople && <td className="px-3 py-2 text-muted-foreground">{i.assignee?.name ?? "—"}</td>}
                {showPeople && <td className="px-3 py-2 text-muted-foreground">{i.reporter?.name ?? "—"}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{t("page.of", { total, page, totalPages })}</span>
        <div className="flex items-center gap-1">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
            className="flex h-7 w-7 items-center justify-center rounded border border-border hover:bg-muted disabled:opacity-40">
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
            className="flex h-7 w-7 items-center justify-center rounded border border-border hover:bg-muted disabled:opacity-40">
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
