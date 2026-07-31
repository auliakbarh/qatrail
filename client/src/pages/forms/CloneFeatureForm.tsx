import { useState } from "react";
import { useQuery, useMutation } from "@apollo/client";
import { useTranslation } from "react-i18next";
import { RightPanel } from "../../components/RightPanel";
import { Field, inputCls } from "../../components/Form";
import { PROJECTS, CLONE_FEATURE } from "../../graphql/hierarchy";
import { useNav } from "../../store/nav";
import { withToast } from "../../store/toast";

// Clone a feature (with its test cases; no records/issues) into any project.
export function CloneFeatureForm({ featureId, sourceProjectId }: { featureId: string; sourceProjectId: string }) {
  const { t } = useTranslation();
  const { closePanel } = useNav();
  const [projectId, setProjectId] = useState(sourceProjectId);
  const [name, setName] = useState("");
  const { data: projData } = useQuery(PROJECTS);
  const [clone, { loading }] = useMutation(CLONE_FEATURE, {
    refetchQueries: ["Features"],
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await withToast(
      clone({ variables: { id: featureId, targetProjectId: projectId, name: name.trim() || null } }),
      t("t.changeAsked"),
      t("clone.fail"),
    );
    if (ok) closePanel();
  };

  return (
    <RightPanel title={t("clone.featureTitle")} onClose={closePanel}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-xs text-muted-foreground">{t("clone.featureHelp")}</p>
        <Field label={t("dash.project")}>
          <select className={inputCls} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            {(projData?.projects ?? []).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label={t("clone.newName")} optional>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("clone.namePlaceholder")} />
        </Field>
        <div className="flex gap-2 pt-2">
          <button type="submit" disabled={loading || !projectId} className="flex-1 rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {loading ? t("c.saving") : t("clone.action")}
          </button>
          <button type="button" onClick={closePanel} className="flex-1 rounded border border-border px-4 py-2 text-sm hover:bg-muted">{t("c.cancel")}</button>
        </div>
      </form>
    </RightPanel>
  );
}
