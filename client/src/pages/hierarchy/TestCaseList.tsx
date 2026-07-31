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
import { TestCaseCsvActions } from "../../components/TestCaseCsvActions";
import { SortableTh, nextSort } from "../../components/SortableTh";
import { searchRows, sortRows, groupRows } from "../../lib/list";
import { withToast } from "../../store/toast";
import { useAuth } from "../../store/auth";
import { canManageContent } from "../../lib/perm";
import { cn } from "../../lib/utils";

function ResultBadge({ result }: { result: string | null }) {
  const { t } = useTranslation();
  const cls =
    result === "PASS"
      ? "bg-primary text-primary-foreground"
      : result === "FAIL"
        ? "bg-destructive text-white"
        : result === "BLOCKED"
          ? "bg-[var(--warn)] text-white"
          : "bg-muted text-muted-foreground";
  return (
    <span className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium", cls)}>
      {result ?? t("dash.notRun")}
    </span>
  );
}

export function TestCaseList({ featureId }: { featureId: string }) {
  const { t } = useTranslation();
  const { openPanel } = useNav();
  const { projectId, goTestCase } = useDrill();
  const { user } = useAuth();
  const manage = canManageContent(user?.role);
  // Retired cases come down with the rest and are filtered here, so the toggle
  // below costs no round trip.
  const { data, loading } = useQuery(TEST_CASES, {
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
  const groups: [string, any[]][] = groupKey ? Object.entries(groupRows(rows, groupKey as any)) : [["", rows]];
  const selCls = "h-8 rounded border border-border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="rounded border border-border">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold">{t("dash.testCases")}</h2>
        <div className="flex flex-wrap items-center gap-1.5">
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
        />
        <div className="mb-3 flex flex-wrap items-center gap-2">
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
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="w-8 px-3 py-2 text-left text-xs font-medium text-muted-foreground">#</th>
                <SortableTh label={t("c.id")} colKey="key" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortableTh label={t("dash.testCase")} colKey="name" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortableTh label={t("c.status")} colKey="activeLabel" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortableTh label={t("tc.kind")} colKey="kindLabel" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortableTh label={t("dash.latest")} colKey="latestResult" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortableTh label={t("dash.records")} colKey="recordCount" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortableTh label={t("dash.issues")} colKey="issueCount" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-muted-foreground">
                    {t("c.loading")}
                  </td>
                </tr>
              )}
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
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-1">
                      <span
                        className={cn(
                          "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium",
                          tc.active ? "bg-muted text-muted-foreground" : "border border-border text-muted-foreground",
                        )}
                      >
                        {tc.active ? t("tc.active") : t("tc.inactive")}
                      </span>
                      {/* A change is queued: say so instead of letting the row look settled. */}
                      {tc.pendingRequest && (
                        <span className="inline-flex items-center gap-1 rounded bg-[var(--warn)]/15 px-1.5 py-0.5 text-[10px] font-medium text-[var(--warn)]">
                          <Clock className="h-2.5 w-2.5" />
                          {t(`tcr.kind.${tc.pendingRequest.kind}`)}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {tc.kind
                      ? <span className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium", tc.kind === "POSITIVE" ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground")}>{tc.kind === "POSITIVE" ? t("tc.kindPositive") : t("tc.kindNegative")}</span>
                      : <span className="text-xs text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2">
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
