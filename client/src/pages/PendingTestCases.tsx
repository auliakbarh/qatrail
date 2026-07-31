import { useState, Fragment } from "react";
import { useQuery, useMutation } from "@apollo/client";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Check, X, FolderOpen, ChevronDown, ChevronRight, Undo2 } from "lucide-react";
import {
  PENDING_TEST_CASES,
  PENDING_APPROVAL_REQUESTS,
  PENDING_APPROVAL_COUNT,
  APPROVE_TEST_CASE,
  APPROVE_TEST_CASES,
  REJECT_TEST_CASE,
  APPROVE_APPROVAL_REQUEST,
  APPROVE_APPROVAL_REQUESTS,
  REJECT_APPROVAL_REQUEST,
  CANCEL_APPROVAL_REQUEST,
} from "../graphql/hierarchy";
import { FilterBar } from "../components/FilterBar";
import { IconBtn } from "../components/IconBtn";
import { TextPromptModal } from "../components/TextPromptModal";
import { SortableTh, nextSort } from "../components/SortableTh";
import { searchRows, sortRows, groupRows } from "../lib/list";
import { withToast } from "../store/toast";
import { fmtDateTime as fmt, cn } from "../lib/utils";
import { waitedFor } from "../lib/approval";

// Lists show the human key next to the name, the way every other table does.
const label = (key?: string | null, name?: string | null) => (name ? (key ? `${key} · ${name}` : name) : "—");

// Two things queue up for review: cases (new or edited) and changes to an
// existing case (move/copy/delete/(de)activate). One table, one shape.
function caseRow(tc: any) {
  return {
    rowKind: "CASE" as const,
    scope: "TEST_CASE" as const,
    id: tc.id,
    testCaseId: tc.id,
    key: tc.key,
    name: tc.name,
    // firstApprovedAt is never cleared, so it tells a brand-new case from a
    // re-review of an edit.
    type: tc.approval === "REJECTED" ? "REJECTED" : tc.firstApprovedAt ? "EDIT" : "NEW",
    approval: tc.approval,
    rejectReason: tc.rejectReason,
    canApprove: tc.canApprove,
    // A content review has nothing to withdraw: an unwanted new case is deleted,
    // and an edit can't be un-edited.
    canCancel: false,
    waitingSince: tc.createdAt,
    creatorName: tc.createdBy?.name ?? "",
    featureName: label(tc.feature?.key, tc.feature?.name),
    projectName: label(tc.feature?.project?.key, tc.feature?.project?.name),
    detail: "",
  };
}

// A request can be about a project, a feature or a test case — the row shows
// which, so a "DELETE" on a whole project can never be mistaken for one case.
function requestRow(r: any) {
  const target = [r.targetFeature?.name, r.targetProject?.name, r.targetName, r.assignmentMode].filter(Boolean).join(" · ");
  const feature = r.feature ?? r.testCase?.feature;
  return {
    rowKind: "REQUEST" as const,
    id: r.id,
    scope: r.target as "PROJECT" | "FEATURE" | "TEST_CASE" | "APP_TEST",
    testCaseId: r.testCase?.id ?? null,
    // Every level has a human key now, so the ID column is filled whatever the
    // request is about.
    key: r.testCase?.key ?? r.feature?.key ?? r.project?.key ?? r.appTest?.key ?? "—",
    // An app test has no name of its own — its key *is* its name, and that is
    // already in the ID column.
    name: r.testCase?.name ?? r.feature?.name ?? r.project?.name ?? "—",
    type: r.kind,
    approval: "PENDING",
    rejectReason: null,
    canApprove: r.canApprove,
    canCancel: r.canCancel,
    waitingSince: r.requestedAt,
    creatorName: r.requestedBy?.name ?? "",
    featureName: label(feature?.key, feature?.name),
    projectName: r.project
      ? label(r.project.key, r.project.name)
      : label(feature?.project?.key, feature?.project?.name),
    detail: target,
  };
}

