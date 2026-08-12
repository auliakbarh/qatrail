import { useState } from "react";
import { useQuery, useMutation } from "@apollo/client";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Archive, ArchiveRestore, Copy, Printer, FileText, Trash2 } from "lucide-react";
import { ISSUE, ISSUES, POST_ISSUE_TO_JIRA, UNLINK_ISSUE_JIRA } from "../../graphql/issue";
import { HEALTH } from "../../graphql";
import {
  ISSUE_ACCEPT,
  ISSUE_REJECT,
  ISSUE_NEED_CLARIFY,
  ISSUE_HOLD,
  ISSUE_RESUME,
  ISSUE_CLARIFY_RESPOND,
  ISSUE_START_REVIEW,
  ISSUE_REVIEW,
  ISSUE_REOPEN,
  SET_ISSUE_ARCHIVED,
  SET_PRODUCTION_ISSUE,
} from "../../graphql/workflow";
import { useNav, useDrill } from "../../store/nav";
import { useAuth } from "../../store/auth";
import { cn, fmtDateTime as fmt } from "../../lib/utils";
import { printIssueReport } from "../../lib/printReport";
import { TextPromptModal } from "../../components/TextPromptModal";
import { withToast, useToast, copyWithToast } from "../../store/toast";
import { AttachmentList } from "../../components/AttachmentList";
import { CommentsCard } from "../../components/CommentsCard";
import { WatchButton } from "../../components/WatchButton";
import { RefreshBtn } from "../../components/RefreshBtn";
import { JiraTicketLinks } from "../../components/JiraTicketLinks";
import { IconBtn } from "../../components/IconBtn";
import { DetailSkeleton } from "../../components/Skeleton";
import { Badge } from "../../components/Badge";

