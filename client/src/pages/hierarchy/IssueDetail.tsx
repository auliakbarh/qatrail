import { useState } from "react";
import { useQuery, useMutation } from "@apollo/client";
import { ArrowLeft, Archive, ArchiveRestore, Copy } from "lucide-react";
import { ISSUE, ISSUES } from "../../graphql/issue";
import {
  ISSUE_ACCEPT,
  ISSUE_REJECT,
  ISSUE_NEED_CLARIFY,
  ISSUE_HOLD,
  ISSUE_RESUME,
  ISSUE_CLARIFY_RESPOND,
  ISSUE_REVIEW,
  SET_ISSUE_ARCHIVED,
} from "../../graphql/workflow";
import { useNav } from "../../store/nav";
import { useAuth } from "../../store/auth";
import { cn } from "../../lib/utils";
import { TextPromptModal } from "../../components/TextPromptModal";

function Badge({ children, variant = "muted" }: { children: any; variant?: "muted" | "primary" | "destructive" | "outline" }) {
  const cls = {
    muted: "bg-muted text-muted-foreground",
    primary: "bg-primary text-primary-foreground",
    destructive: "bg-destructive text-white",
    outline: "border border-border text-muted-foreground",
  }[variant];
  return <span className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium", cls)}>{children}</span>;
}

const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : "—");

