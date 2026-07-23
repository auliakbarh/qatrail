import { useState, Fragment } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@apollo/client";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Pencil, Trash2, Plus, ClipboardCheck, XCircle, ChevronDown, ChevronRight } from "lucide-react";
import { APP_TEST, ASSIGNED_TEST_CASES, DELETE_APP_TEST, UNASSIGN_TEST_CASE, CLOSE_APP_TEST } from "../graphql/apptest";
import { useNav } from "../store/nav";
import { useAuth } from "../store/auth";
import { canManageContent } from "../lib/perm";
import { FilterBar } from "../components/FilterBar";
import { HeaderButton } from "../components/HeaderButton";
import { IconBtn } from "../components/IconBtn";
import { DeleteConfirm } from "../components/DeleteConfirm";
import { Modal } from "../components/Modal";
import { CoverageBar } from "../components/CoverageBar";
import { SortableTh, nextSort } from "../components/SortableTh";
import { CommentsCard } from "../components/CommentsCard";
import { WatchButton } from "../components/WatchButton";
import { searchRows, sortRows, groupRows } from "../lib/list";
import { withToast } from "../store/toast";
import { fmtDateTime as fmt } from "../lib/utils";
import { AppTestForm } from "./forms/AppTestForm";
import { AssignTestCasesPanel } from "./forms/AssignTestCasesPanel";
import { RecordForm } from "./forms/RecordForm";
import { IssueForm } from "./forms/IssueForm";

function Info({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div>{value}</div>
    </div>
  );
}

