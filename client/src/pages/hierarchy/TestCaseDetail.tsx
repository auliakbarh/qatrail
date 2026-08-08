import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@apollo/client";
import { useTranslation } from "react-i18next";
import { Pencil, Plus, Trash2, ArrowRightLeft, Check, X, Clock, Power, Undo2 } from "lucide-react";
import {
  TEST_CASE,
  PENDING_TEST_CASES,
  PENDING_APPROVAL_REQUESTS,
  PENDING_APPROVAL_COUNT,
  APPROVE_TEST_CASE,
  REJECT_TEST_CASE,
  APPROVE_APPROVAL_REQUEST,
  REJECT_APPROVAL_REQUEST,
  CANCEL_APPROVAL_REQUEST,
  SET_TEST_CASE_ACTIVE,
} from "../../graphql/hierarchy";
import { RECORD_TESTS, ISSUES, DELETE_RECORD_TEST, DELETE_ISSUE } from "../../graphql/issue";
import { useNav, useDrill } from "../../store/nav";
import { cn, fmtDateTime as fmt } from "../../lib/utils";
import { gapLabel, waitedFor } from "../../lib/approval";
import { IconBtn } from "../../components/IconBtn";
import { HeaderButton } from "../../components/HeaderButton";
import { DeleteConfirm } from "../../components/DeleteConfirm";
import { usePageState, paged, Pager } from "../../components/Pager";
import { AttachmentList } from "../../components/AttachmentList";
import { CommentsCard } from "../../components/CommentsCard";
import { WatchButton } from "../../components/WatchButton";
import { RefreshBtn } from "../../components/RefreshBtn";
import { TextPromptModal } from "../../components/TextPromptModal";
import { Modal } from "../../components/Modal";
import { withToast, denied } from "../../store/toast";
import { useAuth } from "../../store/auth";
import { canManageContent } from "../../lib/perm";
import { TableSkeleton, DetailSkeleton } from "../../components/Skeleton";

function Badge({ children, variant = "muted" }: { children: any; variant?: "muted" | "primary" | "destructive" | "outline" }) {
  const cls = {
    muted: "bg-muted text-muted-foreground",
    primary: "bg-primary text-primary-foreground",
    destructive: "bg-destructive text-white",
    outline: "border border-border text-muted-foreground",
  }[variant];
  return <span className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium", cls)}>{children}</span>;
}

