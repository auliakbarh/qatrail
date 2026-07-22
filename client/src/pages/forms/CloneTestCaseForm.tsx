import { useState } from "react";
import { useQuery, useMutation } from "@apollo/client";
import { useTranslation } from "react-i18next";
import { RightPanel } from "../../components/RightPanel";
import { Field, inputCls } from "../../components/Form";
import { PROJECTS, FEATURES, CLONE_TEST_CASE, TEST_CASES } from "../../graphql/hierarchy";
import { useNav } from "../../store/nav";
import { withToast } from "../../store/toast";

// Clone a test case (steps + attachments; no records/issues) into any feature.
export function CloneTestCaseForm({ testCaseId, sourceProjectId, sourceFeatureId }: { testCaseId: string; sourceProjectId: string; sourceFeatureId: string }) {
  const { t } = useTranslation();
  const { closePanel } = useNav();
  const [projectId, setProjectId] = useState(sourceProjectId);
  const [featureId, setFeatureId] = useState(sourceFeatureId);
  const [name, setName] = useState("");
  const { data: projData } = useQuery(PROJECTS);
  const { data: featData } = useQuery(FEATURES, { variables: { projectId }, skip: !projectId });
  const [clone, { loading }] = useMutation(CLONE_TEST_CASE, {
    refetchQueries: [{ query: TEST_CASES, variables: { featureId } }],
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!featureId) return;
    const ok = await withToast(
      clone({ variables: { id: testCaseId, targetFeatureId: featureId, name: name.trim() || null } }),
      t("clone.done"),
      t("clone.fail"),
    );
    if (ok) closePanel();
  };

  return (
    <RightPanel title={t("clone.testCaseTitle")} onClose={closePanel}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-xs text-muted-foreground">{t("clone.testCaseHelp")}</p>
        <Field label={t("dash.project")}>
          <select className={inputCls} value={projectId} onChange={(e) => { setProjectId(e.target.value); setFeatureId(""); }}>
            {(projData?.projects ?? []).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label={t("dash.feature")}>
          <select className={inputCls} value={featureId} onChange={(e) => setFeatureId(e.target.value)} disabled={!projectId}>
            <option value="">{t("move.selectFeature")}</option>
            {(featData?.features ?? []).map((f: any) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </Field>
        <Field label={t("clone.newName")} optional>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("clone.namePlaceholder")} />
        </Field>
        <div className="flex gap-2 pt-2">
          <button type="submit" disabled={loading || !featureId} className="flex-1 rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {loading ? t("c.saving") : t("clone.action")}
          </button>
          <button type="button" onClick={closePanel} className="flex-1 rounded border border-border px-4 py-2 text-sm hover:bg-muted">{t("c.cancel")}</button>
        </div>
      </form>
    </RightPanel>
  );
}
