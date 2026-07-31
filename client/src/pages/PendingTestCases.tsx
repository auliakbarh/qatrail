import { useState, Fragment } from "react";
import { useQuery, useMutation } from "@apollo/client";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Check, X, FolderOpen, ChevronDown, ChevronRight } from "lucide-react";
import {
  PENDING_TEST_CASES,
  PENDING_APPROVAL_COUNT,
  APPROVE_TEST_CASE,
  APPROVE_TEST_CASES,
  REJECT_TEST_CASE,
} from "../graphql/hierarchy";
import { FilterBar } from "../components/FilterBar";
import { IconBtn } from "../components/IconBtn";
import { TextPromptModal } from "../components/TextPromptModal";
import { SortableTh, nextSort } from "../components/SortableTh";
import { searchRows, sortRows, groupRows } from "../lib/list";
import { withToast } from "../store/toast";
import { fmtDateTime as fmt, cn } from "../lib/utils";
import { waitedFor } from "../lib/approval";

// Flatten a pending case into scalar fields so search/sort/group work on it.
function toRow(tc: any) {
  return {
    ...tc,
    creatorName: tc.createdBy?.name ?? "",
    featureName: tc.feature?.name ?? "—",
    projectName: tc.feature?.project?.name ?? "—",
    kindLabel: tc.kind ?? "—",
  };
}

