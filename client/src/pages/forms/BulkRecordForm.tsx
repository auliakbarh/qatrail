import { useState } from "react";
import { useMutation } from "@apollo/client";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, Eye, ChevronDown, ChevronRight } from "lucide-react";
import { RightPanel } from "../../components/RightPanel";
import { Modal } from "../../components/Modal";
import { Field, inputCls } from "../../components/Form";
import { TestCaseView } from "./TestCaseViewPanel";
import { CREATE_RECORD_TESTS, RECORD_TESTS } from "../../graphql/issue";
import { ASSIGNED_TEST_CASES, APP_TEST } from "../../graphql/apptest";
import { SESSION_TEST, SESSION_TEST_CASES, SESSION_TEST_RECORDS } from "../../graphql/sessiontest";
import { useNav } from "../../store/nav";
import { withToast } from "../../store/toast";
import { useAuth } from "../../store/auth";
import { issuePrefill, type AppTestCtx, type SessionAppCtx } from "../../lib/issuePrefill";

const ATTACH_KINDS = ["IMAGE", "VIDEO", "MARKDOWN", "JSON", "DOC", "XLS", "CSV", "PDF", "OTHER"];
const RESULTS = ["PASS", "FAIL", "BLOCKED"] as const;

// datetime-local wants "YYYY-MM-DDTHH:mm" in local time.
function nowLocal(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

export interface BulkCase {
  testCaseId: string;
  featureId: string;
  key: string;
  name: string;
  apps?: SessionAppCtx[]; // session context, per case
}

interface Row {
  result: "PASS" | "FAIL" | "BLOCKED";
  note: string;
  attachments: { url: string; kind: string; label: string }[];
  open: boolean; // attachment editor expanded
}

// Record the same run for several assigned test cases at once. One timestamp for
// the batch, one verdict per case. FAIL rows still need a real issue each, so the
// caller is handed their prefills and walks the normal issue form over them.
export function BulkRecordForm({
  cases,
  appTestId,
  appTest,
  sessionTestId,
  onFailures,
}: {
  cases: BulkCase[];
  appTestId?: string;
  appTest?: AppTestCtx;
  sessionTestId?: string;
  onFailures: (prefills: any[]) => void;
}) {
  const { t } = useTranslation();
  const { closePanel } = useNav();
  const { user } = useAuth();
  const [executedAt, setExecutedAt] = useState(nowLocal());
  const [rows, setRows] = useState<Record<string, Row>>(() =>
    Object.fromEntries(cases.map((c) => [c.testCaseId, { result: "PASS", note: "", attachments: [], open: false } as Row])),
  );
  const [viewId, setViewId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // The table behind the panel stays interactive, so a row can appear after mount.
  const rowOf = (id: string): Row => rows[id] ?? { result: "PASS", note: "", attachments: [], open: false };
  const patch = (id: string, p: Partial<Row>) => setRows((r) => ({ ...r, [id]: { ...rowOf(id), ...p } }));
  const patchAtt = (id: string, i: number, p: Partial<Row["attachments"][number]>) =>
    setRows((r) => ({ ...r, [id]: { ...rowOf(id), attachments: rowOf(id).attachments.map((a, j) => (j === i ? { ...a, ...p } : a)) } }));

  const refetchQueries = [
    "TestCases",
    ...cases.map((c) => ({ query: RECORD_TESTS, variables: { testCaseId: c.testCaseId } })),
    ...(appTestId
      ? [{ query: ASSIGNED_TEST_CASES, variables: { appTestId } }, { query: APP_TEST, variables: { id: appTestId } }]
      : []),
    ...(sessionTestId
      ? [
          { query: SESSION_TEST_CASES, variables: { sessionTestId } },
          { query: SESSION_TEST_RECORDS, variables: { sessionTestId } },
          { query: SESSION_TEST, variables: { id: sessionTestId } },
        ]
      : []),
  ];
  const [createRecordTests] = useMutation(CREATE_RECORD_TESTS, { refetchQueries });

  // The server refuses a blocked run with no blocker; say so before the round trip.
  const missingBlocker = cases.filter((c) => rowOf(c.testCaseId).result === "BLOCKED" && !rowOf(c.testCaseId).note.trim());
  const failCount = cases.filter((c) => rowOf(c.testCaseId).result === "FAIL").length;
  // Nothing typed yet: closing can't lose anything, so don't ask.
  const dirty = cases.some((c) => {
    const r = rowOf(c.testCaseId);
    return r.result !== "PASS" || !!r.note.trim() || r.attachments.length > 0;
  });

  const submit = async () => {
    if (missingBlocker.length > 0) return;
    setSaving(true);
    const res = await withToast(
      createRecordTests({
        variables: {
          executedAt: new Date(executedAt).toISOString(),
          appTestId: appTestId ?? null,
          sessionTestId: sessionTestId ?? null,
          inputs: cases.map((c) => ({
            testCaseId: c.testCaseId,
            result: rowOf(c.testCaseId).result,
            note: rowOf(c.testCaseId).note.trim() || null,
            attachments: rowOf(c.testCaseId).attachments
              .filter((a) => a.url.trim())
              .map((a) => ({ url: a.url, kind: a.kind, label: a.label || null })),
          })),
        },
      }),
      t("t.bulkRecordSaved", { n: cases.length }),
      t("t.recordSaveFail"),
    );
    setSaving(false);
    if (!res) return;

    // Hand back one prefill per FAIL, in the order they appear, so the caller can
    // walk the issue form over them.
    const byCase: Record<string, BulkCase> = Object.fromEntries(cases.map((c) => [c.testCaseId, c]));
    const prefills = (res.data?.createRecordTests ?? [])
      .filter((rec: any) => rec.result === "FAIL")
      .map((rec: any) => {
        const c = byCase[rec.testCaseId];
        return issuePrefill({
          record: rec,
          testCaseId: c.testCaseId,
          featureId: c.featureId,
          appTestId,
          appTest,
          sessionTestId,
          sessionApps: c.apps,
        });
      });
    onFailures(prefills);
  };

  const rowCls = "rounded border border-border px-3 py-2.5";

  return (
    <RightPanel title={t("bulkrun.title", { n: cases.length })} dirty={dirty} onClose={closePanel}>
      <div className="space-y-4">
        <Field label={t("iss.testedAt")}>
          <input
            type="datetime-local"
            className={inputCls}
            value={executedAt}
            onChange={(e) => setExecutedAt(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">{t("bulkrun.sharedTime")}</p>
        </Field>
        <Field label={t("rec.qa")}>
          <input className={inputCls} value={t("form.autoName", { name: user?.name })} disabled />
        </Field>

        <div className="space-y-2">
          {cases.map((c) => {
            const r = rowOf(c.testCaseId);
            const blockerMissing = r.result === "BLOCKED" && !r.note.trim();
            return (
              <div key={c.testCaseId} className={rowCls}>
                <div className="mb-2 flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-xs text-muted-foreground">{c.key}</div>
                    <div className="truncate text-sm">{c.name}</div>
                  </div>
                  <button
                    type="button"
                    title={t("bulkrun.viewCase")}
                    onClick={() => setViewId(c.testCaseId)}
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
                      onClick={() => patch(c.testCaseId, { result: v })}
                      className={`rounded border px-2 py-1 text-xs font-medium ${
                        r.result === v ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted"
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => patch(c.testCaseId, { open: !r.open })}
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
                  onChange={(e) => patch(c.testCaseId, { note: e.target.value })}
                />
                {blockerMissing && <p className="mt-1 text-xs text-destructive">{t("rec.blockedHint")}</p>}
                {r.result === "FAIL" && <p className="mt-1 text-xs text-muted-foreground">{t("form.failOpensIssue")}</p>}

                {r.open && (
                  <div className="mt-2 space-y-2">
                    {r.attachments.map((a, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          className={inputCls}
                          placeholder="https://…"
                          value={a.url}
                          onChange={(e) => patchAtt(c.testCaseId, i, { url: e.target.value })}
                        />
                        <select
                          className={`${inputCls} w-28`}
                          value={a.kind}
                          onChange={(e) => patchAtt(c.testCaseId, i, { kind: e.target.value })}
                        >
                          {ATTACH_KINDS.map((k) => (
                            <option key={k} value={k}>{k}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => patch(c.testCaseId, { attachments: r.attachments.filter((_, j) => j !== i) })}
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-border hover:bg-muted"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => patch(c.testCaseId, { attachments: [...r.attachments, { url: "", kind: "IMAGE", label: "" }] })}
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

        {failCount > 0 && (
          <p className="rounded border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            {t("bulkrun.issueQueueHint", { n: failCount })}
          </p>
        )}

        <div className="flex gap-2 pt-2">
          <button
            onClick={submit}
            disabled={saving || missingBlocker.length > 0}
            className="flex-1 rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {t("bulkrun.save", { n: cases.length })}
          </button>
          <button onClick={closePanel} className="flex-1 rounded border border-border px-4 py-2 text-sm font-medium hover:bg-muted">
            {t("c.cancel")}
          </button>
        </div>
      </div>

      {/* Steps/expected results, without leaving the panel — the verdicts typed so
          far live in this component's state. */}
      <Modal open={!!viewId} onClose={() => setViewId(null)} title={t("iss.testCase")}>
        {viewId && <TestCaseView testCaseId={viewId} />}
      </Modal>
    </RightPanel>
  );
}
