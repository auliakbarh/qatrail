import { useState } from "react";
import { useQuery, useMutation } from "@apollo/client";
import { useTranslation } from "react-i18next";
import { ArrowRight, ArrowLeft, Plus } from "lucide-react";
import { RightPanel } from "../../components/RightPanel";
import { inputCls } from "../../components/Form";
import { FEATURES } from "../../graphql/hierarchy";
import {
  SESSION_ASSIGNABLE_TEST_CASES,
  SESSION_TEST_CASES,
  SESSION_TEST,
  ASSIGN_SESSION_TEST_CASES,
} from "../../graphql/sessiontest";
import { useNav } from "../../store/nav";
import { withToast } from "../../store/toast";

// Same dual-column picker as the app-test one, plus: which of the session's apps
// these cases are exercised on (optional — a session may have no app at all) and
// a shortcut to author a brand-new test case in the catalogue first.
export function AssignSessionTestCasesPanel({
  sessionTestId,
  projectId,
  apps,
}: {
  sessionTestId: string;
  projectId: string;
  apps: { id: string; name: string }[];
}) {
  const { t } = useTranslation();
  const { closePanel, openPanel } = useNav();
  const { data } = useQuery(SESSION_ASSIGNABLE_TEST_CASES, { variables: { sessionTestId }, fetchPolicy: "cache-and-network" });
  const { data: featData } = useQuery(FEATURES, { variables: { projectId }, skip: !projectId });
  const [staged, setStaged] = useState<Set<string>>(new Set());
  const [pickedApps, setPickedApps] = useState<Set<string>>(new Set());
  const [feature, setFeature] = useState("");

  const refetch = {
    refetchQueries: [
      { query: SESSION_TEST_CASES, variables: { sessionTestId } },
      { query: SESSION_ASSIGNABLE_TEST_CASES, variables: { sessionTestId } },
      { query: SESSION_TEST, variables: { id: sessionTestId } },
    ],
  };
  const [assign, { loading }] = useMutation(ASSIGN_SESSION_TEST_CASES, refetch);

  const available: any[] = data?.sessionAssignableTestCases ?? [];
  const featName: Record<string, string> = Object.fromEntries((featData?.features ?? []).map((f: any) => [f.id, f.name]));
  const left = available.filter((tc) => tc.featureId === feature && !staged.has(tc.id));
  const right = available.filter((tc) => staged.has(tc.id));
  const rightGroups: [string, any[]][] = Object.entries(
    right.reduce<Record<string, any[]>>((acc, tc) => {
      const k = featName[tc.featureId] ?? "—";
      (acc[k] ??= []).push(tc);
      return acc;
    }, {}),
  ).sort((a, b) => a[0].localeCompare(b[0]));

  const move = (id: string, add: boolean) =>
    setStaged((prev) => {
      const next = new Set(prev);
      add ? next.add(id) : next.delete(id);
      return next;
    });
  const toggleApp = (id: string) =>
    setPickedApps((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const stageAllInFeature = () =>
    setStaged((prev) => {
      const next = new Set(prev);
      available.filter((tc) => tc.featureId === feature).forEach((tc) => next.add(tc.id));
      return next;
    });

  const submit = async () => {
    if (staged.size === 0) return;
    const ok = await withToast(
      assign({ variables: { sessionTestId, testCaseIds: [...staged], appIds: [...pickedApps] } }),
      t("t.assignDone"),
      t("t.assignFail"),
    );
    if (ok) closePanel();
  };

  const col = "flex-1 rounded border border-border overflow-y-auto max-h-[38vh]";
  const item = "flex w-full items-center gap-2 border-b border-border/50 px-2 py-1.5 text-left text-xs last:border-0 hover:bg-muted/40";

  return (
    <RightPanel title={t("st.assignTitle")} onClose={closePanel}>
      <div className="space-y-4">
        <div className="rounded border border-border bg-muted/30 p-3">
          <label className="mb-1.5 block text-xs font-medium">{t("at.pickFeature")}</label>
          <div className="flex gap-2">
            <select value={feature} onChange={(e) => setFeature(e.target.value)} className={inputCls}>
              <option value="">{t("at.selectFeature")}</option>
              {(featData?.features ?? []).map((f: any) => (
                <option key={f.id} value={f.id}>{f.name} ({f.testCaseCount})</option>
              ))}
            </select>
            <button
              onClick={stageAllInFeature}
              disabled={!feature || left.length === 0}
              title={t("at.moveAllHint")}
              className="shrink-0 rounded border border-border px-3 text-xs font-medium hover:bg-muted disabled:opacity-50"
            >
              {t("at.moveAll")}
            </button>
          </div>
          {feature && (
            <button
              onClick={() => openPanel({ kind: "testcase", mode: "create", initial: { featureId: feature, sessionTestId } })}
              className="mt-2 flex h-7 items-center gap-1.5 rounded border border-border bg-background px-2 text-xs hover:bg-muted"
            >
              <Plus className="h-3 w-3" /> {t("st.newTestCase")}
            </button>
          )}
        </div>

        {!feature ? (
          <div className="rounded border border-dashed border-border px-2 py-8 text-center text-xs text-muted-foreground">
            {t("at.selectFeatureFirst")}
          </div>
        ) : (
          <div className="flex gap-2">
            <div className="flex-1">
              <div className="mb-1 text-xs font-medium text-muted-foreground">{t("at.available")} ({left.length})</div>
              <div className={col}>
                {left.length === 0 && <div className="px-2 py-4 text-center text-xs text-muted-foreground">{t("at.allAssigned")}</div>}
                {left.map((tc) => (
                  <button key={tc.id} onClick={() => move(tc.id, true)} className={item}>
                    <span className="font-mono text-muted-foreground">{tc.key}</span>
                    <span className="truncate">{tc.name}</span>
                    <ArrowRight className="ml-auto h-3 w-3 shrink-0 text-muted-foreground" />
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">{t("at.toAssign")} ({right.length})</span>
                <button
                  onClick={() => setStaged(new Set())}
                  disabled={right.length === 0}
                  className="rounded border border-border px-2 py-0.5 text-[11px] font-medium hover:bg-muted disabled:opacity-40"
                >
                  {t("at.clearAll")}
                </button>
              </div>
              <div className={col}>
                {right.length === 0 && <div className="px-2 py-4 text-center text-xs text-muted-foreground">{t("at.pickHint")}</div>}
                {rightGroups.map(([fname, items]) => (
                  <div key={fname}>
                    <div className="sticky top-0 bg-muted/60 px-2 py-1 text-[11px] font-medium text-muted-foreground">{fname} · {items.length}</div>
                    {items.map((tc) => (
                      <button key={tc.id} onClick={() => move(tc.id, false)} className={item}>
                        <ArrowLeft className="mr-1 h-3 w-3 shrink-0 text-muted-foreground" />
                        <span className="font-mono text-muted-foreground">{tc.key}</span>
                        <span className="truncate">{tc.name}</span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Apps are optional: none picked = "not tied to a specific app". */}
        <div>
          <div className="mb-1.5 text-xs font-medium">
            {t("st.relateApps")} <span className="font-normal text-muted-foreground">({t("c.optional")})</span>
          </div>
          {apps.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("st.noAppsYet")}</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {apps.map((a) => (
                <button
                  key={a.id}
                  onClick={() => toggleApp(a.id)}
                  className={
                    pickedApps.has(a.id)
                      ? "rounded bg-primary px-2 py-1 text-xs font-medium text-primary-foreground"
                      : "rounded border border-border px-2 py-1 text-xs hover:bg-muted"
                  }
                >
                  {a.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-2">
          <button
            onClick={submit}
            disabled={staged.size === 0 || loading}
            className="flex-1 rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {t("at.assignN", { n: staged.size })}
          </button>
          <button onClick={closePanel} className="flex-1 rounded border border-border px-4 py-2 text-sm font-medium hover:bg-muted">
            {t("c.cancel")}
          </button>
        </div>
      </div>
    </RightPanel>
  );
}
