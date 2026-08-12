import { useState, Fragment } from "react";
import { useQuery, useMutation } from "@apollo/client";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Plus, FolderOpen, Pencil, Trash2, FolderInput, ChevronDown, ChevronRight } from "lucide-react";
import { APP_TESTS, DELETE_APP_TEST } from "../graphql/apptest";
import { HEALTH } from "../graphql";
import { JiraTicketLinks } from "../components/JiraTicketLinks";
import { useNav } from "../store/nav";
import { useAuth } from "../store/auth";
import { FilterBar } from "../components/FilterBar";
import { usePageState, paged, Pager } from "../components/Pager";
import { HeaderButton } from "../components/HeaderButton";
import { RefreshBtn } from "../components/RefreshBtn";
import { IconBtn } from "../components/IconBtn";
import { DeleteConfirm } from "../components/DeleteConfirm";
import { Modal } from "../components/Modal";
import { SortableTh, nextSort } from "../components/SortableTh";
import { searchRows, sortRows, groupRows } from "../lib/list";
import { withToast } from "../store/toast";
import { fmtDateTime as fmt } from "../lib/utils";
import { AppTestForm } from "./forms/AppTestForm";
import { MoveAppTestProjectForm } from "./forms/MoveAppTestProjectForm";
import { TableSkeleton } from "../components/Skeleton";

const canCreate = (r?: string) => r === "ENGINEER" || r === "ADMIN" || r === "SUPER_ADMIN";

// Flatten an app test into a row with sortable/searchable scalar fields.
function toRow(a: any) {
  return {
    ...a,
    creatorName: a.createdBy?.name ?? "",
    dateCreated: a.createdAt,
    jira: (a.jiraTickets ?? []).join(", "),
  };
}

