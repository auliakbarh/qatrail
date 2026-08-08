import { useState, Fragment } from "react";
import { useQuery, useMutation } from "@apollo/client";
import { useTranslation } from "react-i18next";
import { Plus, FolderOpen, Pencil, Trash2, ChevronDown, ChevronRight, Copy, Power, Clock } from "lucide-react";
import { PROJECTS, DELETE_PROJECT, CLONE_PROJECT, SET_PROJECT_ACTIVE, PENDING_APPROVAL_COUNT } from "../../graphql/hierarchy";
import { useNav, useDrill } from "../../store/nav";
import { FilterBar } from "../../components/FilterBar";
import { CoverageBar } from "../../components/CoverageBar";
import { DeleteConfirm } from "../../components/DeleteConfirm";
import { IconBtn } from "../../components/IconBtn";
import { HeaderButton } from "../../components/HeaderButton";
import { RefreshBtn } from "../../components/RefreshBtn";
import { SortableTh, nextSort } from "../../components/SortableTh";
import { searchRows, sortRows, groupRows } from "../../lib/list";
import { withToast } from "../../store/toast";
import { useAuth } from "../../store/auth";
import { canManageContent } from "../../lib/perm";
import { cn } from "../../lib/utils";
import { TableSkeleton } from "../../components/Skeleton";

