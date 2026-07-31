import { useState } from "react";
import { useMutation } from "@apollo/client";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, Eye, ChevronDown, ChevronRight } from "lucide-react";
import { Modal } from "./Modal";
import { inputCls } from "./Form";
import { TestCaseView } from "../pages/forms/TestCaseViewPanel";
import { BULK_RETEST } from "../graphql/workflow";
import { withToast, useToast } from "../store/toast";

const ATTACH_KINDS = ["IMAGE", "VIDEO", "MARKDOWN", "JSON", "DOC", "XLS", "CSV", "PDF", "OTHER"];
const RESULTS = ["PASS", "FAIL", "BLOCKED"] as const;

function nowLocal(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

interface Row {
  result: "PASS" | "FAIL" | "BLOCKED";
  note: string;
  attachments: { url: string; kind: string; label: string }[];
  open: boolean;
}

const blank = (): Row => ({ result: "PASS", note: "", attachments: [], open: false });

// Verify several fixes at once. Each row writes its own run and applies the
// verdict it implies — PASS closes the issue, FAIL hands it back, BLOCKED decides
// nothing. Only issues waiting for review can be retested; the rest are named
// here rather than silently dropped.
export function BulkRetestModal({
  open,
  issues,
  onClose,
  onDone,
}: {
  open: boolean;
  issues: { id: string; key: string; title: string; status: string; testCaseId: string }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [executedAt, setExecutedAt] = useState(nowLocal());
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [viewId, setViewId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [retest] = useMutation(BULK_RETEST);

  const eligible = issues.filter((i) => i.status === "NEED_REVIEW");
  const ineligible = issues.filter((i) => i.status !== "NEED_REVIEW");

  const rowOf = (id: string): Row => rows[id] ?? blank();
  const patch = (id: string, p: Partial<Row>) => setRows((r) => ({ ...r, [id]: { ...rowOf(id), ...p } }));
  const patchAtt = (id: string, i: number, p: Partial<Row["attachments"][number]>) =>
    setRows((r) => ({ ...r, [id]: { ...rowOf(id), attachments: rowOf(id).attachments.map((a, j) => (j === i ? { ...a, ...p } : a)) } }));

  const missingBlocker = eligible.filter((i) => rowOf(i.id).result === "BLOCKED" && !rowOf(i.id).note.trim());

  const submit = async () => {
    if (eligible.length === 0 || missingBlocker.length > 0) return;
    setSaving(true);
    const res = await withToast(
      retest({
        variables: {
          executedAt: new Date(executedAt).toISOString(),
          inputs: eligible.map((i) => ({
            issueId: i.id,
            result: rowOf(i.id).result,
            note: rowOf(i.id).note.trim() || null,
            attachments: rowOf(i.id).attachments
              .filter((a) => a.url.trim())
              .map((a) => ({ url: a.url, kind: a.kind, label: a.label || null })),
          })),
        },
      }),
      t("retest.saved", { n: eligible.length }),
      t("c.somethingWrong"),
    );
    setSaving(false);
    if (!res) return;
    const r = res.data?.bulkRetest;
    // The server has the last word on eligibility — an engineer may have moved an
    // issue while this modal was open.
    if (r?.skipped > 0) useToast.getState().push(t("retest.skippedServer", { n: r.skipped }), "warning");
    setRows({});
    onDone();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={viewId ? t("iss.testCase") : t("retest.title", { n: eligible.length })}
      footer={
        viewId ? (
          <button onClick={() => setViewId(null)} className="h-7 rounded border border-border px-3 text-xs hover:bg-muted">
            {t("c.back")}
          </button>
        ) : (
        <>
          <button onClick={onClose} className="h-7 rounded border border-border px-3 text-xs hover:bg-muted">
            {t("c.cancel")}
          </button>
          <button
            onClick={submit}
            disabled={saving || eligible.length === 0 || missingBlocker.length > 0}
            className="h-7 rounded bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {t("retest.confirm", { n: eligible.length })}
          </button>
        </>
        )
      }
    >
      {viewId ? (
        <TestCaseView testCaseId={viewId} />
      ) : (
      <div className="space-y-3">
        <label className="block text-xs font-medium">
          {t("iss.testedAt")}
          <input
            type="datetime-local"
            className={`${inputCls} mt-1`}
            value={executedAt}
            onChange={(e) => setExecutedAt(e.target.value)}
          />
        </label>
        <p className="text-xs text-muted-foreground">{t("retest.effects")}</p>

        {ineligible.length > 0 && (
          <p className="rounded border border-[var(--warn)]/40 bg-[var(--warn)]/5 px-3 py-2 text-xs">
            {t("retest.skipped", { n: ineligible.length })}{" "}
            {ineligible.map((i) => `${i.key} · ${i.status}`).join(", ")}
          </p>
        )}
        {eligible.length === 0 && (
          <p className="py-4 text-center text-xs text-muted-foreground">{t("retest.noneEligible")}</p>
        )}

        {eligible.map((i) => {
          const r = rowOf(i.id);
          const blockerMissing = r.result === "BLOCKED" && !r.note.trim();
          return (
            <div key={i.id} className="rounded border border-border px-3 py-2.5">
              <div className="mb-2 flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-xs text-muted-foreground">{i.key}</div>
                  <div className="truncate text-sm">{i.title}</div>
                </div>
                <button
                  type="button"
                  title={t("bulkrun.viewCase")}
                  onClick={() => setViewId(i.testCaseId)}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-border hover:bg-muted"
                >
                  <Eye className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {RESULTS.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => patch(i.id, { result: v })}
                    className={`rounded border px-2 py-1 text-xs font-medium ${
                      r.result === v ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted"
                    }`}
                  >
                    {v}
                  </button>
                ))}
                <span className="text-xs text-muted-foreground">{t(`retest.effect.${r.result}`)}</span>
                <button
                  type="button"
                  onClick={() => patch(i.id, { open: !r.open })}
                  className="ml-auto inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs hover:bg-muted"
                >
                  {r.open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  {t("c.attachments")} {r.attachments.length > 0 && `(${r.attachments.length})`}
                </button>
              </div>
              <input
                className={`${inputCls} mt-2 ${blockerMissing ? "border-destructive" : ""}`}
                placeholder={r.result === "BLOCKED" ? t("rec.blocker") : t("c.note")}
                value={r.note}
                onChange={(e) => patch(i.id, { note: e.target.value })}
              />
              {blockerMissing && <p className="mt-1 text-xs text-destructive">{t("rec.blockedHint")}</p>}

              {r.open && (
                <div className="mt-2 space-y-2">
                  {r.attachments.map((a, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        className={inputCls}
                        placeholder="https://…"
                        value={a.url}
                        onChange={(e) => patchAtt(i.id, idx, { url: e.target.value })}
                      />
                      <select
                        className={`${inputCls} w-28`}
                        value={a.kind}
                        onChange={(e) => patchAtt(i.id, idx, { kind: e.target.value })}
                      >
                        {ATTACH_KINDS.map((k) => (
                          <option key={k} value={k}>{k}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => patch(i.id, { attachments: r.attachments.filter((_, j) => j !== idx) })}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-border hover:bg-muted"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => patch(i.id, { attachments: [...r.attachments, { url: "", kind: "IMAGE", label: "" }] })}
                    className="flex h-7 items-center gap-1.5 rounded border border-border px-2 text-xs hover:bg-muted"
                  >
                    <Plus className="h-3 w-3" /> {t("form.attachment")}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      )}
    </Modal>
  );
}
