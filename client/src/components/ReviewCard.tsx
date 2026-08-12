import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Clock, Send, Undo2 } from "lucide-react";
import { Modal } from "./Modal";
import { fmtDateTime as fmt } from "../lib/utils";
import { useAuth } from "../store/auth";

// Peer review of an app test / testing session report (Setting.testReviewMode).
// One component for both, because the two flows are the same one: the QA who ran
// it submits, another QA approves it or sends it back with what is missing.
// Renders nothing when review is switched off — the server is still the gate.
export interface ReviewTarget {
  reviewRequired?: boolean;
  reviewState?: "IN_REVIEW" | "CHANGES_REQUESTED" | "APPROVED" | null;
  reviewNote?: string | null;
  reviewRequestedBy?: { id: string; name: string } | null;
  reviewRequestedAt?: string | null;
  reviewedBy?: { id: string; name: string } | null;
  reviewedAt?: string | null;
  canReview?: boolean;
}

export function ReviewCard({
  target,
  closed,
  canSubmit,
  onSubmit,
  onReview,
}: {
  target: ReviewTarget;
  closed: boolean;
  canSubmit: boolean;
  onSubmit: () => void;
  onReview: (approve: boolean, note?: string) => void;
}) {
  const { t } = useTranslation();
  const me = useAuth((s) => s.user?.id);
  const [changes, setChanges] = useState(false);
  const [note, setNote] = useState("");

  if (!target.reviewRequired) return null;
  const state = target.reviewState ?? null;

  const tone =
    state === "APPROVED"
      ? "border-emerald-500/40 bg-emerald-500/5"
      : state === "IN_REVIEW"
        ? "border-amber-500/40 bg-amber-500/5"
        : state === "CHANGES_REQUESTED"
          ? "border-destructive/40 bg-destructive/5"
          : "border-border";

  return (
    <div className={`rounded border px-5 py-4 text-xs ${tone}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-sm font-semibold">
            {state === "APPROVED" ? <CheckCircle2 className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
            {t("rev.title")}
          </div>
          <p className="text-muted-foreground">
            {state === "IN_REVIEW" &&
              t("rev.waiting", { name: target.reviewRequestedBy?.name ?? "—", at: fmt(target.reviewRequestedAt) })}
            {state === "APPROVED" &&
              t("rev.approvedBy", { name: target.reviewedBy?.name ?? "—", at: fmt(target.reviewedAt) })}
            {state === "CHANGES_REQUESTED" &&
              t("rev.sentBack", { name: target.reviewedBy?.name ?? "—", at: fmt(target.reviewedAt) })}
            {!state && t("rev.notSubmitted")}
          </p>
          {state === "CHANGES_REQUESTED" && target.reviewNote && (
            <p className="rounded bg-background/60 px-2 py-1.5">{target.reviewNote}</p>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {/* Submit: the tester hands a finished round over. A sent-back round
              submits again after the gaps are filled — but only by the QA who
              submitted it, never the reviewer who sent it back. */}
          {canSubmit && !closed && state !== "IN_REVIEW" && state !== "APPROVED" &&
            (state !== "CHANGES_REQUESTED" || !target.reviewRequestedBy || target.reviewRequestedBy.id === me) && (
            <button
              onClick={onSubmit}
              className="inline-flex h-7 items-center gap-1 rounded bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Send className="h-3.5 w-3.5" />
              {t("rev.submit")}
            </button>
          )}
          {target.canReview && (
            <>
              <button
                onClick={() => onReview(true)}
                className="inline-flex h-7 items-center gap-1 rounded bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {t("rev.approve")}
              </button>
              <button
                onClick={() => { setNote(""); setChanges(true); }}
                className="inline-flex h-7 items-center gap-1 rounded border border-border px-3 text-xs hover:bg-muted"
              >
                <Undo2 className="h-3.5 w-3.5" />
                {t("rev.requestChanges")}
              </button>
            </>
          )}
        </div>
      </div>

      <Modal
        open={changes}
        onClose={() => setChanges(false)}
        title={t("rev.requestChanges")}
        footer={
          <>
            <button onClick={() => setChanges(false)} className="h-7 rounded border border-border px-3 text-xs hover:bg-muted">
              {t("c.cancel")}
            </button>
            <button
              disabled={!note.trim()}
              onClick={() => { setChanges(false); onReview(false, note.trim()); }}
              className="h-7 rounded bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {t("rev.send")}
            </button>
          </>
        }
      >
        <label className="block space-y-1 text-xs">
          <span className="text-muted-foreground">{t("rev.noteLabel")}</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder={t("rev.notePlaceholder")}
          />
        </label>
      </Modal>
    </div>
  );
}
