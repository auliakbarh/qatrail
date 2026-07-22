import { useState } from "react";
import { useQuery, useMutation } from "@apollo/client";
import { useTranslation } from "react-i18next";
import { Plus, FolderOpen, Pencil, Trash2, ArrowRightLeft } from "lucide-react";
import { TEST_CASES, DELETE_TEST_CASE } from "../../graphql/hierarchy";
import { useNav } from "../../store/nav";
import { FilterBar } from "../../components/FilterBar";
import { DeleteConfirm } from "../../components/DeleteConfirm";
import { IconBtn } from "../../components/IconBtn";
import { HeaderButton } from "../../components/HeaderButton";
import { SortableTh, nextSort } from "../../components/SortableTh";
import { searchRows, sortRows } from "../../lib/list";
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
        : "bg-muted text-muted-foreground";
  return (
    <span className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium", cls)}>
      {result ?? t("dash.notRun")}
    </span>
  );
}

export function TestCaseList({ featureId }: { featureId: string }) {
  const { t } = useTranslation();
  const { selectTestCase, openPanel } = useNav();
  const { user } = useAuth();
  const manage = canManageContent(user?.role);
  const { data, loading } = useQuery(TEST_CASES, { variables: { featureId }, fetchPolicy: "cache-and-network" });
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
        <h2 className="text-sm font-semibold">{t("dash.testCases")}</h2>
        <HeaderButton allowed={manage} icon={Plus} onClick={() => openPanel({ kind: "testcase", mode: "create" })}>
          {t("dash.addTestCase")}
        </HeaderButton>
      </div>
      <div className="px-5 py-4">
        <FilterBar search={search} onSearch={setSearch} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="w-8 px-3 py-2 text-left text-xs font-medium text-muted-foreground">#</th>
                <SortableTh label={t("c.id")} colKey="key" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortableTh label={t("dash.testCase")} colKey="name" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortableTh label={t("dash.latest")} colKey="latestResult" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortableTh label={t("dash.records")} colKey="recordCount" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortableTh label={t("dash.issues")} colKey="issueCount" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-muted-foreground">
                    {t("c.loading")}
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-muted-foreground">
                    {t("dash.noTestCases")}
                  </td>
                </tr>
              )}
              {rows.map((tc: any, idx: number) => (
                <tr key={tc.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30">
                  <td className="px-3 py-2 text-xs tabular-nums text-muted-foreground">{idx + 1}</td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{tc.key}</td>
                  <td className="px-3 py-2">
                    <button onClick={() => selectTestCase(tc.id)} className="text-left font-medium hover:underline">
                      {tc.name}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <ResultBadge result={tc.latestResult} />
                  </td>
                  <td className="px-3 py-2 tabular-nums">{tc.recordCount}</td>
                  <td className="px-3 py-2 tabular-nums">{tc.issueCount}</td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      <IconBtn title={t("c.open")} onClick={() => selectTestCase(tc.id)}>
                        <FolderOpen className="h-3.5 w-3.5" />
                      </IconBtn>
                      <IconBtn
                        title={t("move.title")}
                        allowed={manage}
                        onClick={() => openPanel({ kind: "movetc", mode: "create", id: tc.id })}
                      >
                        <ArrowRightLeft className="h-3.5 w-3.5" />
                      </IconBtn>
                      <IconBtn
                        title={t("c.edit")}
                        allowed={manage}
                        onClick={() => openPanel({ kind: "testcase", mode: "edit", id: tc.id })}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </IconBtn>
                      <IconBtn title={t("c.delete")} allowed={manage} onClick={() => setDel({ id: tc.id, name: tc.name })}>
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
        onConfirm={() => del && withToast(deleteTestCase({ variables: { id: del.id } }), t("t.testCaseDeleted"), t("t.testCaseDeleteFail"))}
        label={del?.name ?? ""}
        note={t("del.noteTestCase")}
      />
    </div>
  );
}
