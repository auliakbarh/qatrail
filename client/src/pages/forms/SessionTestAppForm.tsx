import { useState } from "react";
import { useForm } from "react-hook-form";
import { useQuery, useMutation } from "@apollo/client";
import { useTranslation } from "react-i18next";
import { RightPanel } from "../../components/RightPanel";
import { Field, inputCls, FormActions } from "../../components/Form";
import { SuggestDatalist } from "../../components/SuggestDatalist";
import {
  SESSION_TEST,
  SESSION_TESTS,
  SESSION_LINKABLE_APP_TESTS,
  ADD_SESSION_TEST_APP,
  UPDATE_SESSION_TEST_APP,
} from "../../graphql/sessiontest";
import { useNav, type PanelState } from "../../store/nav";
import { withToast } from "../../store/toast";

interface Form {
  appTestId: string;
  name: string;
  versionFe: string;
  versionBe: string;
  environment: string;
  platform: string;
  note: string;
}

export function SessionTestAppForm({ sessionTestId, panel }: { sessionTestId: string; panel: PanelState }) {
  const { t } = useTranslation();
  const { closePanel } = useNav();
  const editing = panel.mode === "edit";
  const init = panel.initial ?? {};
  // Linking an app test snapshots its versions server-side; manual entry is typed here.
  const [mode, setMode] = useState<"link" | "manual">(editing ? (init.appTestId ? "link" : "manual") : "link");

  const { data } = useQuery(SESSION_LINKABLE_APP_TESTS, { variables: { sessionTestId }, fetchPolicy: "cache-and-network" });
  const linkable = data?.sessionLinkableAppTests ?? [];

  const { register, handleSubmit, formState } = useForm<Form>({
    defaultValues: {
      appTestId: init.appTestId ?? "",
      name: init.name ?? "",
      versionFe: init.versionFe ?? "",
      versionBe: init.versionBe ?? "",
      environment: init.environment ?? "STAGING",
      platform: init.platform ?? "WEB",
      note: init.note ?? "",
    },
  });

  const refetch = {
    refetchQueries: [
      { query: SESSION_TEST, variables: { id: sessionTestId } },
      { query: SESSION_TESTS, variables: { projectId: null } },
      { query: SESSION_LINKABLE_APP_TESTS, variables: { sessionTestId } },
    ],
  };
  const [addApp] = useMutation(ADD_SESSION_TEST_APP, refetch);
  const [updateApp] = useMutation(UPDATE_SESSION_TEST_APP, refetch);

  const onSubmit = async (v: Form) => {
    const input =
      mode === "link"
        ? { appTestId: v.appTestId, note: v.note || null }
        : {
            appTestId: null,
            name: v.name,
            versionFe: v.versionFe || null,
            versionBe: v.versionBe || null,
            environment: v.environment,
            platform: v.platform,
            note: v.note || null,
          };
    const ok = editing
      ? await withToast(updateApp({ variables: { id: panel.id, input } }), t("t.appSaved"), t("c.somethingWrong"))
      : await withToast(addApp({ variables: { sessionTestId, input } }), t("t.appSaved"), t("c.somethingWrong"));
    if (ok) closePanel();
  };

  const tab = (active: boolean) =>
    active
      ? "flex-1 rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
      : "flex-1 rounded border border-border px-3 py-1.5 text-xs hover:bg-muted";

  return (
    <RightPanel title={editing ? t("st.editApp") : t("st.addApp")} dirty={formState.isDirty} onClose={closePanel}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="flex gap-2">
          <button type="button" className={tab(mode === "link")} onClick={() => setMode("link")}>{t("st.fromAppTest")}</button>
          <button type="button" className={tab(mode === "manual")} onClick={() => setMode("manual")}>{t("st.manualApp")}</button>
        </div>

        {mode === "link" ? (
          <Field label={t("st.pickAppTest")} error={formState.errors.appTestId && t("c.required")}>
            <select className={inputCls} {...register("appTestId", { required: mode === "link" })}>
              <option value="">{t("st.selectAppTest")}</option>
              {linkable.map((a: any) => (
                <option key={a.id} value={a.id}>
                  {a.key} · {a.platform} · {a.environment}
                  {a.appVersion ? ` · ${a.appVersion}` : ""}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">{t("st.snapshotHint")}</p>
          </Field>
        ) : (
          <>
            <Field label={t("st.appName")} error={formState.errors.name && t("c.required")}>
              <input className={inputCls} list="sug-st-appName" {...register("name", { required: mode === "manual" })} />
              <SuggestDatalist id="sug-st-appName" field="appName" />
            </Field>
            <div className="flex gap-2">
              <Field label={t("st.versionFe")} optional>
                <input className={inputCls} list="sug-st-fe" {...register("versionFe")} />
                <SuggestDatalist id="sug-st-fe" field="appVersion" />
              </Field>
              <Field label={t("st.versionBe")} optional>
                <input className={inputCls} list="sug-st-be" {...register("versionBe")} />
                <SuggestDatalist id="sug-st-be" field="backendVersion" />
              </Field>
            </div>
            <div className="flex gap-2">
              <Field label={t("iss.environment")}>
                <select className={inputCls} {...register("environment")}>
                  <option value="STAGING">STAGING</option>
                  <option value="PRODUCTION">PRODUCTION</option>
                </select>
              </Field>
              <Field label={t("iss.platform")}>
                <select className={inputCls} {...register("platform")}>
                  <option value="WEB">WEB</option>
                  <option value="ANDROID">ANDROID</option>
                  <option value="IOS">IOS</option>
                </select>
              </Field>
            </div>
          </>
        )}

        <Field label={t("c.note")} optional>
          <textarea className={inputCls} rows={2} {...register("note")} />
        </Field>
        <FormActions onCancel={closePanel} saving={formState.isSubmitting} />
      </form>
    </RightPanel>
  );
}
