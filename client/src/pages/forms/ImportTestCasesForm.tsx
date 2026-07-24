import { useState } from "react";
import { useMutation } from "@apollo/client";
import { useTranslation } from "react-i18next";
import { UploadCloud } from "lucide-react";
import { RightPanel } from "../../components/RightPanel";
import { IMPORT_TEST_CASES, FEATURES, TEST_CASES } from "../../graphql/hierarchy";
import { parseImport, type Scope, type ImportTestCase } from "../../lib/testCaseCsv";
import { useNav } from "../../store/nav";
import { withToast } from "../../store/toast";

interface Preview {
  ok: boolean;
  testCaseCount: number;
  stepCount: number;
  newFeatures: string[];
  errors: { row: number; message: string }[];
}

// Bulk CSV import: pick file → parse client-side → server dry-run preview → confirm.
export function ImportTestCasesForm({ scope, projectId, featureId }: { scope: Scope; projectId?: string; featureId?: string }) {
  const { t } = useTranslation();
  const { closePanel } = useNav();
  const [rows, setRows] = useState<ImportTestCase[] | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);

  const refetch = scope === "project"
    ? [{ query: FEATURES, variables: { projectId } }]
    : [{ query: TEST_CASES, variables: { featureId } }, { query: FEATURES, variables: { projectId } }];
  const [runImport, { loading }] = useMutation(IMPORT_TEST_CASES, { refetchQueries: refetch });

  const vars = (dryRun: boolean, r: ImportTestCase[]) => ({
    projectId: scope === "project" ? projectId : null,
    featureId: scope === "feature" ? featureId : null,
    dryRun,
    rows: r,
  });

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setRows(null); setPreview(null); setFileError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const parsed = parseImport(text, scope);
    if ("error" in parsed) { setFileError(parsed.error); return; }
    setRows(parsed.rows);
    const { data } = await runImport({ variables: vars(true, parsed.rows) });
    setPreview(data?.importTestCases ?? null);
  };

  const confirm = async () => {
    if (!rows) return;
    const ok = await withToast(runImport({ variables: vars(false, rows) }), t("imp.done"), t("imp.fail"));
    if (ok) closePanel();
  };

  return (
    <RightPanel title={t("imp.title")} onClose={closePanel}>
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground">{t(scope === "project" ? "imp.helpProject" : "imp.helpFeature")}</p>

        <label className="flex cursor-pointer flex-col items-center gap-2 rounded border border-dashed border-border px-4 py-6 text-center hover:bg-muted/40">
          <UploadCloud className="h-6 w-6 text-muted-foreground" />
          <span className="text-sm">{t("imp.pickFile")}</span>
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
        </label>

        {fileError && <div className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">{fileError}</div>}

        {preview && (
          <div className="space-y-3 rounded border border-border p-3 text-sm">
            <div className="flex flex-wrap gap-x-6 gap-y-1">
              <span>{t("imp.testCases")}: <b className="tabular-nums">{preview.testCaseCount}</b></span>
              <span>{t("imp.steps")}: <b className="tabular-nums">{preview.stepCount}</b></span>
            </div>
            {preview.newFeatures.length > 0 && (
              <div className="text-xs">
                <div className="mb-1 font-medium">{t("imp.newFeatures")} ({preview.newFeatures.length})</div>
                <div className="text-muted-foreground">{preview.newFeatures.join(", ")}</div>
              </div>
            )}
            {preview.errors.length > 0 ? (
              <div className="max-h-52 overflow-y-auto rounded border border-destructive/40">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-destructive/10 text-destructive">
                    <tr><th className="px-2 py-1 text-left">{t("imp.row")}</th><th className="px-2 py-1 text-left">{t("imp.error")}</th></tr>
                  </thead>
                  <tbody>
                    {preview.errors.map((er, i) => (
                      <tr key={i} className="border-t border-border/50"><td className="px-2 py-1 tabular-nums">{er.row}</td><td className="px-2 py-1">{er.message}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded border border-primary/40 bg-primary/10 px-3 py-2 text-xs">{t("imp.ready")}</div>
            )}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={confirm}
            disabled={loading || !preview?.ok}
            className="flex-1 rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? t("c.saving") : t("imp.confirm")}
          </button>
          <button type="button" onClick={closePanel} className="flex-1 rounded border border-border px-4 py-2 text-sm hover:bg-muted">{t("c.cancel")}</button>
        </div>
      </div>
    </RightPanel>
  );
}
