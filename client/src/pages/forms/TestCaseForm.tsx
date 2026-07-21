import { useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { useMutation, useQuery } from "@apollo/client";
import { Plus, Trash2 } from "lucide-react";
import { RightPanel } from "../../components/RightPanel";
import { Field, inputCls, FormActions } from "../../components/Form";
import {
  CREATE_TEST_CASE,
  UPDATE_TEST_CASE,
  TEST_CASES,
  TEST_CASE,
} from "../../graphql/hierarchy";
import { useNav, type PanelState } from "../../store/nav";

const ATTACH_KINDS = ["IMAGE", "VIDEO", "MARKDOWN", "JSON", "DOC", "XLS", "CSV", "PDF", "OTHER"];

interface Form {
  name: string;
  description: string;
  precondition: string;
  note: string;
  steps: { step: string; expectedResult: string }[];
  attachments: { url: string; kind: string; label: string }[];
}

const EMPTY: Form = {
  name: "",
  description: "",
  precondition: "",
  note: "",
  steps: [{ step: "", expectedResult: "" }],
  attachments: [],
};

export function TestCaseForm({ panel, featureId }: { panel: PanelState; featureId: string }) {
  const { closePanel } = useNav();
  const editing = panel.mode === "edit";

  // Edit: fetch full test case (list rows lack steps/attachments).
  const { data } = useQuery(TEST_CASE, {
    variables: { id: panel.id },
    skip: !editing,
    fetchPolicy: "network-only",
  });

  const { register, handleSubmit, control, reset, formState } = useForm<Form>({ defaultValues: EMPTY });
  const steps = useFieldArray({ control, name: "steps" });
  const atts = useFieldArray({ control, name: "attachments" });

  useEffect(() => {
    if (editing && data?.testCase) {
      const tc = data.testCase;
      reset({
        name: tc.name,
        description: tc.description ?? "",
        precondition: tc.precondition ?? "",
        note: tc.note ?? "",
        steps: tc.steps.length
          ? tc.steps.map((s: any) => ({ step: s.step, expectedResult: s.expectedResult ?? "" }))
          : [{ step: "", expectedResult: "" }],
        attachments: tc.attachments.map((a: any) => ({ url: a.url, kind: a.kind, label: a.label ?? "" })),
      });
    }
  }, [editing, data, reset]);

  const refetch = { refetchQueries: [{ query: TEST_CASES, variables: { featureId } }] };
  const [createTestCase] = useMutation(CREATE_TEST_CASE, refetch);
  const [updateTestCase] = useMutation(UPDATE_TEST_CASE, refetch);

  const onSubmit = async (v: Form) => {
    const input = {
      name: v.name,
      description: v.description || null,
      precondition: v.precondition || null,
      note: v.note || null,
      steps: v.steps
        .filter((s) => s.step.trim())
        .map((s) => ({ step: s.step, expectedResult: s.expectedResult || null })),
      attachments: v.attachments
        .filter((a) => a.url.trim())
        .map((a) => ({ url: a.url, kind: a.kind, label: a.label || null })),
    };
    if (editing) await updateTestCase({ variables: { id: panel.id, input } });
    else await createTestCase({ variables: { featureId, input } });
    closePanel();
  };

  return (
    <RightPanel
      title={editing ? "Edit Test Case" : "Add Test Case"}
      dirty={formState.isDirty}
      onClose={closePanel}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Field label="Name" error={formState.errors.name && "Required"}>
          <input className={inputCls} {...register("name", { required: true })} />
        </Field>
        <Field label="Description" optional>
          <textarea className={inputCls} rows={2} {...register("description")} />
        </Field>
        <Field label="Precondition" optional>
          <textarea className={inputCls} rows={2} {...register("precondition")} />
        </Field>

        {/* Steps */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Steps</label>
            <button
              type="button"
              onClick={() => steps.append({ step: "", expectedResult: "" })}
              className="flex h-7 items-center gap-1.5 rounded border border-border px-2 text-xs hover:bg-muted"
            >
              <Plus className="h-3 w-3" /> Step
            </button>
          </div>
          {steps.fields.map((f, i) => (
            <div key={f.id} className="space-y-1.5 rounded border border-border p-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">#{i + 1}</span>
                <input
                  className={inputCls}
                  placeholder="Step"
                  {...register(`steps.${i}.step` as const)}
                />
                <button
                  type="button"
                  onClick={() => steps.remove(i)}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-border hover:bg-muted"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <input
                className={inputCls}
                placeholder="Expected result (optional)"
                {...register(`steps.${i}.expectedResult` as const)}
              />
            </div>
          ))}
        </div>

        {/* Attachments */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">
              Attachments <span className="font-normal text-muted-foreground">(URL)</span>
            </label>
            <button
              type="button"
              onClick={() => atts.append({ url: "", kind: "IMAGE", label: "" })}
              className="flex h-7 items-center gap-1.5 rounded border border-border px-2 text-xs hover:bg-muted"
            >
              <Plus className="h-3 w-3" /> Attachment
            </button>
          </div>
          {atts.fields.map((f, i) => (
            <div key={f.id} className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{i + 1}</span>
              <input className={inputCls} placeholder="https://…" {...register(`attachments.${i}.url` as const)} />
              <select className={`${inputCls} w-28`} {...register(`attachments.${i}.kind` as const)}>
                {ATTACH_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => atts.remove(i)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-border hover:bg-muted"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>

        <Field label="Note / Summary" optional>
          <textarea className={inputCls} rows={2} {...register("note")} />
        </Field>
        <FormActions onCancel={closePanel} saving={formState.isSubmitting} />
      </form>
    </RightPanel>
  );
}
