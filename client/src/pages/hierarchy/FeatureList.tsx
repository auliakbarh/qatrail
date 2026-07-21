import { useState } from "react";
import { useQuery, useMutation } from "@apollo/client";
import { Plus, FolderOpen, Pencil, Trash2 } from "lucide-react";
import { FEATURES, DELETE_FEATURE } from "../../graphql/hierarchy";
import { useNav } from "../../store/nav";
import { FilterBar } from "../../components/FilterBar";
import { CoverageBar } from "../../components/CoverageBar";
import { DeleteConfirm } from "../../components/DeleteConfirm";
import { IconBtn } from "../../components/IconBtn";
import { SortableTh, nextSort } from "../../components/SortableTh";
import { searchRows, sortRows } from "../../lib/list";
import { withToast } from "../../store/toast";

export function FeatureList({ projectId }: { projectId: string }) {
  const { selectFeature, openPanel } = useNav();
  const { data, loading } = useQuery(FEATURES, { variables: { projectId } });
  const [deleteFeature] = useMutation(DELETE_FEATURE, {
    refetchQueries: [{ query: FEATURES, variables: { projectId } }],
  });
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [del, setDel] = useState<{ id: string; name: string } | null>(null);

  const onSort = (key: string) => {
    const n = nextSort({ key: sortKey, dir: sortDir }, key);
    setSortKey(n.key);
    setSortDir(n.dir);
  };
  const rows = sortRows(
    searchRows(data?.features ?? [], search, ["name", "description"]),
    sortKey as any,
    sortDir,
  );

  return (
    <div className="rounded border border-border">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold">Features / Modules</h2>
        <button
          onClick={() => openPanel({ kind: "feature", mode: "create" })}
          className="flex h-7 items-center gap-1.5 rounded bg-black px-3 text-xs font-medium text-white hover:bg-black/80"
        >
          <Plus className="h-3.5 w-3.5" /> Add Feature
        </button>
      </div>
      <div className="px-5 py-4">
        <FilterBar search={search} onSearch={setSearch} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <SortableTh label="Feature" colKey="name" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortableTh label="Test cases" colKey="testCaseCount" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Pass %</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-muted-foreground">
                    No features yet
                  </td>
                </tr>
              )}
              {rows.map((f: any) => (
                <tr key={f.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30">
                  <td className="px-3 py-2">
                    <button onClick={() => selectFeature(f.id)} className="font-medium hover:underline">
                      {f.name}
                    </button>
                    {f.description && <div className="text-xs text-muted-foreground">{f.description}</div>}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{f.testCaseCount}</td>
                  <td className="px-3 py-2">
                    <CoverageBar percent={f.coverage.percent} min={f.minPassPercent} ready={f.ready} />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      <IconBtn title="Open" onClick={() => selectFeature(f.id)}>
                        <FolderOpen className="h-3.5 w-3.5" />
                      </IconBtn>
                      <IconBtn
                        title="Edit"
                        onClick={() => openPanel({ kind: "feature", mode: "edit", id: f.id, initial: f })}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </IconBtn>
                      <IconBtn title="Delete" onClick={() => setDel({ id: f.id, name: f.name })}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </IconBtn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <DeleteConfirm
        open={!!del}
        onClose={() => setDel(null)}
        onConfirm={() => del && withToast(deleteFeature({ variables: { id: del.id } }), "Feature deleted", "Couldn't delete feature")}
        label={del?.name ?? ""}
        note="All test cases, records and issues under it are removed."
      />
    </div>
  );
}