export default function PendingTestCases() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const refetchAfter = [{ query: PENDING_TEST_CASES, variables: { projectId: null } }, { query: PENDING_APPROVAL_COUNT }];
  const { data, loading } = useQuery(PENDING_TEST_CASES, {
    variables: { projectId: null },
    fetchPolicy: "cache-and-network",
  });
  const [approve] = useMutation(APPROVE_TEST_CASE, { refetchQueries: refetchAfter });
  const [approveMany] = useMutation(APPROVE_TEST_CASES, { refetchQueries: refetchAfter });
  const [reject] = useMutation(REJECT_TEST_CASE, { refetchQueries: refetchAfter });

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [groupKey, setGroupKey] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [fApproval, setFApproval] = useState("");
  const [fProject, setFProject] = useState("");
  const [fFeature, setFFeature] = useState("");
  const [fCreator, setFCreator] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rejecting, setRejecting] = useState<{ id: string; key: string } | null>(null);

  const onSort = (key: string) => {
    const n = nextSort({ key: sortKey, dir: sortDir }, key);
    setSortKey(n.key);
    setSortDir(n.dir);
  };
  const toggleGroup = (label: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });
  const toggleRow = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const base: any[] = (data?.pendingTestCases ?? []).map(toRow);
  const distinct = (f: string) => [...new Set(base.map((r) => r[f]).filter(Boolean))].sort();
  const filtered = base.filter(
    (r) =>
      (!fApproval || r.approval === fApproval) &&
      (!fProject || r.projectName === fProject) &&
      (!fFeature || r.featureName === fFeature) &&
      (!fCreator || r.creatorName === fCreator),
  );
  const rows = sortRows(searchRows(filtered, search, ["name", "key", "creatorName", "featureName", "projectName"]), sortKey as any, sortDir);
  const groups: [string, any[]][] = groupKey ? Object.entries(groupRows(rows, groupKey as any)) : [["", rows]];

  // Only rows the server says this user may decide on can be bulk-approved.
  const approvable = rows.filter((r) => r.canApprove);
  const picked = approvable.filter((r) => selected.has(r.id));
  const allPicked = approvable.length > 0 && picked.length === approvable.length;
  const selCls = "h-8 rounded border border-border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring";

  const bulkApprove = async () => {
    const ids = picked.map((r) => r.id);
    const res = await withToast(
      approveMany({ variables: { ids } }),
      t("tca.bulkDone", { n: ids.length }),
      t("tca.bulkFail"),
    );
    setSelected(new Set());
    return res;
  };

  return (
    <div className="flex h-full">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="rounded border border-border">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold">{t("tca.title")}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">{t("tca.subtitle")}</p>
            </div>
            {picked.length > 0 && (
              <button
                onClick={() => void bulkApprove()}
                className="flex h-7 items-center gap-1.5 rounded bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-90"
              >
                <Check className="h-3.5 w-3.5" /> {t("tca.approveSelected", { n: picked.length })}
              </button>
            )}
          </div>
          <div className="px-5 py-4">
            <FilterBar
              search={search}
              onSearch={setSearch}
              groupKey={groupKey}
              onGroupKey={setGroupKey}
              groupOptions={[
                { value: "projectName", label: t("dash.project") },
                { value: "featureName", label: t("dash.feature") },
                { value: "creatorName", label: t("tca.createdBy") },
                { value: "approval", label: t("c.status") },
              ]}
            />
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <select value={fApproval} onChange={(e) => setFApproval(e.target.value)} className={selCls}>
                <option value="">{t("c.status")}: {t("c.all")}</option>
                <option value="PENDING">{t("tca.pending")}</option>
                <option value="REJECTED">{t("tca.rejected")}</option>
              </select>
              <select value={fProject} onChange={(e) => setFProject(e.target.value)} className={selCls}>
                <option value="">{t("dash.project")}: {t("c.all")}</option>
                {distinct("projectName").map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
              <select value={fFeature} onChange={(e) => setFFeature(e.target.value)} className={selCls}>
                <option value="">{t("dash.feature")}: {t("c.all")}</option>
                {distinct("featureName").map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
              <select value={fCreator} onChange={(e) => setFCreator(e.target.value)} className={selCls}>
                <option value="">{t("tca.createdBy")}: {t("c.all")}</option>
                {distinct("creatorName").map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="w-8 px-3 py-2 text-left">
                      {approvable.length > 0 && (
                        <input
                          type="checkbox"
                          checked={allPicked}
                          onChange={() => setSelected(allPicked ? new Set() : new Set(approvable.map((r) => r.id)))}
                          title={t("tca.selectAll")}
                          className="h-3.5 w-3.5"
                        />
                      )}
                    </th>
                    <SortableTh label={t("c.id")} colKey="key" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <SortableTh label={t("dash.testCase")} colKey="name" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <SortableTh label={t("dash.project")} colKey="projectName" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <SortableTh label={t("dash.feature")} colKey="featureName" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <SortableTh label={t("tca.createdBy")} colKey="creatorName" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <SortableTh label={t("tca.waiting")} colKey="createdAt" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <SortableTh label={t("c.status")} colKey="approval" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr><td colSpan={9} className="py-8 text-center text-muted-foreground">{t("c.loading")}</td></tr>
                  )}
                  {!loading && rows.length === 0 && (
                    <tr><td colSpan={9} className="py-8 text-center text-muted-foreground">{t("tca.empty")}</td></tr>
                  )}
                  {groups.map(([label, gr]) => (
                    <Fragment key={label || "all"}>
                      {groupKey && (
                        <tr className="cursor-pointer bg-muted/40 hover:bg-muted/60" onClick={() => toggleGroup(label)}>
                          <td colSpan={9} className="px-3 py-1.5 text-xs font-medium text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              {collapsed.has(label) ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                              {label || "—"} · {gr.length}
                            </span>
                          </td>
                        </tr>
                      )}
                      {!collapsed.has(label) && gr.map((tc: any) => (
                        <tr key={tc.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30">
                          <td className="px-3 py-2">
                            {tc.canApprove && (
                              <input
                                type="checkbox"
                                checked={selected.has(tc.id)}
                                onChange={() => toggleRow(tc.id)}
                                className="h-3.5 w-3.5"
                              />
                            )}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{tc.key}</td>
                          <td className="px-3 py-2">
                            <button onClick={() => navigate(`/test-cases/${tc.id}`)} className="text-left font-medium hover:underline">
                              {tc.name}
                            </button>
                            {tc.approval === "REJECTED" && tc.rejectReason && (
                              <div className="text-xs text-destructive">{tc.rejectReason}</div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-xs">{tc.projectName}</td>
                          <td className="px-3 py-2 text-xs">{tc.featureName}</td>
                          <td className="px-3 py-2 text-xs">{tc.creatorName}</td>
                          <td className="px-3 py-2 text-xs text-muted-foreground" title={fmt(tc.createdAt)}>
                            {waitedFor(tc.createdAt, t)}
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={cn(
                                "inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium",
                                tc.approval === "REJECTED" ? "bg-destructive text-white" : "bg-[var(--warn)] text-white",
                              )}
                            >
                              {tc.approval === "REJECTED" ? t("tca.rejected") : t("tca.pending")}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex justify-end gap-1">
                              <IconBtn title={t("c.open")} onClick={() => navigate(`/test-cases/${tc.id}`)}>
                                <FolderOpen className="h-3.5 w-3.5" />
                              </IconBtn>
                              <IconBtn
                                title={t("tca.approve")}
                                allowed={tc.canApprove}
                                onClick={() =>
                                  withToast(approve({ variables: { id: tc.id } }), t("tca.approved"), t("tca.approveFail"))
                                }
                              >
                                <Check className="h-3.5 w-3.5" />
                              </IconBtn>
                              <IconBtn
                                title={t("tca.reject")}
                                allowed={tc.canApprove}
                                onClick={() => setRejecting({ id: tc.id, key: tc.key })}
                              >
                                <X className="h-3.5 w-3.5" />
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
      </div>

      <TextPromptModal
        open={!!rejecting}
        title={t("tca.rejectTitle", { key: rejecting?.key ?? "" })}
        label={t("tca.rejectReason")}
        required
        destructive
        confirmLabel={t("tca.reject")}
        onClose={() => setRejecting(null)}
        onSubmit={(reason) => {
          const id = rejecting!.id;
          setRejecting(null);
          void withToast(reject({ variables: { id, reason } }), t("tca.rejected"), t("tca.rejectFail"));
        }}
      />
    </div>
  );
}
