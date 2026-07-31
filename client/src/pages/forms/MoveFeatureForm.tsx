import { useState } from "react";
import { useQuery, useMutation } from "@apollo/client";
import { useTranslation } from "react-i18next";
import { RightPanel } from "../../components/RightPanel";
import { Field, inputCls } from "../../components/Form";
import { PROJECTS, MOVE_FEATURE } from "../../graphql/hierarchy";
import { useNav } from "../../store/nav";
import { withToast } from "../../store/toast";

// Move a feature (with its test cases) to another project.
export function MoveFeatureForm({ featureId, sourceProjectId }: { featureId: string; sourceProjectId: string }) {
  const { t } = useTranslation();
  const { closePanel } = useNav();
  const [projectId, setProjectId] = useState("");
  const { data: projData } = useQuery(PROJECTS);
  const [move, { loading }] = useMutation(MOVE_FEATURE, {
    refetchQueries: [
      "Features",
    ],
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId) return;
    const ok = await withToast(move({ variables: { id: featureId, projectId } }), t("t.changeAsked"), t("move.fail"));
    if (ok) closePanel();
  };

  return (
    <RightPanel title={t("move.featureTitle")} onClose={closePanel}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-xs text-muted-foreground">{t("move.featureHelp")}</p>
        <Field label={t("dash.project")}>
          <select className={inputCls} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">{t("move.selectProject")}</option>
            {(projData?.projects ?? [])
              .filter((p: any) => p.id !== sourceProjectId)
              .map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <div className="flex gap-2 pt-2">
          <button type="submit" disabled={loading || !projectId} className="flex-1 rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {loading ? t("c.saving") : t("move.action")}
          </button>
          <button type="button" onClick={closePanel} className="flex-1 rounded border border-border px-4 py-2 text-sm hover:bg-muted">{t("c.cancel")}</button>
        </div>
      </form>
    </RightPanel>
  );
}
