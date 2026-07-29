import { useForm } from "react-hook-form";
import { useMutation } from "@apollo/client";
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import { RightPanel } from "../../components/RightPanel";
import { Field, inputCls, FormActions } from "../../components/Form";
import { SESSION_TEST, SESSION_TESTS, SESSION_TEST_CASES, CLOSE_SESSION_TEST } from "../../graphql/sessiontest";
import { useNav } from "../../store/nav";
import { withToast } from "../../store/toast";

// Closing needs a summary; if cases were never run, say so plainly here — the
// sign-off report carries the same fact.
export function CloseSessionForm({
  sessionTestId,
  notStarted,
  passPercent,
  minPassPercent,
}: {
  sessionTestId: string;
  notStarted: number;
  passPercent: number;
  minPassPercent: number;
}) {
  const { t } = useTranslation();
  const { closePanel } = useNav();
  const { register, handleSubmit, formState } = useForm<{ summary: string }>({ defaultValues: { summary: "" } });
  const [closeSession] = useMutation(CLOSE_SESSION_TEST, {
    refetchQueries: [
      { query: SESSION_TEST, variables: { id: sessionTestId } },
      { query: SESSION_TEST_CASES, variables: { sessionTestId } },
      { query: SESSION_TESTS, variables: { projectId: null } },
    ],
  });

  const onSubmit = async (v: { summary: string }) => {
    const ok = await withToast(
      closeSession({ variables: { id: sessionTestId, summary: v.summary } }),
      t("t.sessionClosed"),
      t("c.somethingWrong"),
    );
    if (ok) closePanel();
  };

  return (
    <RightPanel title={t("st.closeSession")} dirty={formState.isDirty} onClose={closePanel}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {notStarted > 0 && (
          <div className="flex gap-2 rounded border border-border bg-muted/40 px-3 py-2 text-xs">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span>{t("st.closeUnfinished", { n: notStarted })}</span>
          </div>
        )}
        <div className="rounded border border-border px-3 py-2 text-xs">
          <span className="text-muted-foreground">{t("st.verdict")}: </span>
          <span className="font-medium">
            {passPercent >= minPassPercent ? t("st.verdictPassed") : t("st.verdictFailed")}
          </span>
          <span className="text-muted-foreground"> ({passPercent}% / {minPassPercent}%)</span>
        </div>
        <Field label={t("st.summary")} error={formState.errors.summary && t("c.required")}>
          <textarea className={inputCls} rows={6} {...register("summary", { required: true })} />
        </Field>
        <FormActions onCancel={closePanel} saving={formState.isSubmitting} saveLabel={t("st.closeSession")} />
      </form>
    </RightPanel>
  );
}
