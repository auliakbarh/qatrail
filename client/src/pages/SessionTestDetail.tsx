import { useState, Fragment } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@apollo/client";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Pencil, Trash2, Plus, ClipboardCheck, XCircle, ChevronDown, ChevronRight, Printer, Link2, PlayCircle, Send } from "lucide-react";
import {
  SESSION_TEST,
  SESSION_TESTS,
  SESSION_TEST_CASES,
  SESSION_TEST_RECORDS,
  DELETE_SESSION_TEST,
  REMOVE_SESSION_TEST_APP,
  UNASSIGN_SESSION_TEST_CASE,
  ASSIGN_SESSION_TEST_CASES,
  SESSION_ASSIGNABLE_TEST_CASES,
  POST_SESSION_TEST_TO_JIRA,
} from "../graphql/sessiontest";
import { ANALYTICS } from "../graphql/analytics";
import { HEALTH } from "../graphql";
import { useNav, drillPath } from "../store/nav";
import { useAuth } from "../store/auth";
import { canManageContent } from "../lib/perm";
import { FilterBar } from "../components/FilterBar";
import { HeaderButton } from "../components/HeaderButton";
import { IconBtn } from "../components/IconBtn";
import { DeleteConfirm } from "../components/DeleteConfirm";
import { CoverageBar } from "../components/CoverageBar";
import { CommentsCard } from "../components/CommentsCard";
import { WatchButton } from "../components/WatchButton";
import { JiraTicketLinks } from "../components/JiraTicketLinks";
import { SortableTh, nextSort } from "../components/SortableTh";
import { searchRows, sortRows, groupRows } from "../lib/list";
import { withToast } from "../store/toast";
import { fmtDateTime as fmt } from "../lib/utils";
import { printSessionSignOff } from "../lib/printReport";
import { SessionTestForm } from "./forms/SessionTestForm";
import { SessionTestAppForm } from "./forms/SessionTestAppForm";
import { AssignSessionTestCasesPanel } from "./forms/AssignSessionTestCasesPanel";
import { TestCaseForm } from "./forms/TestCaseForm";
import { CloseSessionForm } from "./forms/CloseSessionForm";
import { RecordForm } from "./forms/RecordForm";
import { BulkRecordForm } from "./forms/BulkRecordForm";
import { IssueForm } from "./forms/IssueForm";
import { useIssueQueue } from "../lib/useIssueQueue";

function Info({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div>{value}</div>
    </div>
  );
}

