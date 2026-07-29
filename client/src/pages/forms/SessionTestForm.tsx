import { useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { useQuery, useMutation } from "@apollo/client";
import { useTranslation } from "react-i18next";
import { Plus, Trash2 } from "lucide-react";
import { RightPanel } from "../../components/RightPanel";
import { Field, inputCls, FormActions } from "../../components/Form";
import { SuggestDatalist } from "../../components/SuggestDatalist";
import { PROJECTS } from "../../graphql/hierarchy";
import { SESSION_TESTS, SESSION_TEST, CREATE_SESSION_TEST, UPDATE_SESSION_TEST } from "../../graphql/sessiontest";
import { useNav, type PanelState } from "../../store/nav";
import { withToast } from "../../store/toast";

// datetime-local wants "YYYY-MM-DDTHH:mm" in local time.
function toLocalInput(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

interface Form {
  projectId: string;
  testedAt: string;
  kind: "SIT" | "UAT" | "OTHER";
  kindOther: string;
  minPassPercent: number;
  note: string;
  stakeholders: { value: string }[];
}

export function SessionTestForm({ panel }: { panel: PanelState }) {
  const { t } = useTranslation();
  const { closePanel } = useNav();
  const editing = panel.mode === "edit";

  const { data: projData } = useQuery(PROJECTS);
  const { data: stData } = useQuery(SESSION_TEST, { variables: { id: panel.id }, skip: !editing, fetchPolicy: "network-only" });

  const { register, handleSubmit, control, reset, watch, formState } = useForm<Form>({
    defaultValues: {
      projectId: "",
      testedAt: toLocalInput(),
      kind: "UAT",
      kindOther: "",
      minPassPercent: 100,
      note: "",
      stakeholders: [],
    },
  });
  const stakeholders = useFieldArray({ control, name: "stakeholders" });
  const kind = watch("kind");

  useEffect(() => {
    if (editing && stData?.sessionTest) {
      const s = stData.sessionTest;
      reset({
        projectId: s.projectId,
        testedAt: toLocalInput(s.testedAt),
        kind: s.kind,
        kindOther: s.kindOther ?? "",
        minPassPercent: s.minPassPercent,
        note: s.note ?? "",
        stakeholders: (s.stakeholders ?? []).map((v: string) => ({ value: v })),
      });
    }
  }, [editing, stData, reset]);

  const refetch = {
    refetchQueries: [
      { query: SESSION_TESTS, variables: { projectId: null } },
      ...(panel.id ? [{ query: SESSION_TEST, variables: { id: panel.id } }] : []),
    ],
  };
  const [createSession] = useMutation(CREATE_SESSION_TEST, refetch);
  const [updateSession] = useMutation(UPDATE_SESSION_TEST, refetch);

  const onSubmit = async (v: Form) => {
    const input = {
      projectId: v.projectId,
      testedAt: new Date(v.testedAt).toISOString(),
      kind: v.kind,
      kindOther: v.kind === "OTHER" ? v.kindOther.trim() : null,
      stakeholders: v.stakeholders.map((s) => s.value.trim()).filter(Boolean),
      minPassPercent: Number(v.minPassPercent),
      note: v.note || null,
    };
    const ok = editing
      ? await withToast(updateSession({ variables: { id: panel.id, input } }), t("t.sessionUpdated"), t("t.sessionUpdateFail"))
      : await withToast(createSession({ variables: { input } }), t("t.sessionCreated"), t("t.sessionCreateFail"));
    if (ok) closePanel();
  };

  const projects = projData?.projects ?? [];

  return (
    <RightPanel title={editing ? t("st.editSession") : t("st.newSession")} dirty={formState.isDirty} onClose={closePanel}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Field label={t("st.dateTest")} error={formState.errors.testedAt && t("c.required")}>
          <input type="datetime-local" className={inputCls} {...register("testedAt", { required: true })} />
        </Field>
        <Field label={t("st.kind")}>
          <select className={inputCls} {...register("kind")}>
            <option value="SIT">SIT</option>
            <option value="UAT">UAT</option>
            <option value="OTHER">{t("st.kindOther")}</option>
          </select>
        </Field>
        {kind === "OTHER" && (
          <Field label={t("st.kindOtherLabel")} error={formState.errors.kindOther && t("c.required")}>
            <input className={inputCls} {...register("kindOther", { required: kind === "OTHER" })} />
          </Field>
        )}
        <Field label={t("at.project")} error={formState.errors.projectId && t("c.required")}>
          <select className={inputCls} disabled={editing} {...register("projectId", { required: true })}>
            <option value="">{t("at.selectProject")}</option>
            {projects.map((p: any) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </Field>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">
              {t("st.stakeholders")} <span className="font-normal text-muted-foreground">({t("c.optional")})</span>
            </label>
            <button
              type="button"
              onClick={() => stakeholders.append({ value: "" })}
              className="flex h-7 items-center gap-1.5 rounded border border-border px-2 text-xs hover:bg-muted"
            >
              <Plus className="h-3 w-3" /> {t("st.stakeholder")}
            </button>
          </div>
          {stakeholders.fields.map((f, i) => (
            <div key={f.id} className="flex items-center gap-2">
              <input className={inputCls} list="sug-st-stakeholder" {...register(`stakeholders.${i}.value` as const)} />
              <button
                type="button"
                onClick={() => stakeholders.remove(i)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-border hover:bg-muted"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <SuggestDatalist id="sug-st-stakeholder" field="stakeholder" />
        </div>

        <Field label={t("st.minPassPercent")} error={formState.errors.minPassPercent && t("st.minPassPercentHint")}>
          <input
            type="number"
            min={0}
            max={100}
            className={inputCls}
            {...register("minPassPercent", { required: true, min: 0, max: 100, valueAsNumber: true })}
          />
          <p className="text-xs text-muted-foreground">{t("st.minPassPercentHint")}</p>
        </Field>
        <Field label={t("c.note")} optional>
          <textarea className={inputCls} rows={2} {...register("note")} />
        </Field>
        <FormActions onCancel={closePanel} saving={formState.isSubmitting} />
      </form>
    </RightPanel>
  );
}
