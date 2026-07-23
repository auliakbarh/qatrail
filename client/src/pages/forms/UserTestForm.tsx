import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useQuery, useMutation } from "@apollo/client";
import { useTranslation } from "react-i18next";
import { RightPanel } from "../../components/RightPanel";
import { Field, inputCls, FormActions } from "../../components/Form";
import { PROJECTS } from "../../graphql/hierarchy";
import { USER_TESTS, USER_TEST, CREATE_USER_TEST, UPDATE_USER_TEST } from "../../graphql/usertest";
import { useNav, type PanelState } from "../../store/nav";
import { withToast } from "../../store/toast";

interface Form {
  projectId: string;
  account: string;
  password: string;
  environment: string;
  note: string;
}

export function UserTestForm({ panel }: { panel: PanelState }) {
  const { t } = useTranslation();
  const { closePanel } = useNav();
  const editing = panel.mode === "edit";
  const init = panel.initial ?? {};

  const { data: projData } = useQuery(PROJECTS);
  const { data: utData } = useQuery(USER_TEST, { variables: { id: panel.id }, skip: !editing, fetchPolicy: "network-only" });

  const { register, handleSubmit, reset, formState } = useForm<Form>({
    defaultValues: {
      projectId: init.projectId ?? "",
      account: init.account ?? "",
      password: init.password ?? "",
      environment: init.environment ?? "STAGING",
      note: init.note ?? "",
    },
  });

  useEffect(() => {
    if (editing && utData?.userTest) {
      const u = utData.userTest;
      reset({
        projectId: u.projectId,
        account: u.account,
        password: u.password ?? "",
        environment: u.environment,
        note: u.note ?? "",
      });
    }
  }, [editing, utData, reset]);

  const [createUserTest] = useMutation(CREATE_USER_TEST, { refetchQueries: [{ query: USER_TESTS, variables: { projectId: null } }] });
  const [updateUserTest] = useMutation(UPDATE_USER_TEST, {
    refetchQueries: [{ query: USER_TESTS, variables: { projectId: null } }, ...(panel.id ? [{ query: USER_TEST, variables: { id: panel.id } }] : [])],
  });

  const onSubmit = async (v: Form) => {
    const input = {
      projectId: v.projectId,
      account: v.account,
      password: v.password || null,
      environment: v.environment,
      note: v.note || null,
    };
    const ok = editing
      ? await withToast(updateUserTest({ variables: { id: panel.id, input } }), t("t.userTestUpdated"), t("t.userTestUpdateFail"))
      : await withToast(createUserTest({ variables: { input } }), t("t.userTestCreated"), t("t.userTestCreateFail"));
    if (ok) closePanel();
  };

  const projects = projData?.projects ?? [];

  return (
    <RightPanel title={editing ? t("ut.editItem") : t("ut.newItem")} dirty={formState.isDirty} onClose={closePanel}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Field label={t("ut.account")} error={formState.errors.account && t("c.required")}>
          <input className={inputCls} {...register("account", { required: true })} />
        </Field>
        <Field label={t("ut.password")} optional>
          <input className={inputCls} {...register("password")} />
        </Field>
        <Field label={t("ut.project")} error={formState.errors.projectId && t("c.required")}>
          <select className={inputCls} disabled={editing} {...register("projectId", { required: true })}>
            <option value="">{t("at.selectProject")}</option>
            {projects.map((p: any) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </Field>
        <Field label={t("iss.environment")}>
          <select className={inputCls} {...register("environment")}>
            <option value="STAGING">STAGING</option>
            <option value="PRODUCTION">PRODUCTION</option>
          </select>
        </Field>
        <Field label={t("c.note")} optional>
          <textarea className={inputCls} rows={2} {...register("note")} />
        </Field>
        <FormActions onCancel={closePanel} saving={formState.isSubmitting} />
      </form>
    </RightPanel>
  );
}