export function ProjectList() {
  const { t } = useTranslation();
  const { openPanel } = useNav();
  const { goProject } = useDrill();
  const { user } = useAuth();
  const manage = canManageContent(user?.role);
  // Retired projects come down with the rest and are filtered here, so the
  // status picker costs no round trip.
  const { data, loading, refetch } = useQuery(PROJECTS, {
    variables: { includeInactive: true },
    fetchPolicy: "cache-and-network",
  });
  const refetchAfter = ["Projects", { query: PENDING_APPROVAL_COUNT }];
  const [deleteProject] = useMutation(DELETE_PROJECT, { refetchQueries: refetchAfter });
  const [cloneProject] = useMutation(CLONE_PROJECT, { refetchQueries: refetchAfter });
  const [setActive] = useMutation(SET_PROJECT_ACTIVE, { refetchQueries: refetchAfter });
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [groupKey, setGroupKey] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleGroup = (label: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });
  const [del, setDel] = useState<{ id: string; name: string } | null>(null);
  const [fActive, setFActive] = useState("");

  const onSort = (key: string) => {
    const n = nextSort({ key: sortKey, dir: sortDir }, key);
    setSortKey(n.key);
    setSortDir(n.dir);
  };
  // Retired projects stay visible — grouped, not hidden — with editing locked.
  const visible = (data?.projects ?? [])
    .map((p: any) => ({ ...p, activeLabel: p.active ? t("tc.active") : t("tc.inactive") }))
    .filter((p: any) => (fActive === "" ? true : fActive === "ACTIVE" ? p.active : !p.active));
  const rows = sortRows(searchRows(visible, search, ["name", "squad", "description"]), sortKey as any, sortDir);
  // When grouping, split into labelled buckets; otherwise one unlabelled bucket.
  const groups: [string, any[]][] = groupKey
    ? Object.entries(groupRows(rows, groupKey as any))
    : [["", rows]];

  return (
    <div className="space-y-4 p-6">
      <div className="rounded border border-border">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">{t("dash.projects")}</h2>
          <div className="flex items-center gap-2">
            <RefreshBtn onClick={() => void refetch()} loading={loading} />
            <HeaderButton allowed={manage} icon={Plus} onClick={() => openPanel({ kind: "project", mode: "create" })}>
              {t("dash.addProject")}
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
              { value: "squad", label: "squad" },
              { value: "activeLabel", label: t("tc.groupActive") },
            ]}
          />
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <select
              value={fActive}
              onChange={(e) => setFActive(e.target.value)}
              className="h-8 rounded border border-border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
            >
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
                  <SortableTh label={t("dash.project")} colKey="name" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  <SortableTh label={t("c.status")} colKey="activeLabel" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  <SortableTh label={t("dash.squad")} colKey="squad" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  <SortableTh label={t("list.features")} colKey="featureCount" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("dash.passPct")}</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {loading && rows.length === 0 && <TableSkeleton cols={8} />}
                {!loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-muted-foreground">
                      {t("dash.noProjects")}
                    </td>
                  </tr>
                )}
                {groups.map(([label, groupRows_]) => (
                  <Fragment key={label || "all"}>
                    {groupKey && (
                      <tr className="cursor-pointer bg-muted/40 hover:bg-muted/60" onClick={() => toggleGroup(label)}>
                        <td colSpan={8} className="px-3 py-1.5 text-xs font-medium text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            {collapsed.has(label) ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                            {label} · {groupRows_.length}
                          </span>
                        </td>
                      </tr>
                    )}
                    {!collapsed.has(label) && groupRows_.map((p: any, idx: number) => (
                  <tr key={p.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30">
                    <td className="px-3 py-2 text-xs tabular-nums text-muted-foreground">{idx + 1}</td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{p.key}</td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => goProject(p.id)}
                        className={cn("text-left font-medium hover:underline", !p.active && "text-muted-foreground")}
                      >
                        {p.name}
                      </button>
                      {p.description && (
                        <div className="text-xs text-muted-foreground">{p.description}</div>
                      )}
                    </td>
                    {/* Status is its own column — a badge under the name is easy
                        to miss when scanning. */}
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-1">
                        <span
                          className={cn(
                            "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium",
                            p.active ? "bg-muted text-muted-foreground" : "border border-border text-muted-foreground",
                          )}
                        >
                          {p.active ? t("tc.active") : t("tc.inactive")}
                        </span>
                        {p.pendingRequest && (
                          <span className="inline-flex items-center gap-1 rounded bg-[var(--warn)]/15 px-1.5 py-0.5 text-[10px] font-medium text-[var(--warn)]">
                            <Clock className="h-2.5 w-2.5" />
                            {t(`tcr.kind.${p.pendingRequest.kind}`)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{p.squad ?? "—"}</td>
                    <td className="px-3 py-2 tabular-nums">{p.featureCount}</td>
                    <td className="px-3 py-2">
                      <CoverageBar percent={p.coverage.percent} min={p.minPassPercent} ready={p.ready} bar={false} />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        <IconBtn title={t("c.open")} onClick={() => goProject(p.id)}>
                          <FolderOpen className="h-3.5 w-3.5" />
                        </IconBtn>
                        <IconBtn
                          title={t("clone.action")}
                          allowed={manage && p.active}
                          onClick={() => withToast(cloneProject({ variables: { id: p.id } }), t("t.changeAsked"), t("clone.fail"))}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </IconBtn>
                        <IconBtn
                          title={t("c.edit")}
                          allowed={manage && p.active}
                          onClick={() => openPanel({ kind: "project", mode: "edit", id: p.id, initial: p })}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </IconBtn>
                        <IconBtn
                          title={p.active ? t("tc.deactivate") : t("tc.activate")}
                          allowed={manage}
                          onClick={() =>
                            withToast(
                              setActive({ variables: { id: p.id, active: !p.active } }),
                              p.active ? t("t.deactivateAsked") : t("t.activateAsked"),
                              t("t.activeChangeFail"),
                            )
                          }
                        >
                          <Power className={cn("h-3.5 w-3.5", !p.active && "text-muted-foreground")} />
                        </IconBtn>
                        <IconBtn title={t("c.delete")} allowed={manage} onClick={() => setDel({ id: p.id, name: p.name })}>
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
      </div>

      <DeleteConfirm
        open={!!del}
        onClose={() => setDel(null)}
        onConfirm={() => del && withToast(deleteProject({ variables: { id: del.id } }), t("t.deleteAsked"), t("t.projectDeleteFail"))}
        label={del?.name ?? ""}
        note={t("del.noteProjectApproval")}
      />
    </div>
  );
}
