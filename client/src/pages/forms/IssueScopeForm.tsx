import { useState } from "react";
import { useQuery, useMutation } from "@apollo/client";
import { useTranslation } from "react-i18next";
import { RightPanel } from "../../components/RightPanel";
import { Field, inputCls, FormActions } from "../../components/Form";
import { SET_ISSUE_SCOPE } from "../../graphql/workflow";
import { ISSUE } from "../../graphql/issue";
import { APP_TESTS } from "../../graphql/apptest";
import { SESSION_TESTS } from "../../graphql/sessiontest";
import { useNav } from "../../store/nav";
import { withToast } from "../../store/toast";

type Kind = "NONE" | "APP" | "SESSION";

// Re-point a finding at the app test / testing session it came from. The server
// refuses a cross-project target and a still-flagged production issue.
export function IssueScopeForm({ issue }: { issue: any }) {
  const { t } = useTranslation();
  const { closePanel } = useNav();
  const [kind, setKind] = useState<Kind>(issue.appTestId ? "APP" : issue.sessionTestId ? "SESSION" : "NONE");
  const [appTestId, setAppTestId] = useState<string>(issue.appTestId ?? "");
  const [sessionTestId, setSessionTestId] = useState<string>(issue.sessionTestId ?? "");
  const [saving, setSaving] = useState(false);

  const { data: appData } = useQuery(APP_TESTS, { variables: { projectId: issue.projectId }, skip: kind !== "APP" });
  const { data: sessData } = useQuery(SESSION_TESTS, { variables: { projectId: issue.projectId }, skip: kind !== "SESSION" });
  const [setScope] = useMutation(SET_ISSUE_SCOPE, { refetchQueries: [{ query: ISSUE, variables: { id: issue.id } }] });

  // A production issue can't belong to a test run at all — SLA would be dropped.
  const blocked = issue.isProductionIssue;
  const missing = (kind === "APP" && !appTestId) || (kind === "SESSION" && !sessionTestId);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const ok = await withToast(
      setScope({
        variables: {
          id: issue.id,
          appTestId: kind === "APP" ? appTestId : null,
          sessionTestId: kind === "SESSION" ? sessionTestId : null,
        },
      }),
      t("t.issueScopeUpdated"),
      t("t.issueScopeFail"),
    );
    setSaving(false);
    if (ok) closePanel();
  };

  return (
    <RightPanel title={t("iss.scopeTitle")} onClose={closePanel}>
      <form onSubmit={onSubmit} className="space-y-4">
        <p className="text-xs text-muted-foreground">{t("iss.scopeHelp")}</p>
        {blocked && (
          <div className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs">
            {t("iss.scopeProdBlocked")}
          </div>
        )}
        <Field label={t("st.relatedScope")}>
          <select className={inputCls} value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
            <option value="NONE">{t("iss.scopeNone")}</option>
            <option value="APP">{t("at.relatedAppTest")}</option>
            <option value="SESSION">{t("st.relatedSession")}</option>
          </select>
        </Field>
        {kind === "APP" && (
          <Field label={t("at.relatedAppTest")}>
            <select className={inputCls} value={appTestId} onChange={(e) => setAppTestId(e.target.value)}>
              <option value="">{t("c.select")}</option>
              {(appData?.appTests ?? []).map((a: any) => (
                <option key={a.id} value={a.id}>
                  {a.key} · {a.platform} · {a.appVersion ?? "—"} · {a.status}
                </option>
              ))}
            </select>
          </Field>
        )}
        {kind === "SESSION" && (
          <Field label={t("st.relatedSession")}>
            <select className={inputCls} value={sessionTestId} onChange={(e) => setSessionTestId(e.target.value)}>
              <option value="">{t("c.select")}</option>
              {(sessData?.sessionTests ?? []).map((s: any) => (
                <option key={s.id} value={s.id}>
                  {s.key} · {s.kindLabel} · {s.status}
                </option>
              ))}
            </select>
          </Field>
        )}
        <FormActions onCancel={closePanel} saving={saving} disabled={blocked || missing} saveLabel={t("c.save")} />
      </form>
    </RightPanel>
  );
}