// Approval state of the case: what it means, and what to do about it. Everyone
// sees the state; only an eligible approver sees the buttons.
function ApprovalCard({ tc }: { tc: any }) {
  const { t } = useTranslation();
  const [rejecting, setRejecting] = useState(false);
  const refetchAfter = [
    { query: TEST_CASE, variables: { id: tc.id } },
    { query: PENDING_TEST_CASES, variables: { projectId: null } },
    { query: PENDING_APPROVAL_COUNT },
  ];
  const [approve] = useMutation(APPROVE_TEST_CASE, { refetchQueries: refetchAfter });
  const [reject] = useMutation(REJECT_TEST_CASE, { refetchQueries: refetchAfter });

  if (tc.approval === "APPROVED") {
    return (
      <p className="text-xs text-muted-foreground">
        {tc.reviewedAt
          ? t("tca.approvedBy", {
              name: tc.reviewedBy?.name ?? "—",
              at: fmt(tc.reviewedAt),
              gap: gapLabel(tc.createdAt, tc.reviewedAt, t),
            })
          : // Predates the approval feature: that review never happened, so don't
            // invent an approver.
            t("tca.legacyApproved")}
      </p>
    );
  }

  const rejected = tc.approval === "REJECTED";
  return (
    <div
      className={cn(
        "rounded border px-4 py-3",
        rejected ? "border-destructive/40 bg-destructive/5" : "border-[var(--warn)]/40 bg-[var(--warn)]/5",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-start gap-2 text-xs">
          <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div>
            <div className="font-medium">{rejected ? t("tca.bannerRejected") : t("tca.bannerPending")}</div>
            {/* Say what is under review: a brand-new case, or an edit to one that
                was already live. firstApprovedAt survives the reset, so it knows. */}
            <div>{tc.firstApprovedAt ? t("tca.forEdit") : t("tca.forNew")}</div>
            <div className="text-muted-foreground">
              {rejected
                ? t("tca.rejectedBy", { name: tc.reviewedBy?.name ?? "—", at: fmt(tc.reviewedAt) })
                : t("tca.waitingSince", { gap: waitedFor(tc.createdAt, t) })}
            </div>
            {rejected && tc.rejectReason && <div className="mt-1 text-destructive">{tc.rejectReason}</div>}
            <div className="mt-1 text-muted-foreground">{t("tca.blockedNote")}</div>
          </div>
        </div>
        {tc.canApprove && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => withToast(approve({ variables: { id: tc.id } }), t("tca.approved"), t("tca.approveFail"))}
              className="flex h-7 items-center gap-1.5 rounded bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-90"
            >
              <Check className="h-3.5 w-3.5" /> {t("tca.approve")}
            </button>
            <button
              onClick={() => setRejecting(true)}
              className="flex h-7 items-center gap-1.5 rounded border border-border px-3 text-xs hover:bg-muted"
            >
              <X className="h-3.5 w-3.5" /> {t("tca.reject")}
            </button>
          </div>
        )}
      </div>
      <TextPromptModal
        open={rejecting}
        title={t("tca.rejectTitle", { key: tc.key })}
        label={t("tca.rejectReason")}
        required
        destructive
        confirmLabel={t("tca.reject")}
        onClose={() => setRejecting(false)}
        onSubmit={(reason) => {
          setRejecting(false);
          void withToast(reject({ variables: { id: tc.id, reason } }), t("tca.rejected"), t("tca.rejectFail"));
        }}
      />
    </div>
  );
}

// A queued move/copy/delete/(de)activate. The case still works — this says what
// is waiting and lets an eligible approver settle it.
function PendingRequestCard({ tc }: { tc: any }) {
  const { t } = useTranslation();
  const req = tc.pendingRequest;
  const [rejecting, setRejecting] = useState(false);
  const refetchAfter = [
    { query: TEST_CASE, variables: { id: tc.id } },
    "TestCases",
    { query: PENDING_APPROVAL_REQUESTS, variables: { projectId: null } },
    { query: PENDING_APPROVAL_COUNT },
  ];
  const [approve] = useMutation(APPROVE_APPROVAL_REQUEST, { refetchQueries: refetchAfter });
  const [reject] = useMutation(REJECT_APPROVAL_REQUEST, { refetchQueries: refetchAfter });
  const [cancel] = useMutation(CANCEL_APPROVAL_REQUEST, { refetchQueries: refetchAfter });

  return (
    <div className="rounded border border-[var(--warn)]/40 bg-[var(--warn)]/5 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-start gap-2 text-xs">
          <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div>
            <div className="font-medium">{t(`tcr.pending.${req.kind}`)}</div>
            <div className="text-muted-foreground">
              {t("tcr.requestedBy", { name: req.requestedBy?.name ?? "—", at: fmt(req.requestedAt) })}
              {req.targetFeature && ` · → ${req.targetFeature.name}`}
              {req.targetName && ` · ${req.targetName}`}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {/* The requester can take their own request back; reviewing it is
              somebody else's call. */}
          {req.canCancel && (
            <button
              onClick={() => withToast(cancel({ variables: { id: req.id } }), t("tcr.cancelled"), t("tcr.cancelFail"))}
              className="flex h-7 items-center gap-1.5 rounded border border-border px-3 text-xs hover:bg-muted"
            >
              <Undo2 className="h-3.5 w-3.5" /> {t("tcr.cancel")}
            </button>
          )}
          {req.canApprove && (
            <>
            <button
              onClick={() => withToast(approve({ variables: { id: req.id } }), t("tcr.approved"), t("tcr.approveFail"))}
              className="flex h-7 items-center gap-1.5 rounded bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-90"
            >
              <Check className="h-3.5 w-3.5" /> {t("tca.approve")}
            </button>
            <button
              onClick={() => setRejecting(true)}
              className="flex h-7 items-center gap-1.5 rounded border border-border px-3 text-xs hover:bg-muted"
            >
              <X className="h-3.5 w-3.5" /> {t("tca.reject")}
            </button>
            </>
          )}
        </div>
      </div>
      <TextPromptModal
        open={rejecting}
        title={t("tcr.rejectTitle", { key: tc.key })}
        label={t("tca.rejectReason")}
        required
        destructive
        confirmLabel={t("tca.reject")}
        onClose={() => setRejecting(false)}
        onSubmit={(reason) => {
          setRejecting(false);
          void withToast(reject({ variables: { id: req.id, reason } }), t("tcr.rejected"), t("tcr.rejectFail"));
        }}
      />
    </div>
  );
}

