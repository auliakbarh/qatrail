import { useState, useEffect } from "react";
import { useQuery, useApolloClient, useMutation } from "@apollo/client";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Search, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { SortableTh, nextSort } from "./SortableTh";
import { ISSUES_PAGED, BULK_ARCHIVE, BULK_ASSIGN, BULK_DELETE, ENGINEERS } from "../graphql/issue";
import { downloadCsv } from "../lib/csv";
import { withToast } from "../store/toast";
import { DeleteConfirm } from "./DeleteConfirm";
import { BulkRetestModal } from "./BulkRetestModal";
import { RefreshBtn } from "./RefreshBtn";
import { cn, fmtDateTime } from "../lib/utils";
import { useAuth } from "../store/auth";
import { canAct } from "../lib/perm";

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
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  // Optional deep-link scoping (e.g. from an app test's assigned test case row).
  const fAppTest = params.get("appTest") || "";
  const fSession = params.get("session") || "";
  const fTestCase = params.get("testCase") || "";
  const showPeople = scope === "all";
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fPriority, setFPriority] = useState("");
  const [fType, setFType] = useState("");
  const [fProd, setFProd] = useState(""); // "" all | "YES" | "NO"
  const [sortKey, setSortKey] = useState("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);

  // Debounce the search box.
  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(id);
  }, [searchInput]);
  // Any filter/sort change resets to page 1 + clears selection.
  useEffect(() => { setPage(1); setSelected(new Set()); }, [search, fStatus, fPriority, fType, fProd, sortKey, sortDir, fAppTest, fSession, fTestCase]);

  const filterVars = {
    search: search || null,
    status: fStatus || null,
    priority: fPriority || null,
    type: fType || null,
    appTestId: fAppTest || null,
    sessionTestId: fSession || null,
    testCaseId: fTestCase || null,
    isProductionIssue: fProd ? fProd === "YES" : null,
  };
  const { data, loading, refetch } = useQuery(ISSUES_PAGED, {
    variables: { scope, filter: filterVars, sort: sortKey, dir: sortDir, page, pageSize: PAGE_SIZE },
    fetchPolicy: "cache-and-network",
  });

  // Bulk selection (scoped to the current page).
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assignId, setAssignId] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  const [retestOpen, setRetestOpen] = useState(false);
  const { data: engData } = useQuery(ENGINEERS);
  const [bulkArchive] = useMutation(BULK_ARCHIVE);
  const [bulkAssign] = useMutation(BULK_ASSIGN);
  const [bulkDelete] = useMutation(BULK_DELETE);
  const toggleSel = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const clearSel = () => setSelected(new Set());
  const afterBulk = async () => { clearSel(); await refetch(); };
  const ids = [...selected];

  const onSort = (k: string) => { const n = nextSort({ key: sortKey, dir: sortDir }, k); setSortKey(n.key); setSortDir(n.dir); };

  // Export all rows matching the current filters (not just the page).
  const exportCsv = async () => {
    const res = await apollo.query({
      query: ISSUES_PAGED,
      variables: { scope, filter: filterVars, sort: sortKey, dir: sortDir, page: 1, pageSize: 5000 },
      fetchPolicy: "network-only",
    });
    const items = res.data?.issuesPaged?.items ?? [];
    downloadCsv(
      `issues-${scope}.csv`,
      ["ID", "Title", "Type", "Priority", "Status", "Production issue", "SLA", "Environment", "Platform", "App test", "Session", "Assignee", "Reporter", "Created"],
      items.map((i: any) => [i.key, i.title, i.type, i.priority, i.status, i.isProductionIssue ? "YES" : "NO", i.slaStatus, i.environment, i.platform, i.appTestKey ?? "", i.sessionTestKey ?? "", i.assignee?.name, i.reporter?.name, fmtDateTime(i.createdAt)]),
    );
  };
  const rows = data?.issuesPaged?.items ?? [];
  const total = data?.issuesPaged?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // Viewers get no bulk actions, so the select column is dropped for them.
  const bulk = canAct(user?.role);
  const colCount = (showPeople ? 11 : 9) + (bulk ? 2 : 1); // + checkbox + app-test columns
  const allOnPage = rows.length > 0 && rows.every((r: any) => selected.has(r.id));
  const toggleAll = () => setSelected(allOnPage ? new Set() : new Set(rows.map((r: any) => r.id)));

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
        <Filter label={t("issue.colProdIssue")} value={fProd} onChange={setFProd} options={["YES", "NO"]} />
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-muted-foreground">{t("issue.count", { n: total })}</span>
          <RefreshBtn onClick={() => void refetch()} loading={loading} />
          <button onClick={exportCsv} className="flex h-8 items-center gap-1.5 rounded border border-border px-2 text-xs hover:bg-muted">
            <Download className="h-3.5 w-3.5" /> {t("export.csv")}
          </button>
        </div>
      </div>
      {(fAppTest || fSession || fTestCase) && (
        <div className="mb-3 flex items-center gap-2 rounded border border-border bg-muted/40 px-3 py-2 text-xs">
          <span className="font-medium">{t("issue.scopedFilter")}</span>
          <button onClick={() => setParams({})} className="ml-auto underline">{t("issue.clearFilter")}</button>
        </div>
      )}
      {bulk && selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded border border-border bg-muted/40 px-3 py-2 text-xs">
          <span className="font-medium">{t("bulk.selected", { n: selected.size })}</span>
          <button onClick={() => withToast(bulkArchive({ variables: { ids, archived: true } }).then(afterBulk), t("bulk.archived"), t("c.somethingWrong"))} className="rounded border border-border px-2 py-1 hover:bg-muted">{t("act.archive")}</button>
          <button onClick={() => withToast(bulkArchive({ variables: { ids, archived: false } }).then(afterBulk), t("bulk.unarchived"), t("c.somethingWrong"))} className="rounded border border-border px-2 py-1 hover:bg-muted">{t("act.unarchive")}</button>
          <span className="flex items-center gap-1">
            <select value={assignId} onChange={(e) => setAssignId(e.target.value)} className={small}>
              <option value="">{t("bulk.assignTo")}</option>
              {(engData?.engineers ?? []).map((e: any) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
            <button disabled={!assignId} onClick={() => withToast(bulkAssign({ variables: { ids, assigneeId: assignId } }).then(afterBulk), t("bulk.assigned"), t("c.somethingWrong"))} className="rounded border border-border px-2 py-1 hover:bg-muted disabled:opacity-40">{t("bulk.assign")}</button>
          </span>
          {/* Only issues waiting for review can be retested — no button when the
              selection holds none, rather than a dialog that can only refuse. */}
          {rows.some((r: any) => selected.has(r.id) && r.status === "NEED_REVIEW") && (
            <button onClick={() => setRetestOpen(true)} className="rounded border border-border px-2 py-1 hover:bg-muted">{t("retest.action")}</button>
          )}
          <button onClick={() => setConfirmDel(true)} className="rounded bg-destructive px-2 py-1 font-medium text-white hover:bg-destructive/90">{t("c.delete")}</button>
          <button onClick={clearSel} className="ml-auto underline">{t("bulk.clear")}</button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              {bulk && (
                <th className="w-8 px-3 py-2 text-left">
                  <input type="checkbox" checked={allOnPage} onChange={toggleAll} className="cursor-pointer" />
                </th>
              )}
              <th className="w-8 px-3 py-2 text-left text-xs font-medium text-muted-foreground">#</th>
              <SortableTh label={t("c.id")} colKey="key" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <SortableTh label={t("issue.colIssue")} colKey="title" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <SortableTh label={t("c.type")} colKey="type" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <SortableTh label={t("c.priority")} colKey="priority" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <SortableTh label={t("c.status")} colKey="status" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("issue.colProdIssue")}</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("c.sla")}</th>
              <SortableTh label={t("c.created")} colKey="createdAt" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("st.relatedScope")}</th>
              {showPeople && <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("c.assignee")}</th>}
              {showPeople && <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("c.reporter")}</th>}
            </tr>
          </thead>
          <tbody>
            {loading && !data && <tr><td colSpan={colCount} className="py-8 text-center text-muted-foreground">{t("c.loading")}</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={colCount} className="py-8 text-center text-muted-foreground">{t("issue.none")}</td></tr>}
            {rows.map((i: any, idx: number) => (
              <tr key={i.id} className="cursor-pointer border-b border-border/50 last:border-0 hover:bg-muted/30" onClick={() => navigate(`/issues/${i.id}?from=${scope === "assigned" ? "assigned" : "issues"}`)}>
                {bulk && (
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(i.id)} onChange={() => toggleSel(i.id)} className="cursor-pointer" />
                  </td>
                )}
                <td className="px-3 py-2 text-xs tabular-nums text-muted-foreground">{(page - 1) * PAGE_SIZE + idx + 1}</td>
                <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{i.key}</td>
                <td className="px-3 py-2 font-medium">{i.title}</td>
                <td className="px-3 py-2"><Badge variant={i.type === "DEFECT" ? "destructive" : "outline"}>{i.type}</Badge></td>
                <td className="px-3 py-2"><Badge variant="outline">{i.priority}</Badge></td>
                <td className="px-3 py-2"><Badge>{i.status}</Badge></td>
                <td className="px-3 py-2">
                  {i.isProductionIssue
                    ? <Badge variant="destructive">{t("iss.prodIssueBadge")}</Badge>
                    : <span className="text-xs text-muted-foreground">—</span>}
                </td>
                <td className="px-3 py-2"><SlaBadge s={i.slaStatus} /></td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{fmtDateTime(i.createdAt)}</td>
                <td className="px-3 py-2 text-xs" onClick={(e) => e.stopPropagation()}>
                  {i.appTestId
                    ? <button onClick={() => navigate(`/app-tests/${i.appTestId}`)} className="font-mono text-primary hover:underline">{i.appTestKey}</button>
                    : i.sessionTestId
                    ? <button onClick={() => navigate(`/session-tests/${i.sessionTestId}`)} className="font-mono text-primary hover:underline">{i.sessionTestKey}</button>
                    : <span className="text-muted-foreground">—</span>}
                </td>
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
      {/* Verify a batch of fixes. Only NEED_REVIEW rows can be retested; the modal
          names the rest instead of dropping them quietly. */}
      {retestOpen && (
      <BulkRetestModal
        open
        issues={rows.filter((r: any) => selected.has(r.id))}
        onClose={() => setRetestOpen(false)}
        onDone={() => { setRetestOpen(false); void afterBulk(); }}
      />
      )}
      <DeleteConfirm
        open={confirmDel}
        onClose={() => setConfirmDel(false)}
        onConfirm={() => withToast(bulkDelete({ variables: { ids } }).then(afterBulk), t("bulk.deleted"), t("c.somethingWrong"))}
        label={t("bulk.nIssues", { n: selected.size })}
      />
    </div>
  );
}