export function IssueDetail({ id, testCaseId }: { id: string; testCaseId: string }) {
  const { t } = useTranslation();
  const { openPanel } = useNav();
  const { up } = useDrill();
  const { user } = useAuth();
  const { data, loading, refetch: reload } = useQuery(ISSUE, { variables: { id }, fetchPolicy: "cache-and-network" });
  const { data: healthData } = useQuery(HEALTH, { fetchPolicy: "cache-first" });
  const [modal, setModal] = useState<null | "reject" | "clarify" | "clarifyRespond" | "reopen" | "reopenClosed">(null);
  const [jiraKey, setJiraKey] = useState("");
  const [postToJira, { loading: posting }] = useMutation(POST_ISSUE_TO_JIRA, {
    refetchQueries: [{ query: ISSUE, variables: { id } }],
  });
  const [unlinkJira] = useMutation(UNLINK_ISSUE_JIRA, {
    refetchQueries: [{ query: ISSUE, variables: { id } }],
  });

  const refetch = {
    refetchQueries: [
      { query: ISSUE, variables: { id } },
      { query: ISSUES, variables: { testCaseId } },
    ],
  };
  const [accept] = useMutation(ISSUE_ACCEPT, refetch);
  const [reject] = useMutation(ISSUE_REJECT, refetch);
  const [needClarify] = useMutation(ISSUE_NEED_CLARIFY, refetch);
  const [hold] = useMutation(ISSUE_HOLD, refetch);
  const [resume] = useMutation(ISSUE_RESUME, refetch);
  const [clarifyRespond] = useMutation(ISSUE_CLARIFY_RESPOND, refetch);
  const [startReview] = useMutation(ISSUE_START_REVIEW, refetch);
  const [review] = useMutation(ISSUE_REVIEW, refetch);
  const [reopen] = useMutation(ISSUE_REOPEN, refetch);
  const [setArchived] = useMutation(SET_ISSUE_ARCHIVED, refetch);
  const [setProductionIssue] = useMutation(SET_PRODUCTION_ISSUE, refetch);

  if (loading && !data) return <DetailSkeleton />;
  const i = data?.issue;
  if (!i) return <div className="rounded border border-border p-8 text-sm text-muted-foreground">{t("c.notFound")}</div>;

  const isAssignee = user?.id === i.assignee.id;
  const isAdmin = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
  const canEngineer = isAssignee || isAdmin;
  const canQA = user?.id === i.reporter.id || user?.role === "QA" || user?.role === "QA_LEAD" || isAdmin;

  // Buttons stay clickable regardless of role; unauthorized clicks toast instead
  // of acting. Keeps the UI discoverable while the server stays the real gate.
  const guard = (allowed: boolean, fn: () => void) => () => {
    if (allowed) fn();
    else useToast.getState().push(t("c.permissionDenied"), "error");
  };

  const copyLink = () => {
    void copyWithToast(`${location.origin}/issues/${i.id}`, t("iss.linkLabel"));
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded border border-border">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <button onClick={up} className="flex h-7 w-7 items-center justify-center rounded border border-border hover:bg-muted">
              <ArrowLeft className="h-3.5 w-3.5" />
            </button>
            <span className="font-mono text-xs text-muted-foreground">{i.key}</span>
            <h2 className="text-sm font-semibold">{i.title}</h2>
          </div>
          <div className="flex items-center gap-1.5">
            <RefreshBtn onClick={() => void reload()} loading={loading} />
            <WatchButton target="ISSUE" targetId={id} />
            {/* Read the steps the finding came from without leaving the issue. */}
            <button
              onClick={() => openPanel({ kind: "testcaseview", mode: "edit", id: testCaseId })}
              title={t("iss.viewTestCase")}
              className="flex h-7 items-center gap-1.5 rounded border border-border px-2 text-xs hover:bg-muted"
            >
              <FileText className="h-3 w-3" /> {t("iss.testCase")}
            </button>
            <button onClick={copyLink} title={t("iss.copyLinkTitle")} className="flex h-7 items-center gap-1.5 rounded border border-border px-2 text-xs hover:bg-muted">
              <Copy className="h-3 w-3" /> {t("iss.link")}
            </button>
            <Badge variant={i.type === "DEFECT" ? "destructive" : "outline"}>{i.type}</Badge>
            <Badge variant="outline">{i.priority}</Badge>
            <Badge variant="primary">{i.status}</Badge>
            {i.review !== "PENDING" && <Badge>{i.review}</Badge>}
            {i.isProductionIssue && <Badge variant="destructive">{t("iss.prodIssueBadge")}</Badge>}
            {i.archived && <Badge variant="outline">ARCHIVED</Badge>}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 px-5 py-4 text-xs md:grid-cols-4">
          <Info
            label={t("iss.environment")}
            value={i.environment === "PRODUCTION" ? `${i.environment} · ${i.isProductionIssue ? t("iss.slaOn") : t("iss.slaOff")}` : i.environment}
          />
          <Info label={t("iss.platform")} value={i.platform} />
          <Info label={t("iss.appVer")} value={i.appVersion ?? "—"} />
          <Info label={t("iss.backendVer")} value={i.backendVersion ?? "—"} />
          <Info label={t("c.reporter")} value={i.reporter.name} />
          <Info label={t("c.assignee")} value={i.assignee.name} />
          <Info label={t("iss.testAccount")} value={i.testAccount} />
          <Info label={t("iss.testedAt")} value={fmt(i.testedAt)} />
        </div>
      </div>

      {/* Detail */}
      <div className="rounded border border-border px-5 py-4 text-sm">
        <div className="space-y-3">
          <Block label={t("c.description")} text={i.description} />
          {i.preconditions && <Block label={t("iss.preconditions")} text={i.preconditions} />}
          <Block label={t("iss.steps")} text={i.steps} />
          <Block label={t("iss.actualResult")} text={i.actualResult} />
          <Block label={t("iss.expectedResult")} text={i.expectedResult} />
          {i.note && <Block label={t("c.note")} text={i.note} />}
          {i.attachments.length > 0 && (
            <div>
              <div className="mb-1 font-medium">{t("c.attachments")}</div>
              <AttachmentList
                items={i.attachments}
                onOpenText={(a) => openPanel({ kind: "attachment", mode: "create", initial: a })}
              />
            </div>
          )}
        </div>
      </div>

      {/* Post to JIRA */}
      {canQA && (
        <div className="rounded border border-border">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h3 className="text-sm font-semibold">{t("jira.title")}</h3>
            {i.jiraKey && (
              <div className="flex items-center gap-2">
                <Badge variant="outline">
                  {t("jira.linked")}{" "}
                  <span className="ml-1">
                    <JiraTicketLinks tickets={[i.jiraKey]} baseUrl={healthData?.health?.jiraBaseUrl} />
                  </span>
                </Badge>
                <IconBtn
                  title={t("jira.unlink")}
                  onClick={() =>
                    withToast(unlinkJira({ variables: { id } }), t("t.jiraUnlinked"), t("t.jiraUnlinkFail"))
                  }
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </IconBtn>
              </div>
            )}
          </div>
          <div className="px-5 py-4">
            {healthData?.health?.jiraConfigured ? (
              <>
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <label className="mb-1.5 block text-xs font-medium">{t("jira.ticketKey")}</label>
                    <input
                      value={jiraKey || i.jiraKey || ""}
                      onChange={(e) => setJiraKey(e.target.value)}
                      placeholder="e.g. ATH-901"
                      className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <button
                    disabled={posting || !(jiraKey || i.jiraKey)}
                    onClick={() =>
                      withToast(
                        postToJira({ variables: { id, jiraKey: jiraKey || i.jiraKey } }),
                        t("t.jiraPosted"),
                        t("t.jiraPostFail"),
                      )
                    }
                    className="h-9 rounded bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {posting ? t("jira.posting") : i.jiraCommentId ? t("jira.updateComment") : t("jira.postComment")}
                  </button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("jira.help")}
                </p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">{t("jira.notConfigured")}</p>
            )}
          </div>
        </div>
      )}

      {/* Postmortem */}
      {i.postmortem && (
        <div className="rounded border border-border">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h3 className="text-sm font-semibold">{t("pm.title")}</h3>
            <button
              onClick={() => printIssueReport(i)}
              className="flex h-7 items-center gap-1.5 rounded border border-border px-2.5 text-xs hover:bg-muted"
            >
              <Printer className="h-3.5 w-3.5" /> {t("pm.print")}
            </button>
          </div>
          <div className="space-y-3 px-5 py-4 text-sm">
            <Block label={t("pm.rootCause")} text={i.postmortem.rootCause} />
            <Block label={t("pm.resolution")} text={i.postmortem.resolution} />
            {i.postmortem.impact && <Block label={t("pm.impact")} text={i.postmortem.impact} />}
            {i.postmortem.prevention && <Block label={t("pm.prevention")} text={i.postmortem.prevention} />}
            <p className="text-xs text-muted-foreground">
              {t("pm.by", { name: i.postmortem.resolvedBy.name, date: fmt(i.postmortem.resolvedAt) })}
            </p>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="rounded border border-border">
        <div className="border-b border-border px-5 py-4">
          <h3 className="text-sm font-semibold">{t("c.actions")}</h3>
        </div>
        <div className="flex flex-wrap gap-2 px-5 py-4">
          {/* Engineer actions — shown by status; role checked on click. */}
          {(i.status === "OPEN" || i.status === "REOPENED") && (
            <>
              <ActBtn allowed={canEngineer} primary onClick={guard(canEngineer, () => withToast(accept({ variables: { id } }), t("t.issueAccepted"), t("t.issueAcceptFail")))}>{t("act.accept")}</ActBtn>
              <ActBtn allowed={canEngineer} onClick={guard(canEngineer, () => setModal("clarify"))}>{t("act.needClarify")}</ActBtn>
              <ActBtn allowed={canEngineer} destructive onClick={guard(canEngineer, () => setModal("reject"))}>{t("act.reject")}</ActBtn>
            </>
          )}
          {i.status === "IN_PROGRESS" && (
            <>
              <ActBtn allowed={canEngineer} primary onClick={guard(canEngineer, () => openPanel({ kind: "postmortem", mode: "create", id }))}>{t("act.solve")}</ActBtn>
              <ActBtn allowed={canEngineer} onClick={guard(canEngineer, () => withToast(hold({ variables: { id } }), t("t.issueHeld"), t("t.issueHoldFail")))}>{t("act.hold")}</ActBtn>
            </>
          )}
          {i.status === "HOLD" && (
            <ActBtn allowed={canEngineer} primary onClick={guard(canEngineer, () => withToast(resume({ variables: { id } }), t("t.issueResumed"), t("t.issueResumeFail")))}>{t("act.resume")}</ActBtn>
          )}
          {/* QA actions — shown by status; role checked on click. */}
          {i.review === "NEED_CLARIFY" && (
            <ActBtn allowed={canQA} primary onClick={guard(canQA, () => setModal("clarifyRespond"))}>{t("act.respondClarify")}</ActBtn>
          )}
          {(i.status === "NEED_REVIEW" || i.status === "IN_REVIEW") && (
            <>
              {/* Claiming is optional — the verdict is accepted from either status.
                  It only tells the engineer and the other QAs that this one is taken. */}
              {i.status === "NEED_REVIEW" && (
                <ActBtn allowed={canQA} onClick={guard(canQA, () => withToast(startReview({ variables: { id } }), t("t.reviewStarted"), t("t.reviewStartFail")))}>
                  {t("act.startReview")}
                </ActBtn>
              )}
              {/* The retest carries the issue's own scope, so the record lands on the same
                  app test / session the finding came from — not as a scope-less run. */}
              <ActBtn allowed={canQA} primary onClick={guard(canQA, () => openPanel({ kind: "record", mode: "create", initial: { retestIssueId: id, appTestId: i.appTestId, sessionTestId: i.sessionTestId } }))}>
                {t("act.retestReview")}
              </ActBtn>
              <ActBtn allowed={canQA} destructive onClick={guard(canQA, () => setModal("reopen"))}>{t("act.reopen")}</ActBtn>
            </>
          )}
          {i.status === "CLOSED" && (
            <ActBtn allowed={canQA} onClick={guard(canQA, () => setModal("reopenClosed"))}>{t("act.reopen")}</ActBtn>
          )}
          {i.review === "REJECTED" && !i.archived && (
            <ActBtn allowed={canQA} onClick={guard(canQA, () => openPanel({ kind: "issue", mode: "create", initial: { ...i, recreatedFromId: i.id } }))}>
              {t("act.recreate")}
            </ActBtn>
          )}
          {/* QA marks whether a prod-env finding is a real production issue (SLA). */}
          {i.canMarkProductionIssue && (
            <ActBtn allowed={canQA} onClick={guard(canQA, () => withToast(setProductionIssue({ variables: { id, value: !i.isProductionIssue } }), t("t.prodIssueUpdated"), t("t.issueUpdateFail")))}>
              {i.isProductionIssue ? t("act.unmarkProdIssue") : t("act.markProdIssue")}
            </ActBtn>
          )}
          <ActBtn allowed={canQA} onClick={guard(canQA, () => withToast(setArchived({ variables: { id, archived: !i.archived } }), i.archived ? t("t.issueUnarchived") : t("t.issueArchived"), t("t.issueUpdateFail")))}>
            {i.archived ? (
              <><ArchiveRestore className="mr-1 inline h-3.5 w-3.5" />{t("act.unarchive")}</>
            ) : (
              <><Archive className="mr-1 inline h-3.5 w-3.5" />{t("act.archive")}</>
            )}
          </ActBtn>
        </div>
      </div>

      {/* Comments */}
      <CommentsCard target="ISSUE" targetId={id} />

      {/* Where this finding came from: an app test or a testing session. QA can
          re-point it — issues filed outside the app-test flow land here unlinked. */}
      <div className="flex items-center gap-2 rounded border border-border px-5 py-3 text-xs">
        {i.appTestId ? (
          <>
            <span className="text-muted-foreground">{t("at.relatedAppTest")}: </span>
            <a href={`/app-tests/${i.appTestId}`} className="text-primary hover:underline">{i.appTestKey}</a>
          </>
        ) : i.sessionTestId ? (
          <>
            <span className="text-muted-foreground">{t("st.relatedSession")}: </span>
            <a href={`/session-tests/${i.sessionTestId}`} className="text-primary hover:underline">{i.sessionTestKey}</a>
          </>
        ) : (
          <span className="text-muted-foreground">{t("iss.scopeNotLinked")}</span>
        )}
        <button
          onClick={guard(canQA, () => openPanel({ kind: "issuescope", mode: "edit", id, initial: i }))}
          className={cn("ml-auto h-7 rounded border border-border px-2 hover:bg-muted", !canQA && "opacity-40")}
        >
          {i.appTestId || i.sessionTestId ? t("iss.scopeChange") : t("iss.scopeLink")}
        </button>
      </div>

      {/* Timeline */}
      <div className="rounded border border-border">
        <div className="border-b border-border px-5 py-4">
          <h3 className="text-sm font-semibold">{t("tl.title")}</h3>
        </div>
        <div className="px-5 py-4">
          <div className="space-y-0">
            {i.history.map((e: any, idx: number) => (
              <div key={e.id} className={cn("border-l border-border pl-4 pb-4", idx === i.history.length - 1 && "border-transparent")}>
                <div className="relative">
                  <span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-primary" />
                  <div className="text-xs">
                    <span className="font-medium capitalize">{e.kind}</span>
                    {e.fromVal && ` · ${e.fromVal} → `}
                    {e.toVal && <span className="font-medium">{e.toVal}</span>}
                    <span className="text-muted-foreground"> · {e.by.name} · {fmt(e.at)}</span>
                  </div>
                  {e.note && <div className="mt-0.5 text-xs text-muted-foreground">“{e.note}”</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Modals */}
      <TextPromptModal
        open={modal === "reject"}
        title={t("mod.rejectTitle")}
        label={t("mod.rejectLabel")}
        required
        destructive
        confirmLabel={t("act.reject")}
        onClose={() => setModal(null)}
        onSubmit={(reason) => withToast(reject({ variables: { id, reason } }), t("t.issueRejected"), t("t.issueRejectFail"))}
      />
      <TextPromptModal
        open={modal === "clarify"}
        title={t("act.needClarify")}
        label={t("mod.clarifyLabel")}
        required
        confirmLabel={t("c.send")}
        onClose={() => setModal(null)}
        onSubmit={(note) => withToast(needClarify({ variables: { id, note } }), t("t.clarifyRequested"), t("t.clarifyRequestFail"))}
      />
      <TextPromptModal
        open={modal === "clarifyRespond"}
        title={t("mod.respondTitle")}
        label={t("mod.clarifyNote")}
        onClose={() => setModal(null)}
        onSubmit={(note) => withToast(clarifyRespond({ variables: { id, note: note || null } }), t("t.clarifySent"), t("t.clarifySendFail"))}
      />
      <TextPromptModal
        open={modal === "reopen"}
        title={t("mod.reopenTitle")}
        label={t("mod.reopenLabel")}
        destructive
        confirmLabel={t("act.reopen")}
        onClose={() => setModal(null)}
        onSubmit={(note) => withToast(review({ variables: { id, pass: false, note: note || null } }), t("t.issueReopened"), t("t.issueReopenFail"))}
      />
      <TextPromptModal
        open={modal === "reopenClosed"}
        title={t("mod.reopenTitle")}
        label={t("mod.reopenLabel")}
        confirmLabel={t("act.reopen")}
        onClose={() => setModal(null)}
        onSubmit={(note) => withToast(reopen({ variables: { id, note: note || null } }), t("t.issueReopened"), t("t.issueReopenFail"))}
      />
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div>{value}</div>
    </div>
  );
}
function Block({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <div className="mb-0.5 font-medium">{label}</div>
      <div className="whitespace-pre-wrap text-muted-foreground">{text}</div>
    </div>
  );
}
function ActBtn({ children, onClick, primary, destructive, allowed = true }: { children: any; onClick: () => void; primary?: boolean; destructive?: boolean; allowed?: boolean }) {
  const cls = primary
    ? "bg-primary text-primary-foreground hover:bg-primary/90"
    : destructive
      ? "bg-destructive text-white hover:bg-destructive/90"
      : "border border-border hover:bg-muted";
  return (
    <button onClick={onClick} className={cn("h-8 rounded px-3 text-xs font-medium transition-colors", cls, !allowed && "opacity-40")}>
      {children}
    </button>
  );
}

