import { useForm } from "react-hook-form";
import { useMutation } from "@apollo/client";
import { useTranslation } from "react-i18next";
import { RightPanel } from "../../components/RightPanel";
import { Field, inputCls, FormActions } from "../../components/Form";
import { SuggestDatalist } from "../../components/SuggestDatalist";
import { APP_TESTS, APP_TEST, ASSIGNED_TEST_CASES, ADD_APP_TEST_BUILD } from "../../graphql/apptest";
import { useNav } from "../../store/nav";
import { withToast } from "../../store/toast";

interface Form {
  downloadLink: string;
  appVersion: string;
  backendVersion: string;
  note: string;
}

// Engineer submits a corrected build for an existing app test. Environment,
// platform, project and Jira tickets are deliberately absent — a build never
// changes those; edit the app test for that.
export function AppTestBuildForm({ appTestId, appTest }: { appTestId: string; appTest: any }) {
  const { t } = useTranslation();
  const { closePanel } = useNav();
  const { register, handleSubmit, formState } = useForm<Form>({
    defaultValues: { downloadLink: "", appVersion: appTest?.appVersion ?? "", backendVersion: appTest?.backendVersion ?? "", note: "" },
  });

  const [addBuild] = useMutation(ADD_APP_TEST_BUILD, {
    refetchQueries: [
      { query: APP_TEST, variables: { id: appTestId } },
      { query: ASSIGNED_TEST_CASES, variables: { appTestId } },
      { query: APP_TESTS, variables: { projectId: null } },
    ],
  });

  const onSubmit = async (v: Form) => {
    const input = {
      downloadLink: v.downloadLink,
      appVersion: v.appVersion || null,
      backendVersion: v.backendVersion || null,
      note: v.note || null,
    };
    const ok = await withToast(addBuild({ variables: { appTestId, input } }), t("t.buildAdded"), t("t.buildAddFail"));
    if (ok) closePanel();
  };

  return (
    <RightPanel title={t("at.newBuildTitle")} dirty={formState.isDirty} onClose={closePanel}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <p className="rounded border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">{t("at.newBuildHint")}</p>
        <Field label={t("at.downloadLink")} error={formState.errors.downloadLink && t("c.required")}>
          <input className={inputCls} placeholder="https://…" {...register("downloadLink", { required: true })} />
        </Field>
        <div className="flex gap-2">
          <Field label={t("form.appVersion")} optional>
            <input className={inputCls} list="sug-atb-appVersion" {...register("appVersion")} />
            <SuggestDatalist id="sug-atb-appVersion" field="appVersion" />
          </Field>
          <Field label={t("form.backendVersion")} optional>
            <input className={inputCls} list="sug-atb-backendVersion" {...register("backendVersion")} />
            <SuggestDatalist id="sug-atb-backendVersion" field="backendVersion" />
          </Field>
        </div>
        <Field label={t("c.note")} optional>
          <textarea className={inputCls} rows={3} {...register("note")} />
        </Field>
        <FormActions onCancel={closePanel} saving={formState.isSubmitting} />
      </form>
    </RightPanel>
  );
}
