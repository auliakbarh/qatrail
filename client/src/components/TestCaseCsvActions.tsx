import { useState } from "react";
import { useApolloClient } from "@apollo/client";
import { useTranslation } from "react-i18next";
import { Download, Upload, FileDown } from "lucide-react";
import { EXPORT_TEST_CASES } from "../graphql/hierarchy";
import { downloadTemplate, exportTestCasesCsv, type Scope } from "../lib/testCaseCsv";
import { useNav } from "../store/nav";
import { denied, useToast } from "../store/toast";

const btn = "flex h-7 items-center gap-1.5 rounded border border-border px-2.5 text-xs font-medium hover:bg-muted disabled:opacity-50";

// Template / Import / Export buttons for a test-case list. Scope = project (all
// features) or feature (one). Template + import are QA-gated; export is open.
export function TestCaseCsvActions({ scope, projectId, featureId, manage }: { scope: Scope; projectId?: string; featureId?: string; manage: boolean }) {
  const { t } = useTranslation();
  const { openPanel } = useNav();
  const client = useApolloClient();
  const push = useToast((s) => s.push);
  const [busy, setBusy] = useState(false);

  const doExport = async () => {
    setBusy(true);
    try {
      const { data } = await client.query({
        query: EXPORT_TEST_CASES,
        variables: { projectId: scope === "project" ? projectId : null, featureId: scope === "feature" ? featureId : null },
        fetchPolicy: "network-only",
      });
      exportTestCasesCsv(`testcases-${scope}.csv`, data?.exportTestCases ?? [], scope);
    } catch {
      push(t("imp.exportFail"), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <button className={btn} onClick={() => downloadTemplate(scope)} title={t("imp.template")}>
        <FileDown className="h-3.5 w-3.5" /> {t("imp.template")}
      </button>
      <button className={btn} disabled={busy} onClick={doExport} title={t("imp.export")}>
        <Download className="h-3.5 w-3.5" /> {t("imp.export")}
      </button>
      <button
        className={btn}
        onClick={() => (manage ? openPanel({ kind: "importtc", mode: "create", initial: { scope, projectId, featureId } }) : denied())}
        title={t("imp.import")}
      >
        <Upload className="h-3.5 w-3.5" /> {t("imp.import")}
      </button>
    </div>
  );
}
