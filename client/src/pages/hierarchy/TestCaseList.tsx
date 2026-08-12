import { useState, Fragment } from "react";
import { useQuery, useMutation } from "@apollo/client";
import { useTranslation } from "react-i18next";
import { Plus, FolderOpen, Pencil, Trash2, ArrowRightLeft, Copy, ChevronDown, ChevronRight, Power, Clock } from "lucide-react";
import { TEST_CASES, DELETE_TEST_CASE, SET_TEST_CASE_ACTIVE, PENDING_APPROVAL_COUNT } from "../../graphql/hierarchy";
import { useNav, useDrill } from "../../store/nav";
import { FilterBar } from "../../components/FilterBar";
import { DeleteConfirm } from "../../components/DeleteConfirm";
import { IconBtn } from "../../components/IconBtn";
import { HeaderButton } from "../../components/HeaderButton";
import { RefreshBtn } from "../../components/RefreshBtn";
import { TestCaseCsvActions } from "../../components/TestCaseCsvActions";
import { SortableTh, nextSort } from "../../components/SortableTh";
import { searchRows, sortRows, groupRows } from "../../lib/list";
import { withToast } from "../../store/toast";
import { useAuth } from "../../store/auth";
import { canManageContent } from "../../lib/perm";
import { cn } from "../../lib/utils";
import { TableSkeleton } from "../../components/Skeleton";
import { usePageState, paged, Pager } from "../../components/Pager";
import { Badge } from "../../components/Badge";

function ResultBadge({ result }: { result: string | null }) {
  const { t } = useTranslation();
  // BLOCKED is not a verdict, so it gets its own colour rather than reading as a
  // failure — hence the class override on top of the shared badge.
  const cls =
    result === "BLOCKED" ? "bg-[var(--warn)] text-white" : "";
  const variant = result === "PASS" ? "primary" : result === "FAIL" ? "destructive" : "muted";
  return <Badge variant={variant} className={cls}>{result ?? t("dash.notRun")}</Badge>;
}

