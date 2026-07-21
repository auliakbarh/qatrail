import { useState } from "react";
import { useQuery, useMutation } from "@apollo/client";
import { Plus, FolderOpen, Pencil, Trash2 } from "lucide-react";
import { TEST_CASES, DELETE_TEST_CASE } from "../../graphql/hierarchy";
import { useNav } from "../../store/nav";
import { FilterBar } from "../../components/FilterBar";
import { DeleteConfirm } from "../../components/DeleteConfirm";
import { IconBtn } from "../../components/IconBtn";
import { SortableTh, nextSort } from "../../components/SortableTh";
import { searchRows, sortRows } from "../../lib/list";
import { withToast } from "../../store/toast";
import { cn } from "../../lib/utils";

function ResultBadge({ result }: { result: string | null }) {
  const cls =
    result === "PASS"
      ? "bg-primary text-primary-foreground"
      : result === "FAIL"
        ? "bg-destructive text-white"
        : "bg-muted text-muted-foreground";
  return (
    <span className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium", cls)}>
      {result ?? "Not run"}
    </span>
  );
}

export function TestCaseList({ featureId }: { featureId: string }) {
  const { selectTestCase, openPanel } = useNav();
  const { data, loading } = useQuery(TEST_CASES, { variables: { featureId } });
  const [deleteTestCase] = useMutation(DELETE_TEST_CASE, {
    refetchQueries: [{ query: TEST_CASES, variables: { featureId } }],
  });
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [del, setDel] = useState<{ id: string; name: string } | null>(null);

  const onSort = (key: string) => {
    const n = nextSort({ key: sortKey, dir: sortDir }, key);
    setSortKey(n.key);
    setSortDir(n.dir);
  };
  const rows = sortRows(
    searchRows(data?.testCases ?? [], search, ["name", "description"]),
    sortKey as any,
    sortDir,
  );

  return (
    <div className="rounded border border-border">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold">Test Cases</h2>
        <button
          onClick={() => openPanel({ kind: "testcase", mode: "create" })}
          className="flex h-7 items-center gap-1.5 rounded bg-black px-3 text-xs font-medium text-white hover:bg-black/80"
        >
          <Plus className="h-3.5 w-3.5" /> Add Test Case
        </button>
      </div>
      <div className="px-5 py-4">
        <FilterBar search={search} onSearch={setSearch} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <SortableTh label="Test case" colKey="name" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortableTh label="Latest" colKey="latestResult" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortableTh label="Records" colKey="recordCount" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortableTh label="Issues" colKey="issueCount" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
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
                    No test cases yet
                  </td>
                </tr>
              )}
              {rows.map((t: any) => (
                <tr key={t.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30">
                  <td className="px-3 py-2">
                    <button onClick={() => selectTestCase(t.id)} className="font-medium hover:underline">
                      {t.name}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <ResultBadge result={t.latestResult} />
                  </td>
                  <td className="px-3 py-2 tabular-nums">{t.recordCount}</td>
                  <td className="px-3 py-2 tabular-nums">{t.issueCount}</td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      <IconBtn title="Open" onClick={() => selectTestCase(t.id)}>
                        <FolderOpen className="h-3.5 w-3.5" />
                      </IconBtn>
                      <IconBtn
                        title="Edit"
                        onClick={() => openPanel({ kind: "testcase", mode: "edit", id: t.id })}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </IconBtn>
                      <IconBtn title="Delete" onClick={() => setDel({ id: t.id, name: t.name })}>
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
        onConfirm={() => del && withToast(deleteTestCase({ variables: { id: del.id } }), "Test case deleted", "Couldn't delete test case")}
        label={del?.name ?? ""}
        note="Its records and issues are removed."
      />
    </div>
  );
}
