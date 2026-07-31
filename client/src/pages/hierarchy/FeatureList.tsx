import { useState } from "react";
import { useQuery, useMutation } from "@apollo/client";
import { useTranslation } from "react-i18next";
import { Plus, FolderOpen, Pencil, Trash2, Copy, ArrowRightLeft } from "lucide-react";
import { FEATURES, DELETE_FEATURE } from "../../graphql/hierarchy";
import { useNav, useDrill } from "../../store/nav";
import { FilterBar } from "../../components/FilterBar";
import { CoverageBar } from "../../components/CoverageBar";
import { DeleteConfirm } from "../../components/DeleteConfirm";
import { IconBtn } from "../../components/IconBtn";
import { HeaderButton } from "../../components/HeaderButton";
import { TestCaseCsvActions } from "../../components/TestCaseCsvActions";
import { SortableTh, nextSort } from "../../components/SortableTh";
import { searchRows, sortRows } from "../../lib/list";
import { withToast } from "../../store/toast";
import { useAuth } from "../../store/auth";
import { canManageContent } from "../../lib/perm";

export function FeatureList({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const { openPanel } = useNav();
  const { goFeature } = useDrill();
  const { user } = useAuth();
  const manage = canManageContent(user?.role);
  const { data, loading } = useQuery(FEATURES, { variables: { projectId }, fetchPolicy: "cache-and-network" });
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
        <h2 className="text-sm font-semibold">{t("dash.features")}</h2>
        <div className="flex flex-wrap items-center gap-1.5">
          <TestCaseCsvActions scope="project" projectId={projectId} manage={manage} />
          <HeaderButton allowed={manage} icon={Plus} onClick={() => openPanel({ kind: "feature", mode: "create" })}>
            {t("dash.addFeature")}
          </HeaderButton>
        </div>
      </div>
      <div className="px-5 py-4">
        <FilterBar search={search} onSearch={setSearch} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="w-8 px-3 py-2 text-left text-xs font-medium text-muted-foreground">#</th>
                <SortableTh label={t("c.id")} colKey="key" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortableTh label={t("dash.feature")} colKey="name" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortableTh label={t("list.testCases")} colKey="testCaseCount" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
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
                    {t("dash.noFeatures")}
                  </td>
                </tr>
              )}
              {rows.map((f: any, idx: number) => (
                <tr key={f.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30">
                  <td className="px-3 py-2 text-xs tabular-nums text-muted-foreground">{idx + 1}</td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{f.key}</td>
                  <td className="px-3 py-2">
                    <button onClick={() => goFeature(f.id)} className="text-left font-medium hover:underline">
                      {f.name}
                    </button>
                    {f.description && <div className="text-xs text-muted-foreground">{f.description}</div>}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{f.testCaseCount}</td>
                  <td className="px-3 py-2">
                    <CoverageBar percent={f.coverage.percent} min={f.minPassPercent} ready={f.ready} bar={false} />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      <IconBtn title={t("c.open")} onClick={() => goFeature(f.id)}>
                        <FolderOpen className="h-3.5 w-3.5" />
                      </IconBtn>
                      <IconBtn
                        title={t("move.featureTitle")}
                        allowed={manage}
                        onClick={() => openPanel({ kind: "movefeature", mode: "create", id: f.id })}
                      >
                        <ArrowRightLeft className="h-3.5 w-3.5" />
                      </IconBtn>
                      <IconBtn
                        title={t("clone.action")}
                        allowed={manage}
                        onClick={() => openPanel({ kind: "clonefeature", mode: "create", id: f.id })}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </IconBtn>
                      <IconBtn
                        title={t("c.edit")}
                        allowed={manage}
                        onClick={() => openPanel({ kind: "feature", mode: "edit", id: f.id, initial: f })}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </IconBtn>
                      <IconBtn title={t("c.delete")} allowed={manage} onClick={() => setDel({ id: f.id, name: f.name })}>
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
        onConfirm={() => del && withToast(deleteFeature({ variables: { id: del.id } }), t("t.featureDeleted"), t("t.featureDeleteFail"))}
        label={del?.name ?? ""}
        note={t("del.noteFeature")}
      />
    </div>
  );
}