export function IssueDetail({ id, testCaseId }: { id: string; testCaseId: string }) {
  const { selectIssue, openPanel } = useNav();
  const { user } = useAuth();
  const { data, loading } = useQuery(ISSUE, { variables: { id }, fetchPolicy: "cache-and-network" });
  const [modal, setModal] = useState<null | "reject" | "clarify" | "clarifyRespond" | "reopen">(null);

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
  const [review] = useMutation(ISSUE_REVIEW, refetch);
  const [setArchived] = useMutation(SET_ISSUE_ARCHIVED, refetch);

  if (loading && !data) return <div className="rounded border border-border p-8 text-sm text-muted-foreground">Loading…</div>;
  const i = data?.issue;
  if (!i) return <div className="rounded border border-border p-8 text-sm text-muted-foreground">Not found</div>;

  const isAssignee = user?.id === i.assignee.id;
  const isAdmin = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
  const canEngineer = isAssignee || isAdmin;
  const canQA = user?.id === i.reporter.id || user?.role === "QA" || isAdmin;

  const copyLink = () => {
    void navigator.clipboard.writeText(`${location.origin}/issues/${i.id}`);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded border border-border">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <button onClick={() => selectIssue(null)} className="flex h-7 w-7 items-center justify-center rounded border border-border hover:bg-muted">
              <ArrowLeft className="h-3.5 w-3.5" />
            </button>
            <h2 className="text-sm font-semibold">{i.title}</h2>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={copyLink} title="Copy issue link" className="flex h-7 items-center gap-1.5 rounded border border-border px-2 text-xs hover:bg-muted">
              <Copy className="h-3 w-3" /> Link
            </button>
            <Badge variant={i.type === "DEFECT" ? "destructive" : "outline"}>{i.type}</Badge>
            <Badge variant="outline">{i.priority}</Badge>
            <Badge variant="primary">{i.status}</Badge>
            {i.review !== "PENDING" && <Badge>{i.review}</Badge>}
            {i.archived && <Badge variant="outline">ARCHIVED</Badge>}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 px-5 py-4 text-xs md:grid-cols-4">
          <Info label="Environment" value={i.environment} />
          <Info label="Platform" value={i.platform} />
          <Info label="App ver" value={i.appVersion ?? "—"} />
          <Info label="Backend ver" value={i.backendVersion ?? "—"} />
          <Info label="Reporter" value={i.reporter.name} />
          <Info label="Assignee" value={i.assignee.name} />
          <Info label="Test account" value={i.testAccount} />
          <Info label="Tested at" value={fmt(i.testedAt)} />
        </div>
      </div>

      {/* Detail */}
      <div className="rounded border border-border px-5 py-4 text-sm">
        <div className="space-y-3">
          <Block label="Description" text={i.description} />
          {i.preconditions && <Block label="Preconditions" text={i.preconditions} />}
          <Block label="Steps to reproduce" text={i.steps} />
          <Block label="Actual result" text={i.actualResult} />
          <Block label="Expected result" text={i.expectedResult} />
          {i.note && <Block label="Note" text={i.note} />}
          {i.attachments.length > 0 && (
            <div>
              <div className="mb-1 font-medium">Attachments</div>
              <div className="flex flex-wrap gap-2">
                {i.attachments.map((a: any) => (
                  <a key={a.order} href={a.url} target="_blank" rel="noreferrer" className="inline-flex items-center rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted">
                    {a.order}. {a.label || a.kind}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Postmortem */}
      {i.postmortem && (
        <div className="rounded border border-border">
          <div className="border-b border-border px-5 py-4">
            <h3 className="text-sm font-semibold">Postmortem</h3>
          </div>
          <div className="space-y-3 px-5 py-4 text-sm">
            <Block label="Root cause" text={i.postmortem.rootCause} />
            <Block label="Resolution" text={i.postmortem.resolution} />
            {i.postmortem.impact && <Block label="Impact" text={i.postmortem.impact} />}
            {i.postmortem.prevention && <Block label="Prevention" text={i.postmortem.prevention} />}
            <p className="text-xs text-muted-foreground">
              by {i.postmortem.resolvedBy.name} · {fmt(i.postmortem.resolvedAt)}
            </p>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="rounded border border-border">
        <div className="border-b border-border px-5 py-4">
          <h3 className="text-sm font-semibold">Actions</h3>
        </div>
        <div className="flex flex-wrap gap-2 px-5 py-4">
          {/* Engineer */}
          {canEngineer && (i.status === "OPEN" || i.status === "REOPENED") && (
            <>
              <ActBtn primary onClick={() => accept({ variables: { id } })}>Accept</ActBtn>
              <ActBtn onClick={() => setModal("clarify")}>Need clarification</ActBtn>
              <ActBtn destructive onClick={() => setModal("reject")}>Reject</ActBtn>
            </>
          )}
          {canEngineer && i.status === "IN_PROGRESS" && (
            <>
              <ActBtn primary onClick={() => openPanel({ kind: "postmortem", mode: "create", id })}>Solve</ActBtn>
              <ActBtn onClick={() => hold({ variables: { id } })}>Hold</ActBtn>
            </>
          )}
          {canEngineer && i.status === "HOLD" && (
            <ActBtn primary onClick={() => resume({ variables: { id } })}>Resume</ActBtn>
          )}
          {/* QA */}
          {canQA && i.review === "NEED_CLARIFY" && (
            <ActBtn primary onClick={() => setModal("clarifyRespond")}>Respond clarification</ActBtn>
          )}
          {canQA && i.status === "NEED_REVIEW" && (
            <>
              <ActBtn primary onClick={() => review({ variables: { id, pass: true } })}>Approve → Close</ActBtn>
              <ActBtn destructive onClick={() => setModal("reopen")}>Reopen</ActBtn>
            </>
          )}
          {canQA && i.review === "REJECTED" && !i.archived && (
            <ActBtn onClick={() => openPanel({ kind: "issue", mode: "create", initial: { ...i, recreatedFromId: i.id } })}>
              Recreate
            </ActBtn>
          )}
          {canQA && (
            <ActBtn onClick={() => setArchived({ variables: { id, archived: !i.archived } })}>
              {i.archived ? (
                <><ArchiveRestore className="mr-1 inline h-3.5 w-3.5" />Unarchive</>
              ) : (
                <><Archive className="mr-1 inline h-3.5 w-3.5" />Archive</>
              )}
            </ActBtn>
          )}
          {!canEngineer && !canQA && <span className="text-xs text-muted-foreground">No actions available.</span>}
        </div>
      </div>

      {/* Timeline */}
      <div className="rounded border border-border">
        <div className="border-b border-border px-5 py-4">
          <h3 className="text-sm font-semibold">Status timeline</h3>
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
        title="Reject issue"
        label="Reason (sent to QA)"
        required
        destructive
        confirmLabel="Reject"
        onClose={() => setModal(null)}
        onSubmit={(reason) => reject({ variables: { id, reason } })}
      />
      <TextPromptModal
        open={modal === "clarify"}
        title="Need clarification"
        label="What's unclear? (sent to QA)"
        required
        confirmLabel="Send"
        onClose={() => setModal(null)}
        onSubmit={(note) => needClarify({ variables: { id, note } })}
      />
      <TextPromptModal
        open={modal === "clarifyRespond"}
        title="Respond to clarification"
        label="Clarification note"
        onClose={() => setModal(null)}
        onSubmit={(note) => clarifyRespond({ variables: { id, note: note || null } })}
      />
      <TextPromptModal
        open={modal === "reopen"}
        title="Reopen issue"
        label="Why is it not resolved?"
        destructive
        confirmLabel="Reopen"
        onClose={() => setModal(null)}
        onSubmit={(note) => review({ variables: { id, pass: false, note: note || null } })}
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
function ActBtn({ children, onClick, primary, destructive }: { children: any; onClick: () => void; primary?: boolean; destructive?: boolean }) {
  const cls = primary
    ? "bg-primary text-primary-foreground hover:bg-primary/90"
    : destructive
      ? "bg-destructive text-white hover:bg-destructive/90"
      : "border border-border hover:bg-muted";
  return (
    <button onClick={onClick} className={cn("h-8 rounded px-3 text-xs font-medium transition-colors", cls)}>
      {children}
    </button>
  );
}
