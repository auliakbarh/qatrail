import { useState, useEffect, Fragment } from "react";
import { useQuery, useMutation } from "@apollo/client";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Plus, FolderOpen, Pencil, Trash2, ChevronDown, ChevronRight, ChevronLeft } from "lucide-react";
import { SESSION_TESTS, DELETE_SESSION_TEST } from "../graphql/sessiontest";
import { useNav } from "../store/nav";
import { useAuth } from "../store/auth";
import { canManageContent } from "../lib/perm";
import { FilterBar } from "../components/FilterBar";
import { HeaderButton } from "../components/HeaderButton";
import { RefreshBtn } from "../components/RefreshBtn";
import { IconBtn } from "../components/IconBtn";
import { DeleteConfirm } from "../components/DeleteConfirm";
import { SortableTh, nextSort } from "../components/SortableTh";
import { searchRows, sortRows, groupRows } from "../lib/list";
import { withToast } from "../store/toast";
import { fmtDateTime as fmt } from "../lib/utils";
import { SessionTestForm } from "./forms/SessionTestForm";
import { TableSkeleton } from "../components/Skeleton";

const PAGE_SIZE = 25;

// Flatten a session into a row with sortable/searchable scalar fields.
function toRow(s: any) {
  return {
    ...s,
    creatorName: s.createdBy?.name ?? "",
    dateCreated: s.createdAt,
    dateTest: s.testedAt,
    stakeholderText: (s.stakeholders ?? []).join(", "),
  };
}

