import { useState, Fragment } from "react";
import { useQuery, useMutation } from "@apollo/client";
import { useTranslation } from "react-i18next";
import { Plus, FolderOpen, Pencil, Trash2, Copy, ArrowRightLeft, Power, Clock, ChevronDown, ChevronRight } from "lucide-react";
import { FEATURES, DELETE_FEATURE, SET_FEATURE_ACTIVE, PENDING_APPROVAL_COUNT } from "../../graphql/hierarchy";
import { useNav, useDrill } from "../../store/nav";
import { FilterBar } from "../../components/FilterBar";
import { CoverageBar } from "../../components/CoverageBar";
import { DeleteConfirm } from "../../components/DeleteConfirm";
import { IconBtn } from "../../components/IconBtn";
import { HeaderButton } from "../../components/HeaderButton";
import { TestCaseCsvActions } from "../../components/TestCaseCsvActions";
import { SortableTh, nextSort } from "../../components/SortableTh";
import { searchRows, sortRows, groupRows } from "../../lib/list";
import { withToast } from "../../store/toast";
import { useAuth } from "../../store/auth";
import { canManageContent } from "../../lib/perm";
import { cn } from "../../lib/utils";

export function FeatureList({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const { openPanel } = useNav();
  const { goFeature } = useDrill();
  const { user } = useAuth();
  const manage = canManageContent(user?.role);
  // Retired features come down too and are filtered here — no round trip for the
  // status picker.
  const { data, loading } = useQuery(FEATURES, {
    variables: { projectId, includeInactive: true },
    fetchPolicy: "cache-and-network",
  });
  const refetchAfter = ["Features", { query: PENDING_APPROVAL_COUNT }];
  const [deleteFeature] = useMutation(DELETE_FEATURE, { refetchQueries: refetchAfter });
  const [setActive] = useMutation(SET_FEATURE_ACTIVE, { refetchQueries: refetchAfter });
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [del, setDel] = useState<{ id: string; name: string } | null>(null);
  const [fActive, setFActive] = useState("");
  const [groupKey, setGroupKey] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
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
  // Retired features stay visible — grouped, not hidden — with editing locked.
  const visible = (data?.features ?? [])
    .map((f: any) => ({ ...f, activeLabel: f.active ? t("tc.active") : t("tc.inactive") }))
    .filter((f: any) => (fActive === "" ? true : fActive === "ACTIVE" ? f.active : !f.active));
  const rows = sortRows(searchRows(visible, search, ["name", "description"]), sortKey as any, sortDir);
  const groups: [string, any[]][] = groupKey ? Object.entries(groupRows(rows, groupKey as any)) : [["", rows]];

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
        <FilterBar
          search={search}
          onSearch={setSearch}
          groupKey={groupKey}
          onGroupKey={setGroupKey}
          groupOptions={[{ value: "activeLabel", label: t("tc.groupActive") }]}
        />
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <select
            value={fActive}
            onChange={(e) => setFActive(e.target.value)}
            className="h-8 rounded border border-border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="ACTIVE">{t("tc.activeOnly")}</option>
            <option value="INACTIVE">{t("tc.inactiveOnly")}</option>
            <option value="">{t("tc.activeAll")}</option>
          </select>
        </div>
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
              {groups.map(([label, gr]) => (
                <Fragment key={label || "all"}>
                  {groupKey && (
                    <tr className="cursor-pointer bg-muted/40 hover:bg-muted/60" onClick={() => toggleGroup(label)}>
                      <td colSpan={6} className="px-3 py-1.5 text-xs font-medium text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          {collapsed.has(label) ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                          {label || "—"} · {gr.length}
                        </span>
                      </td>
                    </tr>
                  )}
                  {!collapsed.has(label) && gr.map((f: any, idx: number) => (
                <tr key={f.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30">
                  <td className="px-3 py-2 text-xs tabular-nums text-muted-foreground">{idx + 1}</td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{f.key}</td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => goFeature(f.id)}
                      className={cn("text-left font-medium hover:underline", !f.active && "text-muted-foreground")}
                    >
                      {f.name}
                    </button>
                    {f.description && <div className="text-xs text-muted-foreground">{f.description}</div>}
                    <div className="flex flex-wrap items-center gap-1">
                      {!f.active && (
                        <span className="inline-flex items-center rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {t("tc.inactive")}
                        </span>
                      )}
                      {f.pendingRequest && (
                        <span className="inline-flex items-center gap-1 rounded bg-[var(--warn)]/15 px-1.5 py-0.5 text-[10px] font-medium text-[var(--warn)]">
                          <Clock className="h-2.5 w-2.5" />
                          {t(`tcr.kind.${f.pendingRequest.kind}`)}
                        </span>
                      )}
                    </div>
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
                        allowed={manage && f.active}
                        onClick={() => openPanel({ kind: "movefeature", mode: "create", id: f.id })}
                      >
                        <ArrowRightLeft className="h-3.5 w-3.5" />
                      </IconBtn>
                      <IconBtn
                        title={t("clone.action")}
                        allowed={manage && f.active}
                        onClick={() => openPanel({ kind: "clonefeature", mode: "create", id: f.id })}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </IconBtn>
                      <IconBtn
                        title={t("c.edit")}
                        allowed={manage && f.active}
                        onClick={() => openPanel({ kind: "feature", mode: "edit", id: f.id, initial: f })}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </IconBtn>
                      <IconBtn
                        title={f.active ? t("tc.deactivate") : t("tc.activate")}
                        allowed={manage}
                        onClick={() =>
                          withToast(
                            setActive({ variables: { id: f.id, active: !f.active } }),
                            f.active ? t("t.deactivateAsked") : t("t.activateAsked"),
                            t("t.activeChangeFail"),
                          )
                        }
                      >
                        <Power className={cn("h-3.5 w-3.5", !f.active && "text-muted-foreground")} />
                      </IconBtn>
                      <IconBtn title={t("c.delete")} allowed={manage} onClick={() => setDel({ id: f.id, name: f.name })}>
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

      <DeleteConfirm
        open={!!del}
        onClose={() => setDel(null)}
        onConfirm={() => del && withToast(deleteFeature({ variables: { id: del.id } }), t("t.deleteAsked"), t("t.featureDeleteFail"))}
        label={del?.name ?? ""}
        note={t("del.noteFeatureApproval")}
      />
    </div>
  );
}
