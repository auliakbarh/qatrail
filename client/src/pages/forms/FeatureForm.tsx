import { useForm } from "react-hook-form";
import { useMutation } from "@apollo/client";
import { useTranslation } from "react-i18next";
import { RightPanel } from "../../components/RightPanel";
import { Field, inputCls, FormActions } from "../../components/Form";
import { CREATE_FEATURE, UPDATE_FEATURE } from "../../graphql/hierarchy";
import { useNav, type PanelState } from "../../store/nav";
import { withToast } from "../../store/toast";

interface Form {
  name: string;
  description: string;
  minPassPercent: number;
}

export function FeatureForm({ panel, projectId }: { panel: PanelState; projectId: string }) {
  const { t } = useTranslation();
  const { closePanel } = useNav();
  const editing = panel.mode === "edit";
  const init = panel.initial ?? {};
  const { register, handleSubmit, formState } = useForm<Form>({
    defaultValues: {
      name: init.name ?? "",
      description: init.description ?? "",
      minPassPercent: init.minPassPercent ?? 0,
    },
  });
  const refetch = { refetchQueries: ["Features"] };
  const [createFeature] = useMutation(CREATE_FEATURE, refetch);
  const [updateFeature] = useMutation(UPDATE_FEATURE, refetch);

  const onSubmit = async (v: Form) => {
    const input = {
      name: v.name,
      description: v.description || null,
      minPassPercent: Number(v.minPassPercent),
    };
    const ok = editing
      ? await withToast(updateFeature({ variables: { id: panel.id, input } }), t("t.featureUpdated"), t("t.featureUpdateFail"))
      : await withToast(createFeature({ variables: { projectId, input } }), t("t.featureCreated"), t("t.featureCreateFail"));
    if (ok) closePanel();
  };

  return (
    <RightPanel
      title={editing ? t("form.editFeature") : t("dash.addFeature")}
      dirty={formState.isDirty}
      onClose={closePanel}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Field label={t("c.name")} error={formState.errors.name && t("c.required")}>
          <input className={inputCls} {...register("name", { required: true })} />
        </Field>
        <Field label={t("c.description")} optional>
          <textarea className={inputCls} rows={3} {...register("description")} />
        </Field>
        <Field label={t("form.minPassTestCases")}>
          <input
            type="number"
            min={0}
            max={100}
            className={inputCls}
            {...register("minPassPercent", {
              setValueAs: (v) => Math.max(0, Math.min(100, Math.round(Number(v) || 0))),
            })}
          />
        </Field>
        <FormActions onCancel={closePanel} saving={formState.isSubmitting} />
      </form>
    </RightPanel>
  );
}