export default function AppTestDetail() {
  const { t } = useTranslation();
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { panel, openPanel } = useNav();
  const manage = canManageContent(user?.role); // QA/admin: assign, record, close

  const { data, loading } = useQuery(APP_TEST, { variables: { id }, fetchPolicy: "cache-and-network" });
  const { data: tcData } = useQuery(ASSIGNED_TEST_CASES, { variables: { appTestId: id }, fetchPolicy: "cache-and-network" });
  const refetch = { refetchQueries: [{ query: APP_TEST, variables: { id } }, { query: ASSIGNED_TEST_CASES, variables: { appTestId: id } }] };
  const [unassign] = useMutation(UNASSIGN_TEST_CASE, refetch);
  const [closeTesting] = useMutation(CLOSE_APP_TEST, refetch);
  const [deleteAppTest] = useMutation(DELETE_APP_TEST);

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("tcKey");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [groupKey, setGroupKey] = useState("");
  const [fFeature, setFFeature] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fQa, setFQa] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleGroup = (label: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });
  const [del, setDel] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [closeConfirm, setCloseConfirm] = useState(false);

  const onSort = (key: string) => {
    const n = nextSort({ key: sortKey, dir: sortDir }, key);
    setSortKey(n.key);
    setSortDir(n.dir);
  };

  if (loading && !data) return <div className="p-6 text-sm text-muted-foreground">{t("c.loading")}</div>;
  const a = data?.appTest;
  // App test was deleted (or never existed): show a deleted state, not a blank page.
  if (!a) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-muted/30 px-4 text-center">
        <h1 className="text-lg font-semibold">{t("at.deletedTitle")}</h1>
        <p className="max-w-sm text-sm text-muted-foreground">{t("at.deletedText")}</p>
        <button onClick={() => navigate("/app-tests")} className="text-xs text-primary underline underline-offset-2 hover:text-primary/80">
          {t("at.backToList")}
        </button>
      </div>
    );
  }

  const canEdit = a.createdBy?.id === user?.id || user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
  const askDelete = () => (a.status !== "OPEN" ? setBlocked(true) : setDel(true));

  // Deep-link into the dashboard drilldown to show a test case's detail page.
  const openTestCase = (r: any) => {
    useNav.setState({ projectId: a.projectId, featureId: r.featureId, testCaseId: r.testCase.id, issueId: null, panel: null });
    navigate("/");
  };

  const rows0 = (tcData?.assignedTestCases ?? []).map((r: any) => ({
    ...r,
    tcKey: r.testCase.key,
    tcName: r.testCase.name,
    qaName: r.assignedBy?.name ?? "",
  }));
  const distinct = (k: string) => [...new Set(rows0.map((r: any) => r[k]).filter(Boolean))].sort();
  const filtered = rows0.filter(
    (r: any) => (!fFeature || r.featureName === fFeature) && (!fStatus || r.status === fStatus) && (!fQa || r.qaName === fQa),
  );
  const rows = sortRows(searchRows(filtered, search, ["tcKey", "tcName", "featureName", "qaName"]), sortKey as any, sortDir);
  const groups: [string, any[]][] = groupKey ? Object.entries(groupRows(rows, groupKey as any)) : [["", rows]];

  const selCls = "h-8 rounded border border-border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring";
  const tickets = a.jiraTickets ?? [];

  return (
    <div className="flex h-full">
      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        {/* Header */}
        <div className="rounded border border-border">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div className="flex items-center gap-2">
              <button onClick={() => navigate("/app-tests")} className="flex h-7 w-7 items-center justify-center rounded border border-border hover:bg-muted">
                <ArrowLeft className="h-3.5 w-3.5" />
              </button>
              <span className="font-mono text-xs text-muted-foreground">{a.key}</span>
              <span className="inline-flex rounded bg-primary px-1.5 py-0.5 text-xs font-medium text-primary-foreground">{a.status}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <WatchButton target="APP_TEST" targetId={id} />
              {a.status !== "CLOSED" && (
                <IconBtn title={t("at.closeTesting")} allowed={manage} onClick={() => setCloseConfirm(true)}><XCircle className="h-3.5 w-3.5" /></IconBtn>
              )}
              <IconBtn title={t("c.edit")} allowed={canEdit} onClick={() => openPanel({ kind: "apptest", mode: "edit", id: a.id })}><Pencil className="h-3.5 w-3.5" /></IconBtn>
              <IconBtn title={t("c.delete")} allowed={canEdit} onClick={askDelete}><Trash2 className="h-3.5 w-3.5" /></IconBtn>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 px-5 py-4 text-xs md:grid-cols-4">
            <Info label={t("at.project")} value={a.projectName} />
            <Info label={t("iss.environment")} value={a.environment} />
            <Info label={t("iss.platform")} value={a.platform} />
            <Info label={t("at.creator")} value={a.createdBy?.name} />
            <Info label={t("form.appVersion")} value={a.appVersion ?? "—"} />
            <Info label={t("form.backendVersion")} value={a.backendVersion ?? "—"} />
            <Info label={t("at.dateCreated")} value={fmt(a.createdAt)} />
            <Info label={t("at.dateDone")} value={a.doneTestAt ? fmt(a.doneTestAt) : "—"} />
            <Info label={t("at.downloadLink")} value={<a href={a.downloadLink} target="_blank" rel="noreferrer" className="text-primary hover:underline">{t("at.openLink")}</a>} />
            <Info label={t("at.jiraTickets")} value={tickets.length ? tickets.join(", ") : "—"} />
            <div className="col-span-2 md:col-span-2">
              <div className="text-muted-foreground">{t("at.progress")}</div>
              <CoverageBar percent={a.passPercent} min={100} ready={a.status === "PASSED"} />
            </div>
          </div>
          {a.note && <div className="border-t border-border px-5 py-3 text-xs"><span className="text-muted-foreground">{t("c.note")}: </span>{a.note}</div>}
        </div>

        {/* Assigned test cases */}
        <div className="rounded border border-border">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h3 className="text-sm font-semibold">{t("at.assignedTestCases")} ({rows0.length})</h3>
            <HeaderButton allowed={manage} icon={Plus} onClick={() => openPanel({ kind: "assigntc", mode: "create" })}>
              {t("at.assign")}
            </HeaderButton>
          </div>
          <div className="px-5 py-4">
            <FilterBar
              search={search}
              onSearch={setSearch}
              groupKey={groupKey}
              onGroupKey={setGroupKey}
              groupOptions={[
                { value: "featureName", label: t("at.feature") },
                { value: "status", label: t("c.status") },
                { value: "qaName", label: t("at.qaAssigner") },
              ]}
            />
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <select value={fFeature} onChange={(e) => setFFeature(e.target.value)} className={selCls}>
                <option value="">{t("at.feature")}: {t("c.all")}</option>
                {distinct("featureName").map((v: any) => <option key={v} value={v}>{v}</option>)}
              </select>
              <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className={selCls}>
                <option value="">{t("c.status")}: {t("c.all")}</option>
                {distinct("status").map((v: any) => <option key={v} value={v}>{v}</option>)}
              </select>
              <select value={fQa} onChange={(e) => setFQa(e.target.value)} className={selCls}>
                <option value="">{t("at.qaAssigner")}: {t("c.all")}</option>
                {distinct("qaName").map((v: any) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <SortableTh label={t("at.tcNo")} colKey="tcKey" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <SortableTh label={t("at.tcTitle")} colKey="tcName" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <SortableTh label={t("at.feature")} colKey="featureName" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <SortableTh label={t("c.status")} colKey="status" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <SortableTh label={t("at.issues")} colKey="issueCount" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <SortableTh label={t("at.qaAssigner")} colKey="qaName" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <SortableTh label={t("at.dateAssigned")} colKey="assignedAt" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <SortableTh label={t("at.dateDone")} colKey="doneTestAt" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows0.length === 0 && <tr><td colSpan={9} className="py-8 text-center text-muted-foreground">{t("at.noAssigned")}</td></tr>}
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
                      {!collapsed.has(label) && gr.map((r: any) => (
                        <tr key={r.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30">
                          <td className="px-3 py-2">
                            <button onClick={() => openTestCase(r)} className="font-mono text-xs text-primary hover:underline">{r.tcKey}</button>
                          </td>
                          <td className="px-3 py-2">
                            <button onClick={() => openTestCase(r)} className="text-left hover:underline">{r.tcName}</button>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{r.featureName}</td>
                          <td className="px-3 py-2"><span className="inline-flex rounded bg-muted px-1.5 py-0.5 text-xs font-medium">{r.status}</span></td>
                          <td className="px-3 py-2 tabular-nums">
                            {r.issueCount > 0
                              ? <button onClick={() => navigate(`/issues?appTest=${id}&testCase=${r.testCase.id}`)} className="text-primary hover:underline">{r.issueCount}</button>
                              : r.issueCount}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{r.qaName}</td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{fmt(r.assignedAt)}</td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{r.doneTestAt ? fmt(r.doneTestAt) : "—"}</td>
                          <td className="px-3 py-2">
                            <div className="flex justify-end gap-1">
                              <IconBtn title={t("at.recordTest")} allowed={manage} onClick={() => openPanel({ kind: "record", mode: "create", initial: { testCaseId: r.testCase.id, featureId: r.featureId } })}>
                                <ClipboardCheck className="h-3.5 w-3.5" />
                              </IconBtn>
                              <IconBtn title={t("at.unassign")} allowed={manage} onClick={() => withToast(unassign({ variables: { appTestId: id, testCaseId: r.testCase.id } }), t("t.unassignDone"), t("c.somethingWrong"))}>
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

        {/* Comments */}
        <CommentsCard target="APP_TEST" targetId={id} />

        <DeleteConfirm
          open={del}
          onClose={() => setDel(false)}
          onConfirm={() => withToast(deleteAppTest({ variables: { id } }), t("t.appTestDeleted"), t("t.appTestDeleteFail")).then((ok) => ok && navigate("/app-tests"))}
          label={a.key}
        />
        <Modal open={blocked} onClose={() => setBlocked(false)} title={t("at.cannotDeleteTitle")}
          footer={<button onClick={() => setBlocked(false)} className="h-7 rounded bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90">{t("c.ok")}</button>}>
          <p className="text-sm text-muted-foreground">{t("at.cannotDeleteBody")}</p>
        </Modal>
        <Modal open={closeConfirm} onClose={() => setCloseConfirm(false)} title={t("at.closeTesting")}
          footer={<>
            <button onClick={() => setCloseConfirm(false)} className="h-7 rounded border border-border px-3 text-xs hover:bg-muted">{t("c.cancel")}</button>
            <button onClick={() => { setCloseConfirm(false); withToast(closeTesting({ variables: { appTestId: id } }), t("t.appTestClosed"), t("c.somethingWrong")); }} className="h-7 rounded bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90">{t("at.closeTesting")}</button>
          </>}>
          <p className="text-sm text-muted-foreground">{t("at.closeConfirmBody")}</p>
        </Modal>
      </div>

      {/* Right panel */}
      {panel?.kind === "apptest" && <AppTestForm panel={panel} />}
      {panel?.kind === "assigntc" && <AssignTestCasesPanel appTestId={id} projectId={a.projectId} />}
      {panel?.kind === "record" && panel.initial?.testCaseId && (
        <RecordForm testCaseId={panel.initial.testCaseId} featureId={panel.initial.featureId} appTestId={id} retestIssueId={panel.initial.retestIssueId} appTest={a} />
      )}
      {panel?.kind === "issue" && panel.initial?.testCaseId && (
        <IssueForm panel={panel} testCaseId={panel.initial.testCaseId} featureId={panel.initial.featureId} appTestId={id} />
      )}
    </div>
  );
}
