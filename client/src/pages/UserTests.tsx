import { useState, Fragment } from "react";
import { useQuery, useMutation } from "@apollo/client";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Plus, FolderOpen, Pencil, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { USER_TESTS, DELETE_USER_TEST } from "../graphql/usertest";
import { useNav } from "../store/nav";
import { FilterBar } from "../components/FilterBar";
import { usePageState, paged, Pager } from "../components/Pager";
import { HeaderButton } from "../components/HeaderButton";
import { RefreshBtn } from "../components/RefreshBtn";
import { IconBtn } from "../components/IconBtn";
import { DeleteConfirm } from "../components/DeleteConfirm";
import { SortableTh, nextSort } from "../components/SortableTh";
import { searchRows, sortRows, groupRows } from "../lib/list";
import { withToast } from "../store/toast";
import { fmtDateTime as fmt } from "../lib/utils";
import { UserTestForm } from "./forms/UserTestForm";
import { useAuth } from "../store/auth";
import { canManageContent, canEditOwned } from "../lib/perm";
import { TableSkeleton } from "../components/Skeleton";


function toRow(u: any) {
  return { ...u, creatorName: u.createdBy?.name ?? "", dateCreated: u.createdAt };
}

export default function UserTests() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { panel, openPanel } = useNav();
  const { user } = useAuth();
  const create = canManageContent(user?.role); // a test account is QA's content
  const { data, loading, refetch } = useQuery(USER_TESTS, { variables: { projectId: null }, fetchPolicy: "cache-and-network" });
  const [deleteUserTest] = useMutation(DELETE_USER_TEST, { refetchQueries: [{ query: USER_TESTS, variables: { projectId: null } }] });

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("dateCreated");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [groupKey, setGroupKey] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [fEnv, setFEnv] = useState("");
  const [fProject, setFProject] = useState("");
  const [del, setDel] = useState<{ id: string; key: string } | null>(null);
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

  const all: any[] = (data?.userTests ?? []).map(toRow);
  const distinct = (k: string) => [...new Set(all.map((r) => r[k]).filter(Boolean))].sort();

  const filtered = all.filter(
    (r) => (!fEnv || r.environment === fEnv) && (!fProject || r.projectName === fProject),
  );
  const rows = sortRows(searchRows(filtered, search, ["key", "account", "projectName", "creatorName"]), sortKey as any, sortDir);
  const pageRows = paged(rows, pg);
  const groups: [string, any[]][] = groupKey ? Object.entries(groupRows(pageRows, groupKey as any)) : [["", pageRows]];

  const selCls = "h-8 rounded border border-border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="flex h-full">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="rounded border border-border">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold">{t("ut.title")}</h2>
            <div className="flex items-center gap-2">
              <RefreshBtn onClick={() => void refetch()} loading={loading} />
              <HeaderButton allowed={create} icon={Plus} onClick={() => openPanel({ kind: "usertest", mode: "create" })}>
                {t("ut.newItem")}
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
                { value: "projectName", label: t("ut.project") },
                { value: "environment", label: t("iss.environment") },
                { value: "creatorName", label: t("at.creator") },
              ]}
            >
              <select value={fProject} onChange={(e) => setFProject(e.target.value)} className={selCls}>
                <option value="">{t("ut.project")}: {t("c.all")}</option>
                {distinct("projectName").map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
              <select value={fEnv} onChange={(e) => setFEnv(e.target.value)} className={selCls}>
                <option value="">{t("iss.environment")}: {t("c.all")}</option>
                {distinct("environment").map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
              {(search || fProject || fEnv || groupKey) && (
                <button
                  onClick={() => { setSearch(""); setFProject(""); setFEnv(""); setGroupKey(""); }}
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
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("ut.no")}</th>
                    <SortableTh label={t("ut.account")} colKey="account" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("ut.password")}</th>
                    <SortableTh label={t("ut.project")} colKey="projectName" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <SortableTh label={t("iss.environment")} colKey="environment" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <SortableTh label={t("at.creator")} colKey="creatorName" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <SortableTh label={t("at.dateCreated")} colKey="dateCreated" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {loading && rows.length === 0 && <TableSkeleton cols={8} />}
                  {!loading && rows.length === 0 && <tr><td colSpan={8} className="py-8 text-center text-muted-foreground">{t("ut.empty")}</td></tr>}
                  {groups.map(([label, gr]) => (
                    <Fragment key={label || "all"}>
                      {groupKey && (
                        <tr className="cursor-pointer bg-muted/40 hover:bg-muted/60" onClick={() => toggleGroup(label)}>
                          <td colSpan={8} className="px-3 py-1.5 text-xs font-medium text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              {collapsed.has(label) ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                              {label || "—"} · {gr.length}
                            </span>
                          </td>
                        </tr>
                      )}
                      {!collapsed.has(label) && gr.map((u: any, i: number) => (
                        <tr key={u.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30">
                          <td className="px-3 py-2 tabular-nums text-muted-foreground">{(pg.page - 1) * (pg.size || rows.length) + i + 1}</td>
                          <td className="px-3 py-2">
                            <button onClick={() => navigate(`/user-tests/${u.id}`)} className="font-medium hover:underline">{u.account}</button>
                          </td>
                          <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{u.password || "—"}</td>
                          <td className="px-3 py-2 text-muted-foreground">{u.projectName}</td>
                          <td className="px-3 py-2 text-muted-foreground">{u.environment}</td>
                          <td className="px-3 py-2 text-muted-foreground">{u.creatorName}</td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{fmt(u.dateCreated)}</td>
                          <td className="px-3 py-2">
                            <div className="flex justify-end gap-1">
                              <IconBtn title={t("c.open")} onClick={() => navigate(`/user-tests/${u.id}`)}><FolderOpen className="h-3.5 w-3.5" /></IconBtn>
                              <IconBtn allowed={canEditOwned(user, u.createdBy?.id)} title={t("c.edit")} onClick={() => openPanel({ kind: "usertest", mode: "edit", id: u.id })}><Pencil className="h-3.5 w-3.5" /></IconBtn>
                              <IconBtn allowed={canEditOwned(user, u.createdBy?.id)} title={t("c.delete")} onClick={() => setDel({ id: u.id, key: u.key })}><Trash2 className="h-3.5 w-3.5" /></IconBtn>
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
        </div>

        <DeleteConfirm
          open={!!del}
          onClose={() => setDel(null)}
          onConfirm={() => del && withToast(deleteUserTest({ variables: { id: del.id } }), t("t.userTestDeleted"), t("t.userTestDeleteFail"))}
          label={del?.key ?? ""}
        />
      </div>

      {panel?.kind === "usertest" && <UserTestForm panel={panel} />}
    </div>
  );
}
