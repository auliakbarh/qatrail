import { useForm } from "react-hook-form";
import { useMutation } from "@apollo/client";
import { RightPanel } from "../../components/RightPanel";
import { Field, inputCls, FormActions } from "../../components/Form";
import { CREATE_FEATURE, UPDATE_FEATURE, FEATURES } from "../../graphql/hierarchy";
import { useNav, type PanelState } from "../../store/nav";

interface Form {
  name: string;
  description: string;
  minPassPercent: number;
}

export function FeatureForm({ panel, projectId }: { panel: PanelState; projectId: string }) {
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
  const refetch = { refetchQueries: [{ query: FEATURES, variables: { projectId } }] };
  const [createFeature] = useMutation(CREATE_FEATURE, refetch);
  const [updateFeature] = useMutation(UPDATE_FEATURE, refetch);

  const onSubmit = async (v: Form) => {
    const input = {
      name: v.name,
      description: v.description || null,
      minPassPercent: Number(v.minPassPercent),
    };
    if (editing) await updateFeature({ variables: { id: panel.id, input } });
    else await createFeature({ variables: { projectId, input } });
    closePanel();
  };

  return (
    <RightPanel
      title={editing ? "Edit Feature" : "Add Feature"}
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
        <Field label="Min pass % (collective of all test cases)">
          <input type="number" min={0} max={100} className={inputCls} {...register("minPassPercent")} />
        </Field>
        <FormActions onCancel={closePanel} saving={formState.isSubmitting} />
      </form>
    </RightPanel>
  );
}