export default function AppTests() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { panel, openPanel } = useNav();
  const { data, loading, refetch } = useQuery(APP_TESTS, { variables: { projectId: null }, fetchPolicy: "cache-and-network" });
  const { data: healthData } = useQuery(HEALTH, { fetchPolicy: "cache-first" });
  const [deleteAppTest] = useMutation(DELETE_APP_TEST, { refetchQueries: [{ query: APP_TESTS, variables: { projectId: null } }] });

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("dateCreated");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [groupKey, setGroupKey] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [fEnv, setFEnv] = useState("");
  const [fPlat, setFPlat] = useState("");
  const [fAppVer, setFAppVer] = useState("");
  const [fBeVer, setFBeVer] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [del, setDel] = useState<{ id: string; key: string } | null>(null);
  const [blocked, setBlocked] = useState(false);
  const pg = usePageState(25);

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

  const all: any[] = (data?.appTests ?? []).map(toRow);
  const distinct = (k: string) => [...new Set(all.map((r) => r[k]).filter(Boolean))].sort();

  const filtered = all.filter(
    (r) =>
      (!fEnv || r.environment === fEnv) &&
      (!fPlat || r.platform === fPlat) &&
      (!fAppVer || r.appVersion === fAppVer) &&
      (!fBeVer || r.backendVersion === fBeVer) &&
      (!fStatus || r.status === fStatus),
  );
  const rows = sortRows(searchRows(filtered, search, ["key", "creatorName", "jira", "appVersion", "backendVersion"]), sortKey as any, sortDir);
  const pageRows = paged(rows, pg);
  const groups: [string, any[]][] = groupKey ? Object.entries(groupRows(pageRows, groupKey as any)) : [["", pageRows]];

  const canEditRow = (a: any) => a.createdBy?.id === user?.id || user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
  // Only an admin may move an app test between projects (assignments follow the old project).
  const isAdmin = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
  const askDelete = (a: any) => {
    if (a.status !== "OPEN") setBlocked(true);
    else setDel({ id: a.id, key: a.key });
  };

  const selCls = "h-8 rounded border border-border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="flex h-full">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="rounded border border-border">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold">{t("at.title")}</h2>
            <div className="flex items-center gap-2">
              <RefreshBtn onClick={() => void refetch()} loading={loading} />
              <HeaderButton allowed={canCreate(user?.role)} icon={Plus} onClick={() => openPanel({ kind: "apptest", mode: "create" })}>
                {t("at.newApp")}
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
                { value: "environment", label: t("iss.environment") },
                { value: "platform", label: t("iss.platform") },
                { value: "creatorName", label: t("at.creator") },
                { value: "status", label: t("c.status") },
              ]}
            >
              <select value={fEnv} onChange={(e) => setFEnv(e.target.value)} className={selCls}>
                <option value="">{t("iss.environment")}: {t("c.all")}</option>
                {distinct("environment").map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
              <select value={fPlat} onChange={(e) => setFPlat(e.target.value)} className={selCls}>
                <option value="">{t("iss.platform")}: {t("c.all")}</option>
                {distinct("platform").map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
              <select value={fAppVer} onChange={(e) => setFAppVer(e.target.value)} className={selCls}>
                <option value="">{t("form.appVersion")}: {t("c.all")}</option>
                {distinct("appVersion").map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
              <select value={fBeVer} onChange={(e) => setFBeVer(e.target.value)} className={selCls}>
                <option value="">{t("form.backendVersion")}: {t("c.all")}</option>
                {distinct("backendVersion").map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
              <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className={selCls}>
                <option value="">{t("c.status")}: {t("c.all")}</option>
                {["OPEN", "ASSIGNED", "IN_TESTING", "IN_REVIEW", "PASSED", "CLOSED"].map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
              {(search || fEnv || fPlat || fAppVer || fBeVer || fStatus || groupKey) && (
                <button
                  onClick={() => { setSearch(""); setFEnv(""); setFPlat(""); setFAppVer(""); setFBeVer(""); setFStatus(""); setGroupKey(""); }}
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
                    <SortableTh label={t("at.appNo")} colKey="key" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <SortableTh label={t("iss.environment")} colKey="environment" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <SortableTh label={t("iss.platform")} colKey="platform" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <SortableTh label={t("form.appVersion")} colKey="appVersion" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <SortableTh label={t("form.backendVersion")} colKey="backendVersion" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <SortableTh label={t("c.status")} colKey="status" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <SortableTh label={t("at.progress")} colKey="passPercent" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("at.progressStatus")}</th>
                    <SortableTh label={t("at.issues")} colKey="issueCount" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <SortableTh label={t("at.dateCreated")} colKey="dateCreated" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <SortableTh label={t("at.dateDone")} colKey="doneTestAt" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <SortableTh label={t("at.creator")} colKey="creatorName" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("at.jiraTickets")}</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {loading && rows.length === 0 && <TableSkeleton cols={14} />}
                  {!loading && rows.length === 0 && <tr><td colSpan={14} className="py-8 text-center text-muted-foreground">{t("at.empty")}</td></tr>}
                  {groups.map(([label, gr]) => (
                    <Fragment key={label || "all"}>
                      {groupKey && (
                        <tr className="cursor-pointer bg-muted/40 hover:bg-muted/60" onClick={() => toggleGroup(label)}>
                          <td colSpan={14} className="px-3 py-1.5 text-xs font-medium text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              {collapsed.has(label) ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                              {label || "—"} · {gr.length}
                            </span>
                          </td>
                        </tr>
                      )}
                      {!collapsed.has(label) && gr.map((a: any) => {
                        const tickets = a.jiraTickets ?? [];
                        return (
                          <tr key={a.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30">
                            <td className="px-3 py-2">
                              <button onClick={() => navigate(`/app-tests/${a.id}`)} className="font-mono text-xs font-medium hover:underline">{a.key}</button>
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">{a.environment}</td>
                            <td className="px-3 py-2 text-muted-foreground">{a.platform}</td>
                            <td className="px-3 py-2 text-muted-foreground">{a.appVersion ?? "—"}</td>
                            <td className="px-3 py-2 text-muted-foreground">{a.backendVersion ?? "—"}</td>
                            <td className="px-3 py-2"><span className="inline-flex rounded bg-muted px-1.5 py-0.5 text-xs font-medium">{a.status}</span></td>
                            <td className="px-3 py-2 tabular-nums">{a.passPercent}%</td>
                            <td className="px-3 py-2">
                              <span className={a.passPercent === 100
                                ? "inline-flex rounded bg-primary px-1.5 py-0.5 text-xs font-medium text-primary-foreground"
                                : "inline-flex rounded border border-border px-1.5 py-0.5 text-xs font-medium text-muted-foreground"}>
                                {a.passPercent === 100 ? t("dash.ready") : t("dash.below")}
                              </span>
                            </td>
                            <td className="px-3 py-2 tabular-nums">{a.issueCount}</td>
                            <td className="px-3 py-2 text-xs text-muted-foreground">{fmt(a.dateCreated)}</td>
                            <td className="px-3 py-2 text-xs text-muted-foreground">{a.doneTestAt ? fmt(a.doneTestAt) : "—"}</td>
                            <td className="px-3 py-2 text-muted-foreground">{a.creatorName}</td>
                            <td className="px-3 py-2 text-xs text-muted-foreground">
                              <JiraTicketLinks tickets={tickets} baseUrl={healthData?.health?.jiraBaseUrl} max={1} />
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex justify-end gap-1">
                                <IconBtn title={t("c.open")} onClick={() => navigate(`/app-tests/${a.id}`)}><FolderOpen className="h-3.5 w-3.5" /></IconBtn>
                                <IconBtn title={t("c.edit")} allowed={canEditRow(a)} onClick={() => openPanel({ kind: "apptest", mode: "edit", id: a.id })}><Pencil className="h-3.5 w-3.5" /></IconBtn>
                                <IconBtn title={t("at.moveProject")} allowed={isAdmin} onClick={() => openPanel({ kind: "moveapptest", mode: "edit", id: a.id, initial: a })}><FolderInput className="h-3.5 w-3.5" /></IconBtn>
                                <IconBtn title={t("c.delete")} allowed={canEditRow(a)} onClick={() => askDelete(a)}><Trash2 className="h-3.5 w-3.5" /></IconBtn>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager total={rows.length} st={pg} />
          </div>
        </div>

        <DeleteConfirm
          open={!!del}
          onClose={() => setDel(null)}
          onConfirm={() => del && withToast(deleteAppTest({ variables: { id: del.id } }), t("t.appTestDeleted"), t("t.appTestDeleteFail"))}
          label={del?.key ?? ""}
        />
        <Modal
          open={blocked}
          onClose={() => setBlocked(false)}
          title={t("at.cannotDeleteTitle")}
          footer={<button onClick={() => setBlocked(false)} className="h-7 rounded bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90">{t("c.ok")}</button>}
        >
          <p className="text-sm text-muted-foreground">{t("at.cannotDeleteBody")}</p>
        </Modal>
      </div>

      {panel?.kind === "apptest" && <AppTestForm panel={panel} />}
      {panel?.kind === "moveapptest" && panel.initial && (
        <MoveAppTestProjectForm appTest={panel.initial} assignedCount={panel.initial.assignedCount ?? 0} />
      )}
    </div>
  );
}