export default function SessionTests() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { panel, openPanel } = useNav();
  const manage = canManageContent(user?.role);
  const { data, loading, refetch } = useQuery(SESSION_TESTS, { variables: { projectId: null }, fetchPolicy: "cache-and-network" });
  const [deleteSessionTest] = useMutation(DELETE_SESSION_TEST, {
    refetchQueries: [{ query: SESSION_TESTS, variables: { projectId: null } }],
  });

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("dateTest");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [groupKey, setGroupKey] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [fKind, setFKind] = useState("");
  const [fProject, setFProject] = useState("");
  const [fCreator, setFCreator] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [del, setDel] = useState<{ id: string; key: string } | null>(null);
  const [page, setPage] = useState(1);

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

  const all: any[] = (data?.sessionTests ?? []).map(toRow);
  const distinct = (k: string) => [...new Set(all.map((r) => r[k]).filter(Boolean))].sort();

  const filtered = all.filter(
    (r) =>
      (!fKind || r.kindLabel === fKind) &&
      (!fProject || r.projectName === fProject) &&
      (!fCreator || r.creatorName === fCreator) &&
      (!fStatus || r.status === fStatus),
  );
  const rows = sortRows(
    searchRows(filtered, search, ["key", "kindLabel", "projectName", "creatorName", "stakeholderText"]),
    sortKey as any,
    sortDir,
  );
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const groups: [string, any[]][] = groupKey ? Object.entries(groupRows(pageRows, groupKey as any)) : [["", pageRows]];
  useEffect(() => { setPage(1); }, [search, fKind, fProject, fCreator, fStatus, groupKey, sortKey, sortDir]);

  const canEditRow = (s: any) => s.createdBy?.id === user?.id || user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
  const selCls = "h-8 rounded border border-border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="flex h-full">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="rounded border border-border">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold">{t("st.title")}</h2>
            <div className="flex items-center gap-2">
              <RefreshBtn onClick={() => void refetch()} loading={loading} />
              <HeaderButton allowed={manage} icon={Plus} onClick={() => openPanel({ kind: "sessiontest", mode: "create" })}>
                {t("st.newSession")}
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
                { value: "kindLabel", label: t("st.kind") },
                { value: "projectName", label: t("at.project") },
                { value: "creatorName", label: t("at.creator") },
              ]}
            />
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <select value={fKind} onChange={(e) => setFKind(e.target.value)} className={selCls}>
                <option value="">{t("st.kind")}: {t("c.all")}</option>
                {distinct("kindLabel").map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
              <select value={fProject} onChange={(e) => setFProject(e.target.value)} className={selCls}>
                <option value="">{t("at.project")}: {t("c.all")}</option>
                {distinct("projectName").map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
              <select value={fCreator} onChange={(e) => setFCreator(e.target.value)} className={selCls}>
                <option value="">{t("at.creator")}: {t("c.all")}</option>
                {distinct("creatorName").map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
              <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className={selCls}>
                <option value="">{t("c.status")}: {t("c.all")}</option>
                {["OPEN", "IN_TESTING", "PASSED", "CLOSED"].map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <SortableTh label={t("st.sessionNo")} colKey="key" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <SortableTh label={t("st.kind")} colKey="kindLabel" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <SortableTh label={t("at.project")} colKey="projectName" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <SortableTh label={t("c.status")} colKey="status" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <SortableTh label={t("st.passPercent")} colKey="passPercent" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <SortableTh label={t("at.issues")} colKey="issueCount" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <SortableTh label={t("at.creator")} colKey="creatorName" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <SortableTh label={t("st.dateTest")} colKey="dateTest" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <SortableTh label={t("at.dateCreated")} colKey="dateCreated" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {loading && rows.length === 0 && <TableSkeleton cols={10} />}
                  {!loading && rows.length === 0 && <tr><td colSpan={10} className="py-8 text-center text-muted-foreground">{t("st.empty")}</td></tr>}
                  {groups.map(([label, gr]) => (
                    <Fragment key={label || "all"}>
                      {groupKey && (
                        <tr className="cursor-pointer bg-muted/40 hover:bg-muted/60" onClick={() => toggleGroup(label)}>
                          <td colSpan={10} className="px-3 py-1.5 text-xs font-medium text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              {collapsed.has(label) ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                              {label || "—"} · {gr.length}
                            </span>
                          </td>
                        </tr>
                      )}
                      {!collapsed.has(label) && gr.map((s: any) => (
                        <tr key={s.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30">
                          <td className="px-3 py-2">
                            <button onClick={() => navigate(`/session-tests/${s.id}`)} className="font-mono text-xs font-medium hover:underline">{s.key}</button>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{s.kindLabel}</td>
                          <td className="px-3 py-2 text-muted-foreground">{s.projectName}</td>
                          <td className="px-3 py-2"><span className="inline-flex rounded bg-muted px-1.5 py-0.5 text-xs font-medium">{t(`st.status.${s.status}`)}</span></td>
                          <td className="px-3 py-2 tabular-nums">
                            {s.passPercent}%
                            <span className="ml-1 text-xs text-muted-foreground">/ {s.minPassPercent}%</span>
                          </td>
                          <td className="px-3 py-2 tabular-nums">{s.issueCount}</td>
                          <td className="px-3 py-2 text-muted-foreground">{s.creatorName}</td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{fmt(s.dateTest)}</td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{fmt(s.dateCreated)}</td>
                          <td className="px-3 py-2">
                            <div className="flex justify-end gap-1">
                              <IconBtn title={t("c.open")} onClick={() => navigate(`/session-tests/${s.id}`)}><FolderOpen className="h-3.5 w-3.5" /></IconBtn>
                              <IconBtn title={t("c.edit")} allowed={canEditRow(s)} onClick={() => openPanel({ kind: "sessiontest", mode: "edit", id: s.id })}><Pencil className="h-3.5 w-3.5" /></IconBtn>
                              <IconBtn title={t("c.delete")} allowed={canEditRow(s)} onClick={() => setDel({ id: s.id, key: s.key })}><Trash2 className="h-3.5 w-3.5" /></IconBtn>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </Fragment>
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
        </div>

        <DeleteConfirm
          open={!!del}
          onClose={() => setDel(null)}
          onConfirm={() => del && withToast(deleteSessionTest({ variables: { id: del.id } }), t("t.sessionDeleted"), t("t.sessionDeleteFail"))}
          label={del?.key ?? ""}
        />
      </div>

      {panel?.kind === "sessiontest" && <SessionTestForm panel={panel} />}
    </div>
  );
}