export function TestCaseDetail({ id }: { id: string }) {
  const { t } = useTranslation();
  const { openPanel } = useNav();
  const navigate = useNavigate();
  const { from } = useDrill();
  const { user } = useAuth();
  const manage = canManageContent(user?.role);
  // Reached from an app test or a testing session, the case is being *run*, not
  // curated — catalogue actions (retire, move, edit) belong to the project
  // hierarchy, where the case lives.
  const fromTesting = !!from && (from.startsWith("app-test:") || from.startsWith("session:"));
  // Suggest a testing session before a run is filed straight against the case:
  // scoped runs are what a sign-off report can be built from.
  const [suggestSession, setSuggestSession] = useState(false);
  const { data, loading, refetch } = useQuery(TEST_CASE, { variables: { id } });
  const [tab, setTab] = useState<"records" | "issues">("records");
  const [setActive] = useMutation(SET_TEST_CASE_ACTIVE, {
    refetchQueries: [{ query: TEST_CASE, variables: { id } }, "TestCases", { query: PENDING_APPROVAL_COUNT }],
  });

  if (loading) return <DetailSkeleton />;
  const tc = data?.testCase;
  if (!tc) return <div className="rounded border border-border p-8 text-sm text-muted-foreground">{t("c.notFound")}</div>;
  // Runs and findings need a reviewed case; commenting and watching never do.
  const approved = tc.approval === "APPROVED";
  // Retired content is read-only: still readable, with its history, but nothing
  // edits it or runs against it until an activation is approved.
  const editable = approved && tc.active;
  // A brand-new case has nothing to show under records/issues and can't get any
  // yet, so the whole tab strip is dead weight. A case that was approved before
  // (and has history) keeps it even while a re-review is pending.
  const showActivity = approved || tc.recordCount > 0 || tc.issueCount > 0;

  return (
    <div className="space-y-4">
      <div className="rounded border border-border">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">{tc.key}</span>
            <h2 className="text-sm font-semibold">{tc.name}</h2>
            {!tc.active && (
              <span className="inline-flex items-center rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {t("tc.inactive")}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <RefreshBtn onClick={() => void refetch()} loading={loading} />
            <WatchButton target="TEST_CASE" targetId={tc.id} />
            {/* Retiring and moving only mean something for a case that is in the
                catalogue. While it's still in review, edit and delete are the
                only sensible actions. */}
            {approved && !fromTesting && (
              <>
                <button
                  onClick={
                    manage
                      ? () =>
                          withToast(
                            setActive({ variables: { id: tc.id, active: !tc.active } }),
                            tc.active ? t("t.deactivateAsked") : t("t.activateAsked"),
                            t("t.activeChangeFail"),
                          )
                      : () => denied()
                  }
                  className={cn(
                    "flex h-7 items-center gap-1.5 rounded border border-border px-3 text-xs hover:bg-muted",
                    !manage && "opacity-40",
                  )}
                >
                  <Power className="h-3.5 w-3.5" /> {tc.active ? t("tc.deactivate") : t("tc.activate")}
                </button>
                <button
                  onClick={manage ? () => openPanel({ kind: "movetc", mode: "create", id: tc.id }) : () => denied()}
                  className={cn(
                    "flex h-7 items-center gap-1.5 rounded border border-border px-3 text-xs hover:bg-muted",
                    !manage && "opacity-40",
                  )}
                >
                  <ArrowRightLeft className="h-3.5 w-3.5" /> {t("move.action")}
                </button>
              </>
            )}
            {!fromTesting && (
              <button
                onClick={manage && tc.active ? () => openPanel({ kind: "testcase", mode: "edit", id: tc.id }) : () => denied()}
                className={cn(
                  "flex h-7 items-center gap-1.5 rounded border border-border px-3 text-xs hover:bg-muted",
                  (!manage || !tc.active) && "opacity-40",
                )}
              >
                <Pencil className="h-3.5 w-3.5" /> {t("c.edit")}
              </button>
            )}
          </div>
        </div>
        <div className="space-y-3 px-5 py-4 text-sm">
          {/* Where this case lives — the drilldown breadcrumb is gone when you
              arrive from the pending list or a notification. */}
          <p className="text-xs text-muted-foreground">
            {t("tc.inProjectFeature", {
              project: tc.feature?.project?.name ?? "—",
              feature: tc.feature?.name ?? "—",
            })}
          </p>
          {!approved && <ApprovalCard tc={tc} />}
          {tc.pendingRequest && <PendingRequestCard tc={tc} />}
          {tc.description && <p className="text-muted-foreground">{tc.description}</p>}
          {tc.precondition && (
            <p>
              <span className="font-medium">{t("tc.precondition")}:</span> {tc.precondition}
            </p>
          )}
          <div>
            <div className="mb-1 font-medium">{t("tc.steps")}</div>
            <div className="space-y-1">
              {tc.steps.map((s: any) => (
                <div key={s.id} className="text-xs">
                  {s.order}. {s.step}
                  {s.expectedResult && <span className="text-muted-foreground"> → {t("tc.expected")}: {s.expectedResult}</span>}
                </div>
              ))}
              {tc.steps.length === 0 && <div className="text-xs text-muted-foreground">{t("tc.noSteps")}</div>}
            </div>
          </div>
          {tc.attachments.length > 0 && (
            <div>
              <div className="mb-1 font-medium">{t("c.attachments")}</div>
              <AttachmentList
                items={tc.attachments}
                onOpenText={(a) => openPanel({ kind: "attachment", mode: "create", initial: a })}
              />
            </div>
          )}
          {tc.note && (
            <p>
              <span className="font-medium">{t("c.note")}:</span> {tc.note}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {t("tc.createdByAt", { name: tc.createdBy?.name ?? "—", at: fmt(tc.createdAt) })}
          </p>
          {approved && <ApprovalCard tc={tc} />}
        </div>
      </div>

      {showActivity && (
      <div className="rounded border border-border">
        <div className="px-5 py-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="inline-flex gap-0.5 rounded bg-muted p-1">
              {(["records", "issues"] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setTab(k)}
                  className={cn(
                    "rounded px-3 py-1.5 text-xs font-medium capitalize",
                    tab === k ? "bg-background text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {k === "records" ? t("tc.tabRecords") : t("tc.tabIssues")}
                </button>
              ))}
            </div>
            <HeaderButton
              // An unreviewed case can't be run or reported against — the server
              // refuses it, so don't offer the form.
              allowed={manage && editable}
              icon={Plus}
              onClick={() => (fromTesting ? openPanel({ kind: tab === "records" ? "record" : "issue", mode: "create" }) : setSuggestSession(true))}
            >
              {tab === "records" ? t("tc.addRecord") : t("tc.addIssue")}
            </HeaderButton>
          </div>
          {tab === "records" ? <RecordsTab testCaseId={id} manage={manage} /> : <IssuesTab testCaseId={id} manage={manage} />}
        </div>
      </div>
      )}

      {/* Discussion stays open regardless of approval — that's how a pending case
          gets clarified in the first place. */}
      <CommentsCard target="TEST_CASE" targetId={tc.id} />

      {/* A run filed straight against the case belongs to no app test and no
          session, so no sign-off report can ever include it. Offer the session
          first — but never block the direct run, it is still legitimate. */}
      <Modal
        open={suggestSession}
        onClose={() => setSuggestSession(false)}
        title={t("sug.title")}
        footer={
          <>
            <button
              onClick={() => {
                setSuggestSession(false);
                openPanel({ kind: tab === "records" ? "record" : "issue", mode: "create" });
              }}
              className="h-7 rounded border border-border px-3 text-xs hover:bg-muted"
            >
              {tab === "records" ? t("sug.anywayRecord") : t("sug.anywayIssue")}
            </button>
            <button
              onClick={() => {
                setSuggestSession(false);
                navigate("/session-tests");
                openPanel({ kind: "sessiontest", mode: "create" });
              }}
              className="h-7 rounded bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              {t("sug.createSession")}
            </button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">{t("sug.body")}</p>
      </Modal>
    </div>
  );
}

function RecordsTab({ testCaseId, manage }: { testCaseId: string; manage: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { goIssue } = useDrill();
  const { data, loading } = useQuery(RECORD_TESTS, { variables: { testCaseId } });
  const [del, setDel] = useState<string | null>(null);
  const pg = usePageState();
  const [deleteRecord] = useMutation(DELETE_RECORD_TEST, {
    refetchQueries: [{ query: RECORD_TESTS, variables: { testCaseId } }],
  });
  const rows = data?.recordTests ?? [];
  // Pair each row with its overall index so the "#" column keeps counting across pages.
  const pageRows = paged<[any, number]>(rows.map((r: any, i: number) => [r, i]), pg);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="w-8 px-3 py-2 text-left text-xs font-medium text-muted-foreground">#</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("c.id")}</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("rec.datetime")}</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("rec.qa")}</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("c.result")}</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("c.note")}</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("st.relatedScope")}</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("rec.attach")}</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {loading && (
            <TableSkeleton rows={3} cols={9} />
          )}
          {!loading && rows.length === 0 && (
            <tr><td colSpan={9} className="py-8 text-center text-muted-foreground">{t("rec.empty")}</td></tr>
          )}
          {pageRows.map(([r, idx]: [any, number]) => (
            <tr key={r.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30">
              <td className="px-3 py-2 text-xs tabular-nums text-muted-foreground">{idx + 1}</td>
              <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{r.key}</td>
              <td className="px-3 py-2 text-xs">{fmt(r.executedAt)}</td>
              <td className="px-3 py-2">{r.executedBy.name}</td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-1.5">
                  <Badge variant={r.result === "PASS" ? "primary" : "destructive"}>{r.result}</Badge>
                  {r.retestIssueId && (
                    <button
                      onClick={() => goIssue(r.retestIssueId)}
                      title={t("rec.retestTitle")}
                      className="inline-flex items-center rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-muted"
                    >
                      🔁 {t("rec.retest")}
                    </button>
                  )}
                </div>
              </td>
              <td className="px-3 py-2 text-xs text-muted-foreground">{r.note || "—"}</td>
              <td className="px-3 py-2 text-xs">
                {r.appTestId
                  ? <button onClick={() => navigate(`/app-tests/${r.appTestId}`)} className="font-mono text-primary hover:underline">{r.appTestKey}</button>
                  : r.sessionTestId
                    ? <button onClick={() => navigate(`/session-tests/${r.sessionTestId}`)} className="font-mono text-primary hover:underline">{r.sessionTestKey}</button>
                    : <span className="text-muted-foreground">—</span>}
              </td>
              <td className="px-3 py-2 text-xs">{r.attachments.length}</td>
              <td className="px-3 py-2 text-right">
                <IconBtn title={t("c.delete")} allowed={manage} onClick={() => setDel(r.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </IconBtn>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Pager total={rows.length} st={pg} />
      <DeleteConfirm
        open={!!del}
        onClose={() => setDel(null)}
        onConfirm={() => del && withToast(deleteRecord({ variables: { id: del } }), t("t.recordDeleted"), t("t.recordDeleteFail"))}
        label={t("rec.recordLabel")}
      />
    </div>
  );
}

function IssuesTab({ testCaseId, manage }: { testCaseId: string; manage: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { openPanel } = useNav();
  const { goIssue } = useDrill();
  const { data, loading } = useQuery(ISSUES, { variables: { testCaseId } });
  const [del, setDel] = useState<{ id: string; title: string } | null>(null);
  const [deleteIssue] = useMutation(DELETE_ISSUE, {
    refetchQueries: [{ query: ISSUES, variables: { testCaseId } }],
  });
  const rows = data?.issues ?? [];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="w-8 px-3 py-2 text-left text-xs font-medium text-muted-foreground">#</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("c.id")}</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("issue.colIssue")}</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("c.type")}</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("c.priority")}</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("c.status")}</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("st.relatedScope")}</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("c.assignee")}</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {loading && (
            <TableSkeleton rows={3} cols={9} />
          )}
          {!loading && rows.length === 0 && (
            <tr><td colSpan={9} className="py-8 text-center text-muted-foreground">{t("tc.noIssuesYet")}</td></tr>
          )}
          {rows.map((i: any, idx: number) => (
            <tr key={i.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30">
              <td className="px-3 py-2 text-xs tabular-nums text-muted-foreground">{idx + 1}</td>
              <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{i.key}</td>
              <td className="px-3 py-2 font-medium">
                <button onClick={() => goIssue(i.id)} className="hover:underline">
                  {i.title}
                </button>
              </td>
              <td className="px-3 py-2"><Badge variant={i.type === "DEFECT" ? "destructive" : "outline"}>{i.type}</Badge></td>
              <td className="px-3 py-2"><Badge variant="outline">{i.priority}</Badge></td>
              <td className="px-3 py-2"><Badge>{i.status}</Badge></td>
              <td className="px-3 py-2 text-xs">
                {i.appTestId
                  ? <button onClick={() => navigate(`/app-tests/${i.appTestId}`)} className="font-mono text-primary hover:underline">{i.appTestKey}</button>
                  : i.sessionTestId
                    ? <button onClick={() => navigate(`/session-tests/${i.sessionTestId}`)} className="font-mono text-primary hover:underline">{i.sessionTestKey}</button>
                    : <span className="text-muted-foreground">—</span>}
              </td>
              <td className="px-3 py-2 text-muted-foreground">{i.assignee.name}</td>
              <td className="px-3 py-2 text-right">
                <div className="flex justify-end gap-1">
                  <IconBtn title={t("c.edit")} allowed={manage} onClick={() => openPanel({ kind: "issue", mode: "edit", id: i.id })}>
                    <Pencil className="h-3.5 w-3.5" />
                  </IconBtn>
                  <IconBtn title={t("c.delete")} allowed={manage} onClick={() => setDel({ id: i.id, title: i.title })}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </IconBtn>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <DeleteConfirm
        open={!!del}
        onClose={() => setDel(null)}
        onConfirm={() => del && withToast(deleteIssue({ variables: { id: del.id } }), t("t.issueDeleted"), t("t.issueDeleteFail"))}
        label={del?.title ?? ""}
      />
    </div>
  );
}
