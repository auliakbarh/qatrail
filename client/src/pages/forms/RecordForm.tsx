import { useForm, useFieldArray } from "react-hook-form";
import { useMutation } from "@apollo/client";
import { Plus, Trash2 } from "lucide-react";
import { RightPanel } from "../../components/RightPanel";
import { Field, inputCls, FormActions } from "../../components/Form";
import { CREATE_RECORD_TEST, RECORD_TESTS } from "../../graphql/issue";
import { TEST_CASES } from "../../graphql/hierarchy";
import { useNav } from "../../store/nav";
import { useAuth } from "../../store/auth";

const ATTACH_KINDS = ["IMAGE", "VIDEO", "MARKDOWN", "JSON", "DOC", "XLS", "CSV", "PDF", "OTHER"];

// datetime-local wants "YYYY-MM-DDTHH:mm" in local time.
function nowLocal(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

interface Form {
  executedAt: string;
  result: "PASS" | "FAIL";
  note: string;
  attachments: { url: string; kind: string; label: string }[];
}

export function RecordForm({ testCaseId, featureId }: { testCaseId: string; featureId: string }) {
  const { closePanel, openPanel } = useNav();
  const { user } = useAuth();
  const { register, handleSubmit, control, formState } = useForm<Form>({
    defaultValues: { executedAt: nowLocal(), result: "PASS", note: "", attachments: [] },
  });
  const atts = useFieldArray({ control, name: "attachments" });

  const [createRecordTest] = useMutation(CREATE_RECORD_TEST, {
    refetchQueries: [
      { query: RECORD_TESTS, variables: { testCaseId } },
      { query: TEST_CASES, variables: { featureId } },
    ],
  });

  const onSubmit = async (v: Form) => {
    const res = await createRecordTest({
      variables: {
        testCaseId,
        input: {
          executedAt: new Date(v.executedAt).toISOString(),
          result: v.result,
          note: v.note || null,
          attachments: v.attachments
            .filter((a) => a.url.trim())
            .map((a) => ({ url: a.url, kind: a.kind, label: a.label || null })),
        },
      },
    });
    const rec = res.data?.createRecordTest;
    // FAIL → open a prefilled Issue form (per requirement).
    if (rec?.result === "FAIL") {
      openPanel({
        kind: "issue",
        mode: "create",
        initial: { recordTestId: rec.id, testedAt: rec.executedAt },
      });
    } else {
      closePanel();
    }
  };

  return (
    <RightPanel title="Add Record Test" dirty={formState.isDirty} onClose={closePanel}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Field label="Tested at">
          <input type="datetime-local" className={inputCls} {...register("executedAt", { required: true })} />
        </Field>
        <Field label="QA">
          <input className={inputCls} value={`${user?.name} (auto)`} disabled />
        </Field>
        <Field label="Result">
          <select className={inputCls} {...register("result")}>
            <option value="PASS">PASS</option>
            <option value="FAIL">FAIL</option>
          </select>
        </Field>
        <Field label="Note" optional>
          <textarea className={inputCls} rows={2} {...register("note")} />
        </Field>

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

        <p className="text-xs text-muted-foreground">FAIL → the Issue form opens next, prefilled.</p>
        <FormActions onCancel={closePanel} saving={formState.isSubmitting} saveLabel="Save record" />
      </form>
    </RightPanel>
  );
}
