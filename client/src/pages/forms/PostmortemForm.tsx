import { useForm } from "react-hook-form";
import { useMutation } from "@apollo/client";
import { useTranslation } from "react-i18next";
import { RightPanel } from "../../components/RightPanel";
import { Field, inputCls, FormActions } from "../../components/Form";
import { ISSUE_SOLVE } from "../../graphql/workflow";
import { ISSUE, ISSUES } from "../../graphql/issue";
import { useNav } from "../../store/nav";
import { withToast } from "../../store/toast";

interface Form {
  rootCause: string;
  resolution: string;
  impact: string;
  prevention: string;
}

// Engineer fills this to move an issue IN_PROGRESS -> NEED_REVIEW.
export function PostmortemForm({ issueId, testCaseId }: { issueId: string; testCaseId: string }) {
  const { t } = useTranslation();
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
    const ok = await withToast(
      solve({
        variables: {
          id: issueId,
          postmortem: {
            rootCause: v.rootCause,
            resolution: v.resolution,
            impact: v.impact || null,
            prevention: v.prevention || null,
          },
        },
      }),
      t("t.issueSolved"),
      t("t.issueSolveFail"),
    );
    if (ok) closePanel();
  };

  return (
    <RightPanel title={t("form.solvePostmortem")} dirty={formState.isDirty} onClose={closePanel}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <p className="text-xs text-muted-foreground">{t("form.movesToReview")}</p>
        <Field label={t("pm.rootCause")} error={formState.errors.rootCause && t("c.required")}>
          <textarea className={inputCls} rows={3} {...register("rootCause", { required: true })} />
        </Field>
        <Field label={t("form.resolutionFix")} error={formState.errors.resolution && t("c.required")}>
          <textarea className={inputCls} rows={3} {...register("resolution", { required: true })} />
        </Field>
        <Field label={t("pm.impact")} optional>
          <textarea className={inputCls} rows={2} {...register("impact")} />
        </Field>
        <Field label={t("form.preventionItems")} optional>
          <textarea className={inputCls} rows={2} {...register("prevention")} />
        </Field>
        <FormActions onCancel={closePanel} saving={formState.isSubmitting} saveLabel={t("act.solve")} />
      </form>
    </RightPanel>
  );
}
