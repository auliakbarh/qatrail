import { useState, Fragment } from "react";
import { useQuery, useMutation } from "@apollo/client";
import { Plus, FolderOpen, Pencil, Trash2 } from "lucide-react";
import { PROJECTS, DELETE_PROJECT } from "../../graphql/hierarchy";
import { useNav } from "../../store/nav";
import { FilterBar } from "../../components/FilterBar";
import { CoverageBar } from "../../components/CoverageBar";
import { DeleteConfirm } from "../../components/DeleteConfirm";
import { IconBtn } from "../../components/IconBtn";
import { SortableTh, nextSort } from "../../components/SortableTh";
import { searchRows, sortRows, groupRows } from "../../lib/list";
import { withToast } from "../../store/toast";

export function ProjectList() {
  const { selectProject, openPanel } = useNav();
  const { data, loading } = useQuery(PROJECTS, { fetchPolicy: "cache-and-network" });
  const [deleteProject] = useMutation(DELETE_PROJECT, { refetchQueries: [PROJECTS] });
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [groupKey, setGroupKey] = useState("");
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
          <h2 className="text-sm font-semibold">Projects</h2>
          <button
            onClick={() => openPanel({ kind: "project", mode: "create" })}
            className="flex h-7 items-center gap-1.5 rounded bg-black px-3 text-xs font-medium text-white hover:bg-black/80"
          >
            <Plus className="h-3.5 w-3.5" /> Add Project
          </button>
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
                  <SortableTh label="Project" colKey="name" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  <SortableTh label="Squad" colKey="squad" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  <SortableTh label="Features" colKey="featureCount" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Pass %</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-muted-foreground">
                      Loading…
                    </td>
                  </tr>
                )}
                {!loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-muted-foreground">
                      No projects yet
                    </td>
                  </tr>
                )}
                {groups.map(([label, groupRows_]) => (
                  <Fragment key={label || "all"}>
                    {groupKey && (
                      <tr className="bg-muted/40">
                        <td colSpan={5} className="px-3 py-1.5 text-xs font-medium text-muted-foreground">
                          {label} · {groupRows_.length}
                        </td>
                      </tr>
                    )}
                    {groupRows_.map((p: any) => (
                  <tr key={p.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30">
                    <td className="px-3 py-2">
                      <button onClick={() => selectProject(p.id)} className="font-medium hover:underline">
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
                        <IconBtn title="Open" onClick={() => selectProject(p.id)}>
                          <FolderOpen className="h-3.5 w-3.5" />
                        </IconBtn>
                        <IconBtn
                          title="Edit"
                          onClick={() => openPanel({ kind: "project", mode: "edit", id: p.id, initial: p })}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </IconBtn>
                        <IconBtn title="Delete" onClick={() => setDel({ id: p.id, name: p.name })}>
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
        onConfirm={() => del && withToast(deleteProject({ variables: { id: del.id } }), "Project deleted", "Couldn't delete project")}
        label={del?.name ?? ""}
        note="All features, test cases, records and issues under it are removed."
      />
    </div>
  );
}
