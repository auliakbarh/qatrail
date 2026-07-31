import { useForm } from "react-hook-form";
import { useMutation } from "@apollo/client";
import { useTranslation } from "react-i18next";
import { RightPanel } from "../../components/RightPanel";
import { Field, inputCls, FormActions } from "../../components/Form";
import { CREATE_PROJECT, UPDATE_PROJECT } from "../../graphql/hierarchy";
import { useNav, type PanelState } from "../../store/nav";
import { withToast } from "../../store/toast";

interface Form {
  name: string;
  description: string;
  squad: string;
  minPassPercent: number;
}

export function ProjectForm({ panel }: { panel: PanelState }) {
  const { t } = useTranslation();
  const { closePanel } = useNav();
  const editing = panel.mode === "edit";
  const init = panel.initial ?? {};
  const { register, handleSubmit, formState } = useForm<Form>({
    defaultValues: {
      name: init.name ?? "",
      description: init.description ?? "",
      squad: init.squad ?? "",
      minPassPercent: init.minPassPercent ?? 0,
    },
  });
  const [createProject] = useMutation(CREATE_PROJECT, { refetchQueries: ["Projects"] });
  const [updateProject] = useMutation(UPDATE_PROJECT, { refetchQueries: ["Projects"] });

  const onSubmit = async (v: Form) => {
    const input = {
      name: v.name,
      description: v.description || null,
      squad: v.squad || null,
      minPassPercent: Number(v.minPassPercent),
    };
    const ok = editing
      ? await withToast(updateProject({ variables: { id: panel.id, input } }), t("t.projectUpdated"), t("t.projectUpdateFail"))
      : await withToast(createProject({ variables: { input } }), t("t.projectCreated"), t("t.projectCreateFail"));
    if (ok) closePanel();
  };

  return (
    <RightPanel
      title={editing ? t("form.editProject") : t("dash.addProject")}
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
        <Field label={t("form.squadTeam")} optional>
          <input className={inputCls} {...register("squad")} />
        </Field>
        <Field label={t("form.minPassFeatures")}>
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
