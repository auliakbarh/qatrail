import { useForm } from "react-hook-form";
import { useMutation } from "@apollo/client";
import { RightPanel } from "../../components/RightPanel";
import { Field, inputCls, FormActions } from "../../components/Form";
import { CREATE_PROJECT, UPDATE_PROJECT, PROJECTS } from "../../graphql/hierarchy";
import { useNav, type PanelState } from "../../store/nav";

interface Form {
  name: string;
  description: string;
  squad: string;
  minPassPercent: number;
}

export function ProjectForm({ panel }: { panel: PanelState }) {
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
  const [createProject] = useMutation(CREATE_PROJECT, { refetchQueries: [PROJECTS] });
  const [updateProject] = useMutation(UPDATE_PROJECT, { refetchQueries: [PROJECTS] });

  const onSubmit = async (v: Form) => {
    const input = {
      name: v.name,
      description: v.description || null,
      squad: v.squad || null,
      minPassPercent: Number(v.minPassPercent),
    };
    if (editing) await updateProject({ variables: { id: panel.id, input } });
    else await createProject({ variables: { input } });
    closePanel();
  };

  return (
    <RightPanel
      title={editing ? "Edit Project" : "Add Project"}
      dirty={formState.isDirty}
      onClose={closePanel}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Field label="Name" error={formState.errors.name && "Required"}>
          <input className={inputCls} {...register("name", { required: true })} />
        </Field>
        <Field label="Description" optional>
          <textarea className={inputCls} rows={3} {...register("description")} />
        </Field>
        <Field label="Squad / Team" optional>
          <input className={inputCls} {...register("squad")} />
        </Field>
        <Field label="Min pass % (collective of all features)">
          <input type="number" min={0} max={100} className={inputCls} {...register("minPassPercent")} />
        </Field>
        <FormActions onCancel={closePanel} saving={formState.isSubmitting} />
      </form>
    </RightPanel>
  );
}
