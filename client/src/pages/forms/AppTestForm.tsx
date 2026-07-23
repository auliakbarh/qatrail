import { useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { useQuery, useMutation } from "@apollo/client";
import { useTranslation } from "react-i18next";
import { Plus, Trash2 } from "lucide-react";
import { RightPanel } from "../../components/RightPanel";
import { Field, inputCls, FormActions } from "../../components/Form";
import { SuggestDatalist } from "../../components/SuggestDatalist";
import { PROJECTS } from "../../graphql/hierarchy";
import { APP_TESTS, APP_TEST, CREATE_APP_TEST, UPDATE_APP_TEST } from "../../graphql/apptest";
import { useNav, type PanelState } from "../../store/nav";
import { withToast } from "../../store/toast";

interface Form {
  projectId: string;
  environment: string;
  platform: string;
  appVersion: string;
  backendVersion: string;
  downloadLink: string;
  note: string;
  jiraTickets: { value: string }[];
}

export function AppTestForm({ panel }: { panel: PanelState }) {
  const { t } = useTranslation();
  const { closePanel } = useNav();
  const editing = panel.mode === "edit";
  const init = panel.initial ?? {};

  const { data: projData } = useQuery(PROJECTS);
  const { data: atData } = useQuery(APP_TEST, { variables: { id: panel.id }, skip: !editing, fetchPolicy: "network-only" });

  const { register, handleSubmit, control, reset, formState } = useForm<Form>({
    defaultValues: {
      projectId: init.projectId ?? "",
      environment: init.environment ?? "STAGING",
      platform: init.platform ?? "WEB",
      appVersion: init.appVersion ?? "",
      backendVersion: init.backendVersion ?? "",
      downloadLink: init.downloadLink ?? "",
      note: init.note ?? "",
      jiraTickets: (init.jiraTickets ?? []).map((v: string) => ({ value: v })),
    },
  });
  const tickets = useFieldArray({ control, name: "jiraTickets" });

  useEffect(() => {
    if (editing && atData?.appTest) {
      const a = atData.appTest;
      reset({
        projectId: a.projectId,
        environment: a.environment,
        platform: a.platform,
        appVersion: a.appVersion ?? "",
        backendVersion: a.backendVersion ?? "",
        downloadLink: a.downloadLink,
        note: a.note ?? "",
        jiraTickets: (a.jiraTickets ?? []).map((v: string) => ({ value: v })),
      });
    }
  }, [editing, atData, reset]);

  const [createAppTest] = useMutation(CREATE_APP_TEST, { refetchQueries: [{ query: APP_TESTS, variables: { projectId: null } }] });
  const [updateAppTest] = useMutation(UPDATE_APP_TEST, {
    refetchQueries: [{ query: APP_TESTS, variables: { projectId: null } }, ...(panel.id ? [{ query: APP_TEST, variables: { id: panel.id } }] : [])],
  });

  const onSubmit = async (v: Form) => {
    const input = {
      projectId: v.projectId,
      environment: v.environment,
      platform: v.platform,
      appVersion: v.appVersion || null,
      backendVersion: v.backendVersion || null,
      downloadLink: v.downloadLink,
      note: v.note || null,
      jiraTickets: v.jiraTickets.map((x) => x.value.trim()).filter(Boolean),
    };
    const ok = editing
      ? await withToast(updateAppTest({ variables: { id: panel.id, input } }), t("t.appTestUpdated"), t("t.appTestUpdateFail"))
      : await withToast(createAppTest({ variables: { input } }), t("t.appTestCreated"), t("t.appTestCreateFail"));
    if (ok) closePanel();
  };

  const projects = projData?.projects ?? [];

  return (
    <RightPanel title={editing ? t("at.editApp") : t("at.newApp")} dirty={formState.isDirty} onClose={closePanel}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Field label={t("at.project")} error={formState.errors.projectId && t("c.required")}>
          <select className={inputCls} disabled={editing} {...register("projectId", { required: true })}>
            <option value="">{t("at.selectProject")}</option>
            {projects.map((p: any) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </Field>
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
        <div className="flex gap-2">
          <Field label={t("form.appVersion")} optional>
            <input className={inputCls} list="sug-at-appVersion" {...register("appVersion")} />
            <SuggestDatalist id="sug-at-appVersion" field="appVersion" />
          </Field>
          <Field label={t("form.backendVersion")} optional>
            <input className={inputCls} list="sug-at-backendVersion" {...register("backendVersion")} />
            <SuggestDatalist id="sug-at-backendVersion" field="backendVersion" />
          </Field>
        </div>
        <Field label={t("at.downloadLink")} error={formState.errors.downloadLink && t("c.required")}>
          <input className={inputCls} placeholder="https://…" {...register("downloadLink", { required: true })} />
        </Field>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">{t("at.jiraTickets")}</label>
            <button
              type="button"
              onClick={() => tickets.append({ value: "" })}
              className="flex h-7 items-center gap-1.5 rounded border border-border px-2 text-xs hover:bg-muted"
            >
              <Plus className="h-3 w-3" /> {t("at.ticket")}
            </button>
          </div>
          {tickets.fields.map((f, i) => (
            <div key={f.id} className="flex items-center gap-2">
              <input className={inputCls} placeholder="e.g. ATH-901" {...register(`jiraTickets.${i}.value` as const)} />
              <button
                type="button"
                onClick={() => tickets.remove(i)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-border hover:bg-muted"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>

        <Field label={t("c.note")} optional>
          <textarea className={inputCls} rows={2} {...register("note")} />
        </Field>
        <FormActions onCancel={closePanel} saving={formState.isSubmitting} />
      </form>
    </RightPanel>
  );
}