export function TestCaseList({ featureId }: { featureId: string }) {
  const { t } = useTranslation();
  const { openPanel } = useNav();
  const { projectId, goTestCase } = useDrill();
  const { user } = useAuth();
  const manage = canManageContent(user?.role);
  // Retired cases come down with the rest and are filtered here, so the toggle
  // below costs no round trip.
  const { data, loading, refetch } = useQuery(TEST_CASES, {
    variables: { featureId, includeInactive: true },
    fetchPolicy: "cache-and-network",
  });
  const refetchAfter = ["TestCases", { query: PENDING_APPROVAL_COUNT }];
  const [deleteTestCase] = useMutation(DELETE_TEST_CASE, { refetchQueries: refetchAfter });
  const [setActive] = useMutation(SET_TEST_CASE_ACTIVE, { refetchQueries: refetchAfter });
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [groupKey, setGroupKey] = useState("");
  const [fKind, setFKind] = useState("");
  const [fActive, setFActive] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const pg = usePageState(25);
  const [del, setDel] = useState<{ id: string; name: string } | null>(null);

  const toggleGroup = (label: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });
  const onSort = (key: string) => {
    const n = nextSort({ key: sortKey, dir: sortDir }, key);
    setSortKey(n.key);
    setSortDir(n.dir);
  };
  // Rows show "—" for an unset kind; group/filter treat it as its own bucket.
  // Retired cases stay visible — grouped, not hidden — but every editing action
  // is locked on them.
  const base = (data?.testCases ?? []).map((tc: any) => ({
    ...tc,
    kindLabel: tc.kind ?? "—",
    activeLabel: tc.active ? t("tc.active") : t("tc.inactive"),
  }));
  const byKind = fKind ? base.filter((tc: any) => (fKind === "—" ? !tc.kind : tc.kind === fKind)) : base;
  const filtered =
    fActive === "" ? byKind : byKind.filter((tc: any) => (fActive === "ACTIVE" ? tc.active : !tc.active));
  const rows = sortRows(searchRows(filtered, search, ["name", "description"]), sortKey as any, sortDir);
  const pageRows = paged(rows, pg);
  const groups: [string, any[]][] = groupKey ? Object.entries(groupRows(pageRows, groupKey as any)) : [["", pageRows]];
  const selCls = "h-8 rounded border border-border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="rounded border border-border">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold">{t("dash.testCases")}</h2>
        <div className="flex flex-wrap items-center gap-1.5">
          <RefreshBtn onClick={() => void refetch()} loading={loading} />
          <TestCaseCsvActions scope="feature" projectId={projectId ?? undefined} featureId={featureId} manage={manage} />
          <HeaderButton allowed={manage} icon={Plus} onClick={() => openPanel({ kind: "testcase", mode: "create" })}>
            {t("dash.addTestCase")}
          </HeaderButton>
        </div>
      </div>
      <div className="px-5 py-4">
        <FilterBar
          search={search}
          onSearch={setSearch}
          groupKey={groupKey}
          onGroupKey={setGroupKey}
          groupOptions={[
            { value: "kindLabel", label: t("tc.kind") },
            { value: "activeLabel", label: t("tc.groupActive") },
          ]}
        >
          <select value={fKind} onChange={(e) => setFKind(e.target.value)} className={selCls}>
            <option value="">{t("tc.kind")}: {t("c.all")}</option>
            <option value="POSITIVE">{t("tc.kindPositive")}</option>
            <option value="NEGATIVE">{t("tc.kindNegative")}</option>
            <option value="—">{t("tc.kindNone")}</option>
          </select>
          <select value={fActive} onChange={(e) => setFActive(e.target.value)} className={selCls}>
            <option value="">{t("c.status")}: {t("c.all")}</option>
            <option value="ACTIVE">{t("tc.active")}</option>
            <option value="INACTIVE">{t("tc.inactive")}</option>
          </select>
          {(search || fKind || fActive || groupKey) && (
            <button
              onClick={() => { setSearch(""); setFKind(""); setFActive(""); setGroupKey(""); }}
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              {t("c.resetFilters")}
            </button>
          )}
        </FilterBar>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="w-8 px-3 py-2 text-left text-xs font-medium text-muted-foreground">#</th>
                <SortableTh label={t("c.id")} colKey="key" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortableTh label={t("dash.testCase")} colKey="name" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortableTh className="text-center" label={t("c.status")} colKey="activeLabel" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortableTh className="text-center" label={t("tc.kind")} colKey="kindLabel" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortableTh className="text-center" label={t("dash.latest")} colKey="latestResult" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortableTh label={t("dash.records")} colKey="recordCount" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortableTh label={t("dash.issues")} colKey="issueCount" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 && <TableSkeleton cols={9} />}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-muted-foreground">
                    {t("dash.noTestCases")}
                  </td>
                </tr>
              )}
              {groups.map(([label, gr]) => (
                <Fragment key={label || "all"}>
                  {groupKey && (
                    <tr className="cursor-pointer bg-muted/40 hover:bg-muted/60" onClick={() => toggleGroup(label)}>
                      <td colSpan={9} className="px-3 py-1.5 text-xs font-medium text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          {collapsed.has(label) ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                          {label || "—"} · {gr.length}
                        </span>
                      </td>
                    </tr>
                  )}
                  {!collapsed.has(label) && gr.map((tc: any, idx: number) => (
                <tr key={tc.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30">
                  <td className="px-3 py-2 text-xs tabular-nums text-muted-foreground">{idx + 1}</td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{tc.key}</td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => goTestCase(tc.id)}
                      className={cn("text-left font-medium hover:underline", !tc.active && "text-muted-foreground")}
                    >
                      {tc.name}
                    </button>
                  </td>
                  {/* Status has a column of its own: a badge tucked under the
                      name is easy to miss when scanning. */}
                  <td className="px-3 py-2 text-center">
                    <div className="flex flex-wrap items-center justify-center gap-1">
                      <Badge variant={tc.active ? "muted" : "outline"} className="text-[10px]">
                        {tc.active ? t("tc.active") : t("tc.inactive")}
                      </Badge>
                      {/* A change is queued: say so instead of letting the row look settled. */}
                      {tc.pendingRequest && (
                        <Badge variant="warn" className="text-[10px]">
                          <Clock className="h-2.5 w-2.5" />
                          {t(`tcr.kind.${tc.pendingRequest.kind}`)}
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-center">
                    {tc.kind
                      ? <Badge variant={tc.kind === "POSITIVE" ? "primary" : "outline"}>{tc.kind === "POSITIVE" ? t("tc.kindPositive") : t("tc.kindNegative")}</Badge>
                      : <span className="text-xs text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <ResultBadge result={tc.latestResult} />
                  </td>
                  <td className="px-3 py-2 tabular-nums">{tc.recordCount}</td>
                  <td className="px-3 py-2 tabular-nums">{tc.issueCount}</td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      <IconBtn title={t("c.open")} onClick={() => goTestCase(tc.id)}>
                        <FolderOpen className="h-3.5 w-3.5" />
                      </IconBtn>
                      <IconBtn
                        title={t("move.title")}
                        allowed={manage && tc.active}
                        onClick={() => openPanel({ kind: "movetc", mode: "create", id: tc.id })}
                      >
                        <ArrowRightLeft className="h-3.5 w-3.5" />
                      </IconBtn>
                      <IconBtn
                        title={t("clone.action")}
                        allowed={manage && tc.active}
                        onClick={() => openPanel({ kind: "clonetc", mode: "create", id: tc.id })}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </IconBtn>
                      <IconBtn
                        title={t("c.edit")}
                        allowed={manage && tc.active}
                        onClick={() => openPanel({ kind: "testcase", mode: "edit", id: tc.id })}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </IconBtn>
                      <IconBtn
                        title={tc.active ? t("tc.deactivate") : t("tc.activate")}
                        allowed={manage}
                        onClick={() =>
                          withToast(
                            setActive({ variables: { id: tc.id, active: !tc.active } }),
                            tc.active ? t("t.deactivateAsked") : t("t.activateAsked"),
                            t("t.activeChangeFail"),
                          )
                        }
                      >
                        <Power className={cn("h-3.5 w-3.5", !tc.active && "text-muted-foreground")} />
                      </IconBtn>
                      <IconBtn title={t("c.delete")} allowed={manage} onClick={() => setDel({ id: tc.id, name: tc.name })}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </IconBtn>
                    </div>
                  </td>
                </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <Pager total={rows.length} st={pg} />
      </div>

      <DeleteConfirm
        open={!!del}
        onClose={() => setDel(null)}
        onConfirm={() => del && withToast(deleteTestCase({ variables: { id: del.id } }), t("t.deleteAsked"), t("t.testCaseDeleteFail"))}
        label={del?.name ?? ""}
        note={t("del.noteTestCaseApproval")}
      />
    </div>
  );
}
