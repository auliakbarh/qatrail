import { useState, Fragment } from "react";
import { useQuery, useMutation } from "@apollo/client";
import { useTranslation } from "react-i18next";
import { Plus, FolderOpen, Pencil, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { PROJECTS, DELETE_PROJECT } from "../../graphql/hierarchy";
import { useNav } from "../../store/nav";
import { FilterBar } from "../../components/FilterBar";
import { CoverageBar } from "../../components/CoverageBar";
import { DeleteConfirm } from "../../components/DeleteConfirm";
import { IconBtn } from "../../components/IconBtn";
import { HeaderButton } from "../../components/HeaderButton";
import { SortableTh, nextSort } from "../../components/SortableTh";
import { searchRows, sortRows, groupRows } from "../../lib/list";
import { withToast } from "../../store/toast";
import { useAuth } from "../../store/auth";
import { canManageContent } from "../../lib/perm";

export function ProjectList() {
  const { t } = useTranslation();
  const { selectProject, openPanel } = useNav();
  const { user } = useAuth();
  const manage = canManageContent(user?.role);
  const { data, loading } = useQuery(PROJECTS, { fetchPolicy: "cache-and-network" });
  const [deleteProject] = useMutation(DELETE_PROJECT, { refetchQueries: [PROJECTS] });
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

  const onSort = (key: string) => {
    const n = nextSort({ key: sortKey, dir: sortDir }, key);
    setSortKey(n.key);
    setSortDir(n.dir);
  };
  const rows = sortRows(
    searchRows(data?.projects ?? [], search, ["name", "squad", "description"]),
    sortKey as any,
    sortDir,
  );
  // When grouping, split into labelled buckets; otherwise one unlabelled bucket.
  const groups: [string, any[]][] = groupKey
    ? Object.entries(groupRows(rows, groupKey as any))
    : [["", rows]];

  return (
    <div className="space-y-4 p-6">
      <div className="rounded border border-border">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">{t("dash.projects")}</h2>
          <HeaderButton allowed={manage} icon={Plus} onClick={() => openPanel({ kind: "project", mode: "create" })}>
            {t("dash.addProject")}
          </HeaderButton>
        </div>
        <div className="px-5 py-4">
          <FilterBar
            search={search}
            onSearch={setSearch}
            groupKey={groupKey}
            onGroupKey={setGroupKey}
            groupOptions={[{ value: "squad", label: "squad" }]}
          />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="w-8 px-3 py-2 text-left text-xs font-medium text-muted-foreground">#</th>
                  <SortableTh label={t("dash.project")} colKey="name" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  <SortableTh label={t("dash.squad")} colKey="squad" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  <SortableTh label={t("list.features")} colKey="featureCount" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("dash.passPct")}</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-muted-foreground">
                      {t("c.loading")}
                    </td>
                  </tr>
                )}
                {!loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-muted-foreground">
                      {t("dash.noProjects")}
                    </td>
                  </tr>
                )}
                {groups.map(([label, groupRows_]) => (
                  <Fragment key={label || "all"}>
                    {groupKey && (
                      <tr className="cursor-pointer bg-muted/40 hover:bg-muted/60" onClick={() => toggleGroup(label)}>
                        <td colSpan={6} className="px-3 py-1.5 text-xs font-medium text-muted-foreground">
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
                    <td className="px-3 py-2">
                      <button onClick={() => selectProject(p.id)} className="text-left font-medium hover:underline">
                        {p.name}
                      </button>
                      {p.description && (
                        <div className="text-xs text-muted-foreground">{p.description}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{p.squad ?? "—"}</td>
                    <td className="px-3 py-2 tabular-nums">{p.featureCount}</td>
                    <td className="px-3 py-2">
                      <CoverageBar percent={p.coverage.percent} min={p.minPassPercent} ready={p.ready} />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        <IconBtn title={t("c.open")} onClick={() => selectProject(p.id)}>
                          <FolderOpen className="h-3.5 w-3.5" />
                        </IconBtn>
                        <IconBtn
                          title={t("c.edit")}
                          allowed={manage}
                          onClick={() => openPanel({ kind: "project", mode: "edit", id: p.id, initial: p })}
                        >
                          <Pencil className="h-3.5 w-3.5" />
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
        onConfirm={() => del && withToast(deleteProject({ variables: { id: del.id } }), t("t.projectDeleted"), t("t.projectDeleteFail"))}
        label={del?.name ?? ""}
        note={t("del.noteProject")}
      />
    </div>
  );
}