export default function PendingTestCases() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const refetchAfter = [
    { query: PENDING_TEST_CASES, variables: { projectId: null } },
    { query: PENDING_APPROVAL_REQUESTS, variables: { projectId: null } },
    { query: PENDING_APPROVAL_COUNT },
    "TestCases",
  ];
  const { data, loading } = useQuery(PENDING_TEST_CASES, {
    variables: { projectId: null },
    fetchPolicy: "cache-and-network",
  });
  const { data: reqData, loading: reqLoading } = useQuery(PENDING_APPROVAL_REQUESTS, {
    variables: { projectId: null },
    fetchPolicy: "cache-and-network",
  });
  const [approve] = useMutation(APPROVE_TEST_CASE, { refetchQueries: refetchAfter });
  const [approveMany] = useMutation(APPROVE_TEST_CASES, { refetchQueries: refetchAfter });
  const [reject] = useMutation(REJECT_TEST_CASE, { refetchQueries: refetchAfter });
  const [approveReq] = useMutation(APPROVE_APPROVAL_REQUEST, { refetchQueries: refetchAfter });
  const [approveReqMany] = useMutation(APPROVE_APPROVAL_REQUESTS, { refetchQueries: refetchAfter });
  const [rejectReq] = useMutation(REJECT_APPROVAL_REQUEST, { refetchQueries: refetchAfter });
  const [cancelReq] = useMutation(CANCEL_APPROVAL_REQUEST, { refetchQueries: refetchAfter });

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("waitingSince");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [groupKey, setGroupKey] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [fType, setFType] = useState("");
  const [fProject, setFProject] = useState("");
  const [fFeature, setFFeature] = useState("");
  const [fCreator, setFCreator] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rejecting, setRejecting] = useState<{ id: string; key: string; rowKind: "CASE" | "REQUEST" } | null>(null);

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

  const base: any[] = [
    ...(data?.pendingTestCases ?? []).map(caseRow),
    ...(reqData?.pendingApprovalRequests ?? []).map(requestRow),
  ];
  const distinct = (f: string) => [...new Set(base.map((r) => r[f]).filter(Boolean))].sort();
  const filtered = base.filter(
    (r) =>
      (!fType || r.type === fType) &&
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

  // One button, two mutations: the selection can mix content reviews with change
  // requests, and each has its own endpoint.
  const bulkApprove = async () => {
    const caseIds = picked.filter((r) => r.rowKind === "CASE").map((r) => r.id);
    const reqIds = picked.filter((r) => r.rowKind === "REQUEST").map((r) => r.id);
    const res = await withToast(
      Promise.all([
        caseIds.length ? approveMany({ variables: { ids: caseIds } }) : null,
        reqIds.length ? approveReqMany({ variables: { ids: reqIds } }) : null,
      ]),
      t("tca.bulkDone", { n: caseIds.length + reqIds.length }),
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
                { value: "type", label: t("tca.type") },
              ]}
            />
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <select value={fType} onChange={(e) => setFType(e.target.value)} className={selCls}>
                <option value="">{t("tca.type")}: {t("c.all")}</option>
                {["NEW", "EDIT", "REJECTED", "MOVE", "COPY", "DELETE", "DEACTIVATE", "ACTIVATE"].map((v) => (
                  <option key={v} value={v}>{t(`tcr.kind.${v}`)}</option>
                ))}
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
                    <SortableTh label={t("tca.item")} colKey="scope" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <SortableTh label={t("c.name")} colKey="name" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <SortableTh label={t("dash.project")} colKey="projectName" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <SortableTh label={t("dash.feature")} colKey="featureName" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <SortableTh label={t("tca.createdBy")} colKey="creatorName" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <SortableTh label={t("tca.waiting")} colKey="waitingSince" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <SortableTh label={t("tca.type")} colKey="type" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {(loading || reqLoading) && (
                    <tr><td colSpan={10} className="py-8 text-center text-muted-foreground">{t("c.loading")}</td></tr>
                  )}
                  {!loading && !reqLoading && rows.length === 0 && (
                    <tr><td colSpan={10} className="py-8 text-center text-muted-foreground">{t("tca.empty")}</td></tr>
                  )}
                  {groups.map(([label, gr]) => (
                    <Fragment key={label || "all"}>
                      {groupKey && (
                        <tr className="cursor-pointer bg-muted/40 hover:bg-muted/60" onClick={() => toggleGroup(label)}>
                          <td colSpan={10} className="px-3 py-1.5 text-xs font-medium text-muted-foreground">
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
                          {/* What kind of thing this is, in its own column: a
                              DELETE on a project must never read like a DELETE on
                              one test case. */}
                          <td className="px-3 py-2">
                            <span className="inline-flex items-center rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                              {t(`tcr.scope.${tc.scope}`)}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <button
                              onClick={() => tc.testCaseId && navigate(`/test-cases/${tc.testCaseId}`)}
                              className={cn("text-left font-medium", tc.testCaseId && "hover:underline")}
                            >
                              {tc.name}
                            </button>
                            {tc.rejectReason && <div className="text-xs text-destructive">{tc.rejectReason}</div>}
                            {tc.detail && <div className="text-xs text-muted-foreground">→ {tc.detail}</div>}
                          </td>
                          <td className="px-3 py-2 text-xs">{tc.projectName}</td>
                          <td className="px-3 py-2 text-xs">{tc.featureName}</td>
                          <td className="px-3 py-2 text-xs">{tc.creatorName}</td>
                          <td className="px-3 py-2 text-xs text-muted-foreground" title={fmt(tc.waitingSince)}>
                            {waitedFor(tc.waitingSince, t)}
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={cn(
                                "inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium",
                                tc.type === "REJECTED" || tc.type === "DELETE"
                                  ? "bg-destructive text-white"
                                  : tc.type === "NEW" || tc.type === "EDIT"
                                    ? "bg-[var(--warn)] text-white"
                                    : "border border-border text-muted-foreground",
                              )}
                            >
                              {t(`tcr.kind.${tc.type}`)}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex justify-end gap-1">
                              <IconBtn
                                title={t("c.open")}
                                allowed={!!tc.testCaseId}
                                onClick={() => navigate(`/test-cases/${tc.testCaseId}`)}
                              >
                                <FolderOpen className="h-3.5 w-3.5" />
                              </IconBtn>
                              <IconBtn
                                title={t("tca.approve")}
                                allowed={tc.canApprove}
                                onClick={() =>
                                  withToast(
                                    tc.rowKind === "CASE"
                                      ? approve({ variables: { id: tc.id } })
                                      : approveReq({ variables: { id: tc.id } }),
                                    t("tca.approved"),
                                    t("tca.approveFail"),
                                  )
                                }
                              >
                                <Check className="h-3.5 w-3.5" />
                              </IconBtn>
                              <IconBtn
                                title={t("tca.reject")}
                                allowed={tc.canApprove}
                                onClick={() => setRejecting({ id: tc.id, key: tc.key, rowKind: tc.rowKind })}
                              >
                                <X className="h-3.5 w-3.5" />
                              </IconBtn>
                              {/* Withdrawing is the requester's own move, so it
                                  shows up only on their rows. */}
                              {tc.canCancel && (
                                <IconBtn
                                  title={t("tcr.cancel")}
                                  onClick={() =>
                                    withToast(
                                      cancelReq({ variables: { id: tc.id } }),
                                      t("tcr.cancelled"),
                                      t("tcr.cancelFail"),
                                    )
                                  }
                                >
                                  <Undo2 className="h-3.5 w-3.5" />
                                </IconBtn>
                              )}
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
          const { id, rowKind } = rejecting!;
          setRejecting(null);
          void withToast(
            rowKind === "CASE" ? reject({ variables: { id, reason } }) : rejectReq({ variables: { id, reason } }),
            t("tca.rejected"),
            t("tca.rejectFail"),
          );
        }}
      />
    </div>
  );
}
