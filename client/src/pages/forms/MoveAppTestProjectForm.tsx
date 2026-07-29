import { useState } from "react";
import { useQuery, useMutation } from "@apollo/client";
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import { RightPanel } from "../../components/RightPanel";
import { Field, inputCls } from "../../components/Form";
import { PROJECTS } from "../../graphql/hierarchy";
import { APP_TESTS, APP_TEST, ASSIGNED_TEST_CASES } from "../../graphql/apptest";
import { MOVE_APP_TEST_PROJECT } from "../../graphql/sessiontest";
import { useNav } from "../../store/nav";
import { withToast } from "../../store/toast";

// Admin-only. Assignments belong to the OLD project's test cases, so the admin
// picks: release them, or clone the cases into the target project.
export function MoveAppTestProjectForm({
  appTest,
  assignedCount,
}: {
  appTest: { id: string; key: string; projectId: string; issueCount: number };
  assignedCount: number;
}) {
  const { t } = useTranslation();
  const { closePanel } = useNav();
  const { data } = useQuery(PROJECTS);
  const [projectId, setProjectId] = useState("");
  const [mode, setMode] = useState<"DROP" | "CLONE">("CLONE");
  const [move, { loading }] = useMutation(MOVE_APP_TEST_PROJECT, {
    refetchQueries: [
      { query: APP_TEST, variables: { id: appTest.id } },
      { query: ASSIGNED_TEST_CASES, variables: { appTestId: appTest.id } },
      { query: APP_TESTS, variables: { projectId: null } },
    ],
  });

  const submit = async () => {
    if (!projectId) return;
    const ok = await withToast(
      move({ variables: { id: appTest.id, projectId, mode } }),
      t("t.appTestMoved"),
      t("c.somethingWrong"),
    );
    if (ok) closePanel();
  };

  const projects = (data?.projects ?? []).filter((p: any) => p.id !== appTest.projectId);
  const radio = "flex cursor-pointer gap-2 rounded border border-border px-3 py-2 text-xs hover:bg-muted/40";

  return (
    <RightPanel title={t("at.moveProject")} onClose={closePanel}>
      <div className="space-y-4">
        <Field label={t("at.moveTargetProject")}>
          <select className={inputCls} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">{t("at.selectProject")}</option>
            {projects.map((p: any) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </Field>

        <div className="space-y-2">
          <div className="text-sm font-medium">{t("at.moveAssignments")}</div>
          <label className={radio}>
            <input type="radio" className="mt-0.5" checked={mode === "CLONE"} onChange={() => setMode("CLONE")} />
            <span>
              <span className="font-medium">{t("at.moveModeClone")}</span>
              <br />
              <span className="text-muted-foreground">{t("at.moveModeCloneHint")}</span>
            </span>
          </label>
          <label className={radio}>
            <input type="radio" className="mt-0.5" checked={mode === "DROP"} onChange={() => setMode("DROP")} />
            <span>
              <span className="font-medium">{t("at.moveModeDrop")}</span>
              <br />
              <span className="text-muted-foreground">{t("at.moveModeDropHint")}</span>
            </span>
          </label>
        </div>

        <div className="flex gap-2 rounded border border-border bg-muted/40 px-3 py-2 text-xs">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span>{t("at.moveImpact", { cases: assignedCount, issues: appTest.issueCount })}</span>
        </div>

        <div className="flex gap-2 pt-2">
          <button
            onClick={submit}
            disabled={!projectId || loading}
            className="flex-1 rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {t("at.moveProject")}
          </button>
          <button onClick={closePanel} className="flex-1 rounded border border-border px-4 py-2 text-sm font-medium hover:bg-muted">
            {t("c.cancel")}
          </button>
        </div>
      </div>
    </RightPanel>
  );
}
