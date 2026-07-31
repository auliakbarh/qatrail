import { useState } from "react";
import { useQuery, useMutation } from "@apollo/client";
import { useTranslation } from "react-i18next";
import { RightPanel } from "../../components/RightPanel";
import { Field, inputCls } from "../../components/Form";
import { PROJECTS, FEATURES, MOVE_TEST_CASE, TEST_CASES } from "../../graphql/hierarchy";
import { useNav, useDrill } from "../../store/nav";
import { withToast } from "../../store/toast";

// Move a test case to another feature — optionally in a different project.
export function MoveTestCaseForm({ testCaseId, sourceFeatureId }: { testCaseId: string; sourceFeatureId: string }) {
  const { t } = useTranslation();
  const { closePanel } = useNav();
  const { goTestCase } = useDrill();
  const [projectId, setProjectId] = useState("");
  const [featureId, setFeatureId] = useState("");
  const { data: projData } = useQuery(PROJECTS);
  const { data: featData } = useQuery(FEATURES, { variables: { projectId }, skip: !projectId });
  const [move, { loading }] = useMutation(MOVE_TEST_CASE, {
    refetchQueries: [
      { query: TEST_CASES, variables: { featureId: sourceFeatureId } },
      ...(featureId ? [{ query: TEST_CASES, variables: { featureId } }] : []),
    ],
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!featureId) return;
    const ok = await withToast(move({ variables: { id: testCaseId, featureId } }), t("move.done"), t("move.fail"));
    if (ok) {
      closePanel();
      goTestCase(null); // it left this feature
    }
  };

  return (
    <RightPanel title={t("move.title")} onClose={closePanel}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-xs text-muted-foreground">{t("move.help")}</p>
        <Field label={t("dash.project")}>
          <select className={inputCls} value={projectId} onChange={(e) => { setProjectId(e.target.value); setFeatureId(""); }}>
            <option value="">{t("move.selectProject")}</option>
            {(projData?.projects ?? []).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label={t("dash.feature")}>
          <select className={inputCls} value={featureId} onChange={(e) => setFeatureId(e.target.value)} disabled={!projectId}>
            <option value="">{t("move.selectFeature")}</option>
            {(featData?.features ?? []).map((f: any) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </Field>
        <div className="flex gap-2 pt-2">
          <button type="submit" disabled={loading || !featureId} className="flex-1 rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {loading ? t("c.saving") : t("move.action")}
          </button>
          <button type="button" onClick={closePanel} className="flex-1 rounded border border-border px-4 py-2 text-sm hover:bg-muted">{t("c.cancel")}</button>
        </div>
      </form>
    </RightPanel>
  );
}
