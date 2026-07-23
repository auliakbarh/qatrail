import { useForm, useFieldArray } from "react-hook-form";
import { useMutation } from "@apollo/client";
import { useTranslation, Trans } from "react-i18next";
import { Plus, Trash2 } from "lucide-react";
import { RightPanel } from "../../components/RightPanel";
import { Field, inputCls, FormActions } from "../../components/Form";
import { CREATE_RECORD_TEST, RECORD_TESTS, ISSUE, ISSUES } from "../../graphql/issue";
import { ISSUE_REVIEW } from "../../graphql/workflow";
import { TEST_CASES } from "../../graphql/hierarchy";
import { ASSIGNED_TEST_CASES, APP_TEST } from "../../graphql/apptest";
import { useNav } from "../../store/nav";
import { withToast } from "../../store/toast";
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

export function RecordForm({
  testCaseId,
  featureId,
  retestIssueId,
  appTestId,
  appTest,
}: {
  testCaseId: string;
  featureId: string;
  retestIssueId?: string;
  appTestId?: string;
  // App test context — prefills + locks the issue's env/platform/versions and
  // defaults the assignee to the app's creator when a FAIL opens an issue.
  appTest?: { environment: string; platform: string; appVersion?: string | null; backendVersion?: string | null; createdBy?: { id: string; name: string } };
}) {
  const { t } = useTranslation();
  const { closePanel, openPanel } = useNav();
  const { user } = useAuth();
  const { register, handleSubmit, control, formState } = useForm<Form>({
    defaultValues: { executedAt: nowLocal(), result: "PASS", note: "", attachments: [] },
  });
  const atts = useFieldArray({ control, name: "attachments" });

  const appTestRefetch = appTestId
    ? [{ query: ASSIGNED_TEST_CASES, variables: { appTestId } }, { query: APP_TEST, variables: { id: appTestId } }]
    : [];
  const [createRecordTest] = useMutation(CREATE_RECORD_TEST, {
    refetchQueries: [
      { query: RECORD_TESTS, variables: { testCaseId } },
      { query: TEST_CASES, variables: { featureId } },
      ...appTestRefetch,
    ],
  });
  const [reviewIssue] = useMutation(ISSUE_REVIEW, {
    refetchQueries: [
      ...(retestIssueId ? [{ query: ISSUE, variables: { id: retestIssueId } }] : []),
      { query: ISSUES, variables: { testCaseId } },
      { query: TEST_CASES, variables: { featureId } },
    ],
  });

  const onSubmit = async (v: Form) => {
    const res = await withToast(
      createRecordTest({
        variables: {
          testCaseId,
          input: {
            executedAt: new Date(v.executedAt).toISOString(),
            result: v.result,
            note: v.note || null,
            retestIssueId: retestIssueId ?? null,
            appTestId: appTestId ?? null,
            attachments: v.attachments
              .filter((a) => a.url.trim())
              .map((a) => ({ url: a.url, kind: a.kind, label: a.label || null })),
          },
        },
      }),
      t("t.recordSaved"),
      t("t.recordSaveFail"),
    );
    if (!res) return;
    const rec = res.data?.createRecordTest;

    // Retest mode: this record verifies an issue's fix. PASS closes it, FAIL reopens it.
    if (retestIssueId) {
      const pass = rec?.result === "PASS";
      await withToast(
        reviewIssue({ variables: { id: retestIssueId, pass, note: v.note || null } }),
        pass ? t("t.retestPassed") : t("t.retestFailed"),
        t("t.issueUpdateFail"),
      );
      closePanel();
      return;
    }

    // Normal mode: FAIL → open a prefilled Issue form (per requirement).
    if (rec?.result === "FAIL") {
      openPanel({
        kind: "issue",
        mode: "create",
        // Carry app-test context: link + locked env/platform/versions + default assignee.
        initial: {
          recordTestId: rec.id,
          testedAt: rec.executedAt,
          appTestId,
          testCaseId,
          featureId,
          fromAppTest: !!appTestId,
          environment: appTest?.environment,
          platform: appTest?.platform,
          appVersion: appTest?.appVersion,
          backendVersion: appTest?.backendVersion,
          assignee: appTest?.createdBy,
        },
      });
    } else {
      closePanel();
    }
  };

  return (
    <RightPanel title={retestIssueId ? t("form.retestVerify") : t("form.addRecordTest")} dirty={formState.isDirty} onClose={closePanel}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {retestIssueId && (
          <div className="rounded border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <Trans i18nKey="form.retestBanner" components={{ b: <b className="text-foreground" /> }} />
          </div>
        )}
        <Field label={t("iss.testedAt")}>
          <input type="datetime-local" className={inputCls} {...register("executedAt", { required: true })} />
        </Field>
        <Field label={t("rec.qa")}>
          <input className={inputCls} value={t("form.autoName", { name: user?.name })} disabled />
        </Field>
        <Field label={t("c.result")}>
          <select className={inputCls} {...register("result")}>
            <option value="PASS">PASS</option>
            <option value="FAIL">FAIL</option>
          </select>
        </Field>
        <Field label={t("c.note")} optional>
          <textarea className={inputCls} rows={2} {...register("note")} />
        </Field>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">
              {t("c.attachments")} <span className="font-normal text-muted-foreground">({t("form.url")})</span>
            </label>
            <button
              type="button"
              onClick={() => atts.append({ url: "", kind: "IMAGE", label: "" })}
              className="flex h-7 items-center gap-1.5 rounded border border-border px-2 text-xs hover:bg-muted"
            >
              <Plus className="h-3 w-3" /> {t("form.attachment")}
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

        {!retestIssueId && (
          <p className="text-xs text-muted-foreground">{t("form.failOpensIssue")}</p>
        )}
        <FormActions onCancel={closePanel} saving={formState.isSubmitting} saveLabel={t("form.saveRecord")} />
      </form>
    </RightPanel>
  );
}
