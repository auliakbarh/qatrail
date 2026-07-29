import { useEffect, useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { useQuery, useMutation } from "@apollo/client";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, KeyRound, ChevronLeft, ChevronRight } from "lucide-react";
import { RightPanel } from "../../components/RightPanel";
import { Field, inputCls, FormActions } from "../../components/Form";
import { SuggestDatalist } from "../../components/SuggestDatalist";
import { Modal } from "../../components/Modal";
import {
  CREATE_ISSUE,
  UPDATE_ISSUE,
  ISSUE,
  ISSUES,
  ENGINEERS,
} from "../../graphql/issue";
import { TEST_CASES } from "../../graphql/hierarchy";
import { ASSIGNED_TEST_CASES, APP_TEST } from "../../graphql/apptest";
import { SESSION_TEST, SESSION_TEST_CASES } from "../../graphql/sessiontest";
import { USER_TESTS } from "../../graphql/usertest";
import { useNav, type PanelState } from "../../store/nav";
import { withToast } from "../../store/toast";

const ATTACH_KINDS = ["IMAGE", "VIDEO", "MARKDOWN", "JSON", "DOC", "XLS", "CSV", "PDF", "OTHER"];

function toLocal(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

interface Form {
  type: string;
  title: string;
  description: string;
  environment: string;
  platform: string;
  appVersion: string;
  backendVersion: string;
  testAccount: string;
  testPassword: string;
  testedAt: string;
  preconditions: string;
  steps: string;
  actualResult: string;
  expectedResult: string;
  priority: string;
  note: string;
  isProductionIssue: boolean;
  assigneeId: string;
  attachments: { url: string; kind: string; label: string }[];
}

export function IssueForm({
  panel,
  testCaseId,
  featureId,
  appTestId,
  sessionTestId,
}: {
  panel: PanelState;
  testCaseId: string;
  featureId: string;
  appTestId?: string;
  sessionTestId?: string;
}) {
  const { t } = useTranslation();
  const { closePanel } = useNav();
  const navProjectId = useNav((s) => s.projectId);
  const editing = panel.mode === "edit";
  const init = panel.initial ?? {};
  const [pickOpen, setPickOpen] = useState(false);
  const [pickPage, setPickPage] = useState(1);
  const [pickSearch, setPickSearch] = useState("");

  const { data: engData } = useQuery(ENGINEERS);
  // Related project for the user-test picker: from the app test, else the nav drilldown.
  const { data: atProjData } = useQuery(APP_TEST, { variables: { id: appTestId }, skip: !appTestId, fetchPolicy: "cache-first" });
  const projectId = atProjData?.appTest?.projectId ?? navProjectId ?? null;
  const { data: utData } = useQuery(USER_TESTS, { variables: { projectId }, skip: !pickOpen || !projectId, fetchPolicy: "cache-and-network" });
  const { data: issueData } = useQuery(ISSUE, {
    variables: { id: panel.id },
    skip: !editing,
    fetchPolicy: "network-only",
  });

  // init may be: a FAIL-record prefill (recordTestId + testedAt), or a full
  // issue for "recreate from rejected" — in both cases prefill from init.*.
  const { register, handleSubmit, control, reset, watch, setValue, formState } = useForm<Form>({
    defaultValues: {
      type: init.type ?? "DEFECT",
      title: init.title ?? "",
      description: init.description ?? "",
      environment: init.environment ?? "STAGING",
      platform: init.platform ?? "WEB",
      appVersion: init.appVersion ?? "",
      backendVersion: init.backendVersion ?? "",
      testAccount: init.testAccount ?? "",
      testPassword: init.testPassword ?? "",
      testedAt: toLocal(init.testedAt),
      preconditions: init.preconditions ?? "",
      steps: init.steps ?? "",
      actualResult: init.actualResult ?? "",
      expectedResult: init.expectedResult ?? "",
      priority: init.priority ?? "MEDIUM",
      note: init.note ?? "",
      isProductionIssue: init.isProductionIssue ?? false,
      assigneeId: init.assignee?.id ?? "",
      attachments: (init.attachments ?? []).map((a: any) => ({ url: a.url, kind: a.kind, label: a.label ?? "" })),
    },
  });
  const atts = useFieldArray({ control, name: "attachments" });
  const platform = watch("platform");
  const environment = watch("environment");
  // Production-issue flag (SLA) — prod env only, never for app-test findings,
  // and the server freezes it once the issue is resolved.
  const canMarkProd =
    environment === "PRODUCTION" &&
    !appTestId &&
    !init.fromAppTest &&
    // Session findings are testing findings too — server forces the flag false.
    !sessionTestId &&
    !init.sessionTestId &&
    (!editing || (issueData?.issue?.canMarkProductionIssue ?? true));
  const mobileVersionRequired = platform === "IOS" || platform === "ANDROID";
  // Coming from an app-test FAIL: env/platform/versions are the app's and locked.
  const lockFields = !editing && !!init.fromAppTest;

  useEffect(() => {
    if (editing && issueData?.issue) {
      const i = issueData.issue;
      reset({
        type: i.type,
        title: i.title,
        description: i.description,
        environment: i.environment,
        platform: i.platform,
        appVersion: i.appVersion ?? "",
        backendVersion: i.backendVersion ?? "",
        testAccount: i.testAccount,
        testPassword: i.testPassword ?? "",
        testedAt: toLocal(i.testedAt),
        preconditions: i.preconditions ?? "",
        steps: i.steps,
        actualResult: i.actualResult,
        expectedResult: i.expectedResult,
        priority: i.priority,
        note: i.note ?? "",
        isProductionIssue: i.isProductionIssue,
        assigneeId: i.assignee.id,
        attachments: i.attachments.map((a: any) => ({ url: a.url, kind: a.kind, label: a.label ?? "" })),
      });
    }
  }, [editing, issueData, reset]);

  const refetch = {
    refetchQueries: [
      { query: ISSUES, variables: { testCaseId } },
      { query: TEST_CASES, variables: { featureId } },
      ...(sessionTestId
        ? [
            { query: SESSION_TEST_CASES, variables: { sessionTestId } },
            { query: SESSION_TEST, variables: { id: sessionTestId } },
          ]
        : []),
      ...(appTestId
        ? [{ query: ASSIGNED_TEST_CASES, variables: { appTestId } }, { query: APP_TEST, variables: { id: appTestId } }]
        : []),
    ],
  };
  const [createIssue] = useMutation(CREATE_ISSUE, refetch);
  const [updateIssue] = useMutation(UPDATE_ISSUE, refetch);

  const onSubmit = async (v: Form) => {
    const input: any = {
      testCaseId,
      // On recreate, never reuse the source's recordTestId (it's unique per issue).
      recordTestId: init.recreatedFromId ? null : (init.recordTestId ?? null),
      recreatedFromId: init.recreatedFromId ?? null,
      type: v.type,
      title: v.title,
      description: v.description,
      // Locked fields are disabled inputs (RHF omits them) — take from app test.
      environment: lockFields ? init.environment : v.environment,
      platform: lockFields ? init.platform : v.platform,
      appVersion: (lockFields ? init.appVersion : v.appVersion) || null,
      backendVersion: (lockFields ? init.backendVersion : v.backendVersion) || null,
      testAccount: v.testAccount,
      testPassword: v.testPassword || null,
      testedAt: new Date(v.testedAt).toISOString(),
      preconditions: v.preconditions || null,
      steps: v.steps,
      actualResult: v.actualResult,
      expectedResult: v.expectedResult,
      priority: v.priority,
      note: v.note || null,
      isProductionIssue: canMarkProd && v.isProductionIssue,
      assigneeId: v.assigneeId,
      appTestId: appTestId ?? null,
      sessionTestId: sessionTestId ?? init.sessionTestId ?? null,
      attachments: v.attachments
        .filter((a) => a.url.trim())
        .map((a) => ({ url: a.url, kind: a.kind, label: a.label || null })),
    };
    let ok;
    if (editing) {
      delete input.testCaseId;
      delete input.recordTestId;
      ok = await withToast(updateIssue({ variables: { id: panel.id, input: { ...input, testCaseId } } }), t("t.issueUpdated"), t("t.issueUpdateFail"));
    } else {
      ok = await withToast(createIssue({ variables: { input } }), t("t.issueCreated"), t("t.issueCreateFail"));
    }
    if (ok) closePanel();
  };

  const engineers = engData?.engineers ?? [];

  return (
    <RightPanel title={editing ? t("form.editIssue") : t("tc.addIssue")} dirty={formState.isDirty} onClose={closePanel}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="flex gap-2">
          <Field label={t("c.type")}>
            <select className={inputCls} {...register("type")}>
              <option value="DEFECT">DEFECT</option>
              <option value="BUG">BUG</option>
            </select>
          </Field>
          <Field label={t("c.priority")}>
            <select className={inputCls} {...register("priority")}>
              <option value="LOW">LOW</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="HIGH">HIGH</option>
            </select>
          </Field>
        </div>
        <Field label={t("form.titleField")} error={formState.errors.title && t("c.required")}>
          <input className={inputCls} {...register("title", { required: true })} />
        </Field>
        <Field label={t("c.description")} error={formState.errors.description && t("c.required")}>
          <textarea className={inputCls} rows={2} {...register("description", { required: true })} />
        </Field>
        <div className="flex gap-2">
          <Field label={t("iss.environment")}>
            <select className={inputCls} disabled={lockFields} {...register("environment")}>
              <option value="STAGING">STAGING</option>
              <option value="PRODUCTION">PRODUCTION</option>
            </select>
          </Field>
          <Field label={t("iss.platform")}>
            <select className={inputCls} disabled={lockFields} {...register("platform")}>
              <option value="WEB">WEB</option>
              <option value="ANDROID">ANDROID</option>
              <option value="IOS">IOS</option>
            </select>
          </Field>
        </div>
        {canMarkProd && (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 cursor-pointer" {...register("isProductionIssue")} />
            <span>
              {t("iss.isProductionIssue")}
              <span className="block text-xs text-muted-foreground">{t("iss.isProductionIssueHint")}</span>
            </span>
          </label>
        )}
        <div className="flex gap-2">
          <Field label={t("form.appVersion")} optional={!mobileVersionRequired} error={formState.errors.appVersion && t("form.requiredMobile")}>
            <input
              className={inputCls}
              disabled={lockFields}
              list="sug-appVersion"
              {...register("appVersion", { validate: (v) => lockFields || !mobileVersionRequired || !!v.trim() })}
            />
            <SuggestDatalist id="sug-appVersion" field="appVersion" />
          </Field>
          <Field label={t("form.backendVersion")} optional>
            <input className={inputCls} disabled={lockFields} list="sug-backendVersion" {...register("backendVersion")} />
            <SuggestDatalist id="sug-backendVersion" field="backendVersion" />
          </Field>
        </div>
        <div className="flex gap-2">
          <Field label={t("iss.testAccount")} error={formState.errors.testAccount && t("c.required")}>
            <input className={inputCls} list="sug-testAccount" {...register("testAccount", { required: true })} />
            <SuggestDatalist id="sug-testAccount" field="testAccount" />
          </Field>
          <Field label={t("form.testPassword")} optional>
            <input className={inputCls} {...register("testPassword")} />
          </Field>
        </div>
        {projectId && (
          <button
            type="button"
            onClick={() => { setPickPage(1); setPickSearch(""); setPickOpen(true); }}
            className="flex h-7 items-center gap-1.5 rounded border border-border px-2 text-xs hover:bg-muted"
          >
            <KeyRound className="h-3 w-3" /> {t("ut.pick")}
          </button>
        )}
        <Field label={t("iss.testedAt")}>
          <input type="datetime-local" className={inputCls} {...register("testedAt", { required: true })} />
        </Field>
        <Field label={t("iss.preconditions")} optional>
          <textarea className={inputCls} rows={2} {...register("preconditions")} />
        </Field>
        <Field label={t("iss.steps")} error={formState.errors.steps && t("c.required")}>
          <textarea className={inputCls} rows={3} {...register("steps", { required: true })} />
        </Field>
        <Field label={t("iss.actualResult")} error={formState.errors.actualResult && t("c.required")}>
          <textarea className={inputCls} rows={2} {...register("actualResult", { required: true })} />
        </Field>
        <Field label={t("iss.expectedResult")} error={formState.errors.expectedResult && t("c.required")}>
          <textarea className={inputCls} rows={2} {...register("expectedResult", { required: true })} />
        </Field>
        <Field label={t("form.assigneeEngineer")} error={formState.errors.assigneeId && t("c.required")}>
          <select className={inputCls} {...register("assigneeId", { required: true })}>
            <option value="">{t("form.selectEngineer")}</option>
            {engineers.map((e: any) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
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

        <Field label={t("form.noteSummary")} optional>
          <textarea className={inputCls} rows={2} {...register("note")} />
        </Field>
        <FormActions onCancel={closePanel} saving={formState.isSubmitting} />
      </form>

      <Modal open={pickOpen} onClose={() => setPickOpen(false)} title={t("ut.pickTitle")}>
        {(() => {
          const q = pickSearch.trim().toLowerCase();
          const items: any[] = (utData?.userTests ?? []).filter(
            (u: any) => !q || `${u.account} ${u.note ?? ""} ${u.environment}`.toLowerCase().includes(q),
          );
          const PICK_SIZE = 6;
          const pages = Math.max(1, Math.ceil(items.length / PICK_SIZE));
          const page = Math.min(pickPage, pages);
          const pageItems = items.slice((page - 1) * PICK_SIZE, page * PICK_SIZE);
          return (
            <div className="flex h-96 w-[36rem] max-w-full flex-col">
              <input
                value={pickSearch}
                onChange={(e) => { setPickSearch(e.target.value); setPickPage(1); }}
                placeholder={t("c.search")}
                className="mb-2 h-8 w-full rounded border border-border bg-background px-3 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <div className="flex-1 overflow-y-auto">
                {items.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("ut.pickEmpty")}</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs text-muted-foreground">
                        <th className="px-2 py-1.5">{t("ut.account")}</th>
                        <th className="px-2 py-1.5">{t("ut.password")}</th>
                        <th className="px-2 py-1.5">{t("iss.environment")}</th>
                        <th className="px-2 py-1.5">{t("c.note")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageItems.map((u: any) => (
                        <tr
                          key={u.id}
                          className="cursor-pointer border-b border-border/50 last:border-0 hover:bg-muted/40"
                          onClick={() => {
                            setValue("testAccount", u.account, { shouldDirty: true });
                            setValue("testPassword", u.password ?? "", { shouldDirty: true });
                            setPickOpen(false);
                          }}
                        >
                          <td className="px-2 py-1.5">{u.account}</td>
                          <td className="px-2 py-1.5 font-mono text-xs text-muted-foreground">{u.password || "—"}</td>
                          <td className="px-2 py-1.5 text-muted-foreground">{u.environment}</td>
                          <td className="px-2 py-1.5 text-xs text-muted-foreground">{u.note || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              {items.length > 0 && (
                <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
                  <span className="text-xs text-muted-foreground">{t("page.of", { total: items.length, page, totalPages: pages })}</span>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => setPickPage(Math.max(1, page - 1))} disabled={page <= 1}
                      className="flex h-7 w-7 items-center justify-center rounded border border-border hover:bg-muted disabled:opacity-40">
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => setPickPage(Math.min(pages, page + 1))} disabled={page >= pages}
                      className="flex h-7 w-7 items-center justify-center rounded border border-border hover:bg-muted disabled:opacity-40">
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </Modal>
    </RightPanel>
  );
}
