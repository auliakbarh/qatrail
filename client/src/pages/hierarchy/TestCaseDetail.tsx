import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@apollo/client";
import { useTranslation } from "react-i18next";
import { Pencil, Plus, Trash2, ArrowRightLeft, Check, X, Clock } from "lucide-react";
import {
  TEST_CASE,
  PENDING_TEST_CASES,
  PENDING_APPROVAL_COUNT,
  APPROVE_TEST_CASE,
  REJECT_TEST_CASE,
} from "../../graphql/hierarchy";
import { RECORD_TESTS, ISSUES, DELETE_RECORD_TEST, DELETE_ISSUE } from "../../graphql/issue";
import { useNav, useDrill } from "../../store/nav";
import { cn, fmtDateTime as fmt } from "../../lib/utils";
import { gapLabel, waitedFor } from "../../lib/approval";
import { IconBtn } from "../../components/IconBtn";
import { HeaderButton } from "../../components/HeaderButton";
import { DeleteConfirm } from "../../components/DeleteConfirm";
import { AttachmentList } from "../../components/AttachmentList";
import { CommentsCard } from "../../components/CommentsCard";
import { WatchButton } from "../../components/WatchButton";
import { TextPromptModal } from "../../components/TextPromptModal";
import { withToast, denied } from "../../store/toast";
import { useAuth } from "../../store/auth";
import { canManageContent } from "../../lib/perm";

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

export function TestCaseDetail({ id }: { id: string }) {
  const { t } = useTranslation();
  const { openPanel } = useNav();
  const { user } = useAuth();
  const manage = canManageContent(user?.role);
  const { data, loading } = useQuery(TEST_CASE, { variables: { id } });
  const [tab, setTab] = useState<"records" | "issues">("records");

  if (loading) return <div className="rounded border border-border p-8 text-sm text-muted-foreground">{t("c.loading")}</div>;
  const tc = data?.testCase;
  if (!tc) return <div className="rounded border border-border p-8 text-sm text-muted-foreground">{t("c.notFound")}</div>;
  // Runs and findings need a reviewed case; commenting and watching never do.
  const approved = tc.approval === "APPROVED";

  return (
    <div className="space-y-4">
      <div className="rounded border border-border">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">{tc.key}</span>
            <h2 className="text-sm font-semibold">{tc.name}</h2>
          </div>
          <div className="flex items-center gap-2">
            <WatchButton target="TEST_CASE" targetId={tc.id} />
            <button
              onClick={manage ? () => openPanel({ kind: "movetc", mode: "create", id: tc.id }) : () => denied()}
              className={cn(
                "flex h-7 items-center gap-1.5 rounded border border-border px-3 text-xs hover:bg-muted",
                !manage && "opacity-40",
              )}
            >
              <ArrowRightLeft className="h-3.5 w-3.5" /> {t("move.action")}
            </button>
            <button
              onClick={manage ? () => openPanel({ kind: "testcase", mode: "edit", id: tc.id }) : () => denied()}
              className={cn(
                "flex h-7 items-center gap-1.5 rounded border border-border px-3 text-xs hover:bg-muted",
                !manage && "opacity-40",
              )}
            >
              <Pencil className="h-3.5 w-3.5" /> {t("c.edit")}
            </button>
          </div>
        </div>
        <div className="space-y-3 px-5 py-4 text-sm">
          {!approved && <ApprovalCard tc={tc} />}
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
              allowed={manage && approved}
              icon={Plus}
              onClick={() => openPanel({ kind: tab === "records" ? "record" : "issue", mode: "create" })}
            >
              {tab === "records" ? t("tc.addRecord") : t("tc.addIssue")}
            </HeaderButton>
          </div>
          {tab === "records" ? <RecordsTab testCaseId={id} manage={manage} /> : <IssuesTab testCaseId={id} manage={manage} />}
        </div>
      </div>

      {/* Discussion stays open regardless of approval — that's how a pending case
          gets clarified in the first place. */}
      <CommentsCard target="TEST_CASE" targetId={tc.id} />
    </div>
  );
}

function RecordsTab({ testCaseId, manage }: { testCaseId: string; manage: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { goIssue } = useDrill();
  const { data, loading } = useQuery(RECORD_TESTS, { variables: { testCaseId } });
  const [del, setDel] = useState<string | null>(null);
  const [deleteRecord] = useMutation(DELETE_RECORD_TEST, {
    refetchQueries: [{ query: RECORD_TESTS, variables: { testCaseId } }],
  });
  const rows = data?.recordTests ?? [];

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
            <tr><td colSpan={9} className="py-8 text-center text-muted-foreground">{t("c.loading")}</td></tr>
          )}
          {!loading && rows.length === 0 && (
            <tr><td colSpan={9} className="py-8 text-center text-muted-foreground">{t("rec.empty")}</td></tr>
          )}
          {rows.map((r: any, idx: number) => (
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
            <tr><td colSpan={9} className="py-8 text-center text-muted-foreground">{t("c.loading")}</td></tr>
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
