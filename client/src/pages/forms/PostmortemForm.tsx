import { useForm } from "react-hook-form";
import { useMutation } from "@apollo/client";
import { RightPanel } from "../../components/RightPanel";
import { Field, inputCls, FormActions } from "../../components/Form";
import { ISSUE_SOLVE } from "../../graphql/workflow";
import { ISSUE, ISSUES } from "../../graphql/issue";
import { useNav } from "../../store/nav";

interface Form {
  rootCause: string;
  resolution: string;
  impact: string;
  prevention: string;
}

// Engineer fills this to move an issue IN_PROGRESS -> NEED_REVIEW.
export function PostmortemForm({ issueId, testCaseId }: { issueId: string; testCaseId: string }) {
  const { closePanel } = useNav();
  const { register, handleSubmit, formState } = useForm<Form>({
    defaultValues: { rootCause: "", resolution: "", impact: "", prevention: "" },
  });
  const [solve] = useMutation(ISSUE_SOLVE, {
    refetchQueries: [
      { query: ISSUE, variables: { id: issueId } },
      { query: ISSUES, variables: { testCaseId } },
    ],
  });

  const onSubmit = async (v: Form) => {
    await solve({
      variables: {
        id: issueId,
        postmortem: {
          rootCause: v.rootCause,
          resolution: v.resolution,
          impact: v.impact || null,
          prevention: v.prevention || null,
        },
      },
    });
    closePanel();
  };

  return (
    <RightPanel title="Solve — Postmortem" dirty={formState.isDirty} onClose={closePanel}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <p className="text-xs text-muted-foreground">Moves the issue to NEED_REVIEW for QA.</p>
        <Field label="Root cause" error={formState.errors.rootCause && "Required"}>
          <textarea className={inputCls} rows={3} {...register("rootCause", { required: true })} />
        </Field>
        <Field label="Resolution / fix" error={formState.errors.resolution && "Required"}>
          <textarea className={inputCls} rows={3} {...register("resolution", { required: true })} />
        </Field>
        <Field label="Impact" optional>
          <textarea className={inputCls} rows={2} {...register("impact")} />
        </Field>
        <Field label="Prevention / action items" optional>
          <textarea className={inputCls} rows={2} {...register("prevention")} />
        </Field>
        <FormActions onCancel={closePanel} saving={formState.isSubmitting} saveLabel="Solve" />
      </form>
    </RightPanel>
  );
}