export default function SessionTestDetail() {
  const { t } = useTranslation();
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { panel, openPanel } = useNav();
  const manage = canManageContent(user?.role);

  const { data, loading } = useQuery(SESSION_TEST, { variables: { id }, fetchPolicy: "cache-and-network" });
  const { data: tcData } = useQuery(SESSION_TEST_CASES, { variables: { sessionTestId: id }, fetchPolicy: "cache-and-network" });
  const { data: recData } = useQuery(SESSION_TEST_RECORDS, { variables: { sessionTestId: id }, fetchPolicy: "cache-and-network" });
  const { data: anData } = useQuery(ANALYTICS, { variables: { sessionTestId: id }, fetchPolicy: "cache-and-network" });
  const refetch = {
    refetchQueries: [
      { query: SESSION_TEST, variables: { id } },
      { query: SESSION_TEST_CASES, variables: { sessionTestId: id } },
    ],
  };
  const [unassign] = useMutation(UNASSIGN_SESSION_TEST_CASE, refetch);
  const [assignCases] = useMutation(ASSIGN_SESSION_TEST_CASES, {
    refetchQueries: [
      ...refetch.refetchQueries,
      { query: SESSION_ASSIGNABLE_TEST_CASES, variables: { sessionTestId: id } },
    ],
  });
  const [removeApp] = useMutation(REMOVE_SESSION_TEST_APP, refetch);
  const [deleteSession] = useMutation(DELETE_SESSION_TEST, {
    refetchQueries: [{ query: SESSION_TESTS, variables: { projectId: null } }],
  });
  const { data: healthData } = useQuery(HEALTH, { fetchPolicy: "cache-first" });
  const [postToJira, { loading: posting }] = useMutation(POST_SESSION_TEST_TO_JIRA);

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("tcKey");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [groupKey, setGroupKey] = useState("");
  const [fFeature, setFFeature] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [del, setDel] = useState(false);
  // Bulk run: pick rows here, record them in one panel, then walk the issue form
  // over whatever failed.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const issueQueue = useIssueQueue();
  const toggleSel = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

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

  if (loading && !data) return <div className="p-6 text-sm text-muted-foreground">{t("c.loading")}</div>;
  const s = data?.sessionTest;
  if (!s) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-muted/30 px-4 text-center">
        <h1 className="text-lg font-semibold">{t("st.deletedTitle")}</h1>
        <p className="max-w-sm text-sm text-muted-foreground">{t("st.deletedText")}</p>
        <button onClick={() => navigate("/session-tests")} className="text-xs text-primary underline underline-offset-2 hover:text-primary/80">
          {t("st.backToList")}
        </button>
      </div>
    );
  }

  const canEdit = s.createdBy?.id === user?.id || user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
  const apps = s.apps ?? [];
  const tickets = s.jiraTickets ?? [];
  const rows0 = (tcData?.sessionTestCases ?? []).map((r: any) => ({
    ...r,
    tcKey: r.testCase.key,
    tcName: r.testCase.name,
    appNames: (r.apps ?? []).map((a: any) => a.name).join(", "),
  }));
  const records = recData?.sessionTestRecords ?? [];
  const notStarted = rows0.filter((r: any) => r.status === "NOT_STARTED").length;
  const an = anData?.analytics;

  const distinct = (k: string) => [...new Set(rows0.map((r: any) => r[k]).filter(Boolean))].sort();
  const filtered = rows0.filter((r: any) => (!fFeature || r.featureName === fFeature) && (!fStatus || r.status === fStatus));
  const rows = sortRows(searchRows(filtered, search, ["tcKey", "tcName", "featureName", "appNames"]), sortKey as any, sortDir);
  const groups: [string, any[]][] = groupKey ? Object.entries(groupRows(rows, groupKey as any)) : [["", rows]];
  // Selection is over what's currently listed, so a filtered "select all" means
  // what it looks like.
  const selectedRows = rows.filter((r: any) => selected.has(r.testCase.id));
  const allSelected = rows.length > 0 && selectedRows.length === rows.length;
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map((r: any) => r.testCase.id)));
  // Each case carries its own related apps: with exactly one, it prefills the issue.
  const bulkCases = selectedRows.map((r: any) => ({
    testCaseId: r.testCase.id,
    featureId: r.featureId,
    key: r.tcKey,
    name: r.tcName,
    apps: r.apps,
  }));
  const cols = manage ? 9 : 8; // + the bulk-select checkbox

  // Deep-link into the hierarchy drilldown; `from` keeps the breadcrumb rooted here.
  const openTestCase = (r: any) => {
    const path = drillPath({ projectId: s.projectId, featureId: r.featureId, testCaseId: r.testCase.id });
    navigate(`${path}?from=session:${id}`);
  };

  const selCls = "h-8 rounded border border-border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="flex h-full">
      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        {/* Header */}
        <div className="rounded border border-border">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div className="flex items-center gap-2">
              <button onClick={() => navigate("/session-tests")} className="flex h-7 w-7 items-center justify-center rounded border border-border hover:bg-muted">
                <ArrowLeft className="h-3.5 w-3.5" />
              </button>
              <span className="font-mono text-xs text-muted-foreground">{s.key}</span>
              <span className="inline-flex rounded bg-primary px-1.5 py-0.5 text-xs font-medium text-primary-foreground">{t(`st.status.${s.status}`)}</span>
              <span className="inline-flex rounded border border-border px-1.5 py-0.5 text-xs font-medium text-muted-foreground">{s.kindLabel}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <WatchButton target="SESSION_TEST" targetId={id} />
              {tickets.length > 0 && healthData?.health?.jiraConfigured && (
                <IconBtn title={posting ? t("jira.posting") : t("at.postToJira")} allowed={manage}
                  onClick={() => withToast(postToJira({ variables: { id } }), t("t.jiraPosted"), t("t.jiraPostFail"))}>
                  <Send className="h-3.5 w-3.5" />
                </IconBtn>
              )}
              <IconBtn title={t("st.exportSignOff")} onClick={() => printSessionSignOff(s, apps, rows0, records, user?.name ?? "")}>
                <Printer className="h-3.5 w-3.5" />
              </IconBtn>
              {s.status !== "CLOSED" && (
                <IconBtn title={t("st.closeSession")} allowed={manage} onClick={() => openPanel({ kind: "closesession", mode: "create" })}>
                  <XCircle className="h-3.5 w-3.5" />
                </IconBtn>
              )}
              <IconBtn title={t("c.edit")} allowed={canEdit} onClick={() => openPanel({ kind: "sessiontest", mode: "edit", id: s.id })}><Pencil className="h-3.5 w-3.5" /></IconBtn>
              <IconBtn title={t("c.delete")} allowed={canEdit} onClick={() => setDel(true)}><Trash2 className="h-3.5 w-3.5" /></IconBtn>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 px-5 py-4 text-xs md:grid-cols-4">
            <Info label={t("at.project")} value={s.projectName} />
            <Info label={t("st.dateTest")} value={fmt(s.testedAt)} />
            <Info label={t("at.creator")} value={s.createdBy?.name} />
            <Info label={t("at.dateCreated")} value={fmt(s.createdAt)} />
            <Info label={t("st.stakeholders")} value={(s.stakeholders ?? []).join(", ") || "—"} />
            <Info label={t("st.minPassPercent")} value={`${s.minPassPercent}%`} />
            <Info label={t("st.closedAt")} value={s.closedAt ? fmt(s.closedAt) : "—"} />
            <Info label={t("at.issues")} value={s.issueCount} />
            <Info label={t("at.jiraTickets")} value={<JiraTicketLinks tickets={tickets} baseUrl={healthData?.health?.jiraBaseUrl} />} />
            <div className="col-span-2">
              <div className="text-muted-foreground">{t("st.passPercent")}</div>
              <CoverageBar percent={s.passPercent} min={s.minPassPercent} ready={s.passPercent >= s.minPassPercent} />
            </div>
            {an && (
              <div className="col-span-2">
                <div className="text-muted-foreground">{t("st.findingsBreakdown")}</div>
                <div>{t("an.defects")}: {an.totalDefects} · {t("an.bugs")}: {an.totalBugs} · {t("an.resolutionRate")}: {an.resolutionRate}%</div>
              </div>
            )}
          </div>
          {s.note && <div className="border-t border-border px-5 py-3 text-xs"><span className="text-muted-foreground">{t("c.note")}: </span>{s.note}</div>}
          {s.summary && <div className="border-t border-border px-5 py-3 text-xs"><span className="text-muted-foreground">{t("st.summary")}: </span>{s.summary}</div>}
        </div>

        {/* Apps under test */}
        <div className="rounded border border-border">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h3 className="text-sm font-semibold">{t("st.apps")} ({apps.length})</h3>
            <HeaderButton allowed={canEdit} icon={Plus} onClick={() => openPanel({ kind: "sessiontestapp", mode: "create" })}>
              {t("st.addApp")}
            </HeaderButton>
          </div>
          <div className="overflow-x-auto px-5 py-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2">{t("st.appName")}</th>
                  <th className="px-3 py-2">{t("st.linkedAppTest")}</th>
                  <th className="px-3 py-2">{t("st.versionFe")}</th>
                  <th className="px-3 py-2">{t("st.versionBe")}</th>
                  <th className="px-3 py-2">{t("iss.environment")}</th>
                  <th className="px-3 py-2">{t("iss.platform")}</th>
                  <th className="px-3 py-2">{t("c.note")}</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {apps.length === 0 && <tr><td colSpan={8} className="py-6 text-center text-muted-foreground">{t("st.noApps")}</td></tr>}
                {apps.map((a: any) => (
                  <tr key={a.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30">
                    <td className="px-3 py-2">{a.name}</td>
                    <td className="px-3 py-2 text-xs">
                      {a.appTestId
                        ? <button onClick={() => navigate(`/app-tests/${a.appTestId}`)} className="inline-flex items-center gap-1 font-mono text-primary hover:underline"><Link2 className="h-3 w-3" />{a.appTestKey}</button>
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{a.versionFe ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{a.versionBe ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{a.environment ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{a.platform ?? "—"}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{a.note ?? "—"}</td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        <IconBtn title={t("c.edit")} allowed={canEdit} onClick={() => openPanel({ kind: "sessiontestapp", mode: "edit", id: a.id, initial: a })}>
                          <Pencil className="h-3.5 w-3.5" />
                        </IconBtn>
                        <IconBtn title={t("c.delete")} allowed={canEdit} onClick={() => withToast(removeApp({ variables: { id: a.id } }), t("t.appRemoved"), t("c.somethingWrong"))}>
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

        {/* Test cases in this session */}
        <div className="rounded border border-border">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h3 className="text-sm font-semibold">{t("st.cases")} ({rows0.length})</h3>
            <div className="flex items-center gap-2">
              {bulkCases.length > 0 && (
                <HeaderButton allowed={manage} icon={PlayCircle} onClick={() => openPanel({ kind: "bulkrecord", mode: "create" })}>
                  {t("bulkrun.run", { n: bulkCases.length })}
                </HeaderButton>
              )}
              <HeaderButton allowed={manage} icon={Plus} onClick={() => openPanel({ kind: "assignsessiontc", mode: "create" })}>
                {t("at.assign")}
              </HeaderButton>
            </div>
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
                { value: "appNames", label: t("st.apps") },
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
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {manage && (
                      <th className="w-8 px-3 py-2 text-left">
                        <input type="checkbox" checked={allSelected} onChange={toggleAll} className="cursor-pointer" title={t("bulkrun.selectAll")} />
                      </th>
                    )}
                    <SortableTh label={t("at.tcNo")} colKey="tcKey" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <SortableTh label={t("at.tcTitle")} colKey="tcName" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <SortableTh label={t("at.feature")} colKey="featureName" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <SortableTh label={t("c.status")} colKey="status" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <SortableTh label={t("st.apps")} colKey="appNames" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <SortableTh label={t("at.issues")} colKey="issueCount" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <SortableTh label={t("at.dateDone")} colKey="doneTestAt" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows0.length === 0 && <tr><td colSpan={cols} className="py-8 text-center text-muted-foreground">{t("st.noCases")}</td></tr>}
                  {groups.map(([label, gr]) => (
                    <Fragment key={label || "all"}>
                      {groupKey && (
                        <tr className="cursor-pointer bg-muted/40 hover:bg-muted/60" onClick={() => toggleGroup(label)}>
                          <td colSpan={cols} className="px-3 py-1.5 text-xs font-medium text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              {collapsed.has(label) ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                              {label || "—"} · {gr.length}
                            </span>
                          </td>
                        </tr>
                      )}
                      {!collapsed.has(label) && gr.map((r: any) => (
                        <tr key={r.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30">
                          {manage && (
                            <td className="px-3 py-2">
                              <input type="checkbox" checked={selected.has(r.testCase.id)} onChange={() => toggleSel(r.testCase.id)} className="cursor-pointer" />
                            </td>
                          )}
                          <td className="px-3 py-2">
                            <button onClick={() => openTestCase(r)} className="font-mono text-xs text-primary hover:underline">{r.tcKey}</button>
                          </td>
                          <td className="px-3 py-2">
                            <button onClick={() => openTestCase(r)} className="text-left hover:underline">{r.tcName}</button>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{r.featureName}</td>
                          <td className="px-3 py-2"><span className="inline-flex rounded bg-muted px-1.5 py-0.5 text-xs font-medium">{r.status}</span></td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{r.appNames || "—"}</td>
                          <td className="px-3 py-2 tabular-nums">
                            {r.issueCount > 0
                              ? <button onClick={() => navigate(`/issues?session=${id}&testCase=${r.testCase.id}`)} className="text-primary hover:underline">{r.issueCount}</button>
                              : r.issueCount}
                          </td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{r.doneTestAt ? fmt(r.doneTestAt) : "—"}</td>
                          <td className="px-3 py-2">
                            <div className="flex justify-end gap-1">
                              <IconBtn title={t("at.recordTest")} allowed={manage} onClick={() => openPanel({ kind: "record", mode: "create", initial: { testCaseId: r.testCase.id, featureId: r.featureId, apps: r.apps } })}>
                                <ClipboardCheck className="h-3.5 w-3.5" />
                              </IconBtn>
                              <IconBtn title={t("at.unassign")} allowed={manage} onClick={() => withToast(unassign({ variables: { sessionTestId: id, testCaseId: r.testCase.id } }), t("t.unassignDone"), t("c.somethingWrong"))}>
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

        {/* Runs recorded in this session */}
        <div className="rounded border border-border">
          <div className="border-b border-border px-5 py-4">
            <h3 className="text-sm font-semibold">{t("st.records")} ({records.length})</h3>
          </div>
          <div className="overflow-x-auto px-5 py-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2">{t("st.recordNo")}</th>
                  <th className="px-3 py-2">{t("c.result")}</th>
                  <th className="px-3 py-2">{t("rec.qa")}</th>
                  <th className="px-3 py-2">{t("iss.testedAt")}</th>
                  <th className="px-3 py-2">{t("c.note")}</th>
                  <th className="px-3 py-2">{t("st.linkedIssue")}</th>
                </tr>
              </thead>
              <tbody>
                {records.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">{t("st.noRecords")}</td></tr>}
                {records.map((r: any) => (
                  <tr key={r.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30">
                    <td className="px-3 py-2 font-mono text-xs">{r.key}</td>
                    <td className="px-3 py-2"><span className="inline-flex rounded bg-muted px-1.5 py-0.5 text-xs font-medium">{r.result}</span></td>
                    <td className="px-3 py-2 text-muted-foreground">{r.executedBy?.name}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{fmt(r.executedAt)}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{r.note ?? "—"}</td>
                    <td className="px-3 py-2 text-xs">
                      {r.issueId
                        ? <button onClick={() => navigate(`/issues/${r.issueId}`)} className="text-primary hover:underline">{t("c.open")}</button>
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <CommentsCard target="SESSION_TEST" targetId={id} />

        <DeleteConfirm
          open={del}
          onClose={() => setDel(false)}
          onConfirm={() =>
            withToast(deleteSession({ variables: { id } }), t("t.sessionDeleted"), t("t.sessionDeleteFail")).then(
              (ok) => ok && navigate("/session-tests"),
            )
          }
          label={s.key}
        />
      </div>

      {/* Right panel */}
      {panel?.kind === "sessiontest" && <SessionTestForm panel={panel} />}
      {panel?.kind === "sessiontestapp" && <SessionTestAppForm sessionTestId={id} panel={panel} />}
      {panel?.kind === "assignsessiontc" && (
        <AssignSessionTestCasesPanel sessionTestId={id} projectId={s.projectId} apps={apps} />
      )}
      {/* A test case authored from the session panel is assigned to it right away. */}
      {panel?.kind === "testcase" && panel.initial?.featureId && (
        <TestCaseForm
          panel={panel}
          featureId={panel.initial.featureId}
          onCreated={(testCaseId) => assignCases({ variables: { sessionTestId: id, testCaseIds: [testCaseId], appIds: [] } })}
        />
      )}
      {panel?.kind === "closesession" && (
        <CloseSessionForm sessionTestId={id} notStarted={notStarted} passPercent={s.passPercent} minPassPercent={s.minPassPercent} />
      )}
      {panel?.kind === "record" && panel.initial?.testCaseId && (
        <RecordForm
          testCaseId={panel.initial.testCaseId}
          featureId={panel.initial.featureId}
          sessionTestId={id}
          retestIssueId={panel.initial.retestIssueId}
          sessionApps={panel.initial.apps}
        />
      )}
      {panel?.kind === "bulkrecord" && bulkCases.length > 0 && (
        <BulkRecordForm
          cases={bulkCases}
          sessionTestId={id}
          onFailures={(prefills) => {
            setSelected(new Set());
            issueQueue.start(prefills);
          }}
        />
      )}
      {panel?.kind === "issue" && panel.initial?.testCaseId && (
        <IssueForm
          // One form per failure: the queue swaps `initial` in place, and
          // react-hook-form only reads defaultValues on mount.
          key={panel.initial?.recordTestId ?? panel.initial.testCaseId}
          panel={panel}
          testCaseId={panel.initial.testCaseId}
          featureId={panel.initial.featureId}
          sessionTestId={id}
          projectId={s.projectId}
          onDone={issueQueue.next}
        />
      )}
    </div>
  );
}
