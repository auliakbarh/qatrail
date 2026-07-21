import { useState } from "react";
import { useQuery, useMutation } from "@apollo/client";
import { useTranslation, Trans } from "react-i18next";
import { Plus, Trash2, KeyRound } from "lucide-react";
import { CHANGE_PASSWORD } from "../graphql";
import {
  USERS, CREATE_USER, UPDATE_USER, DELETE_USER, RESET_USER_PASSWORD,
  SETTING, UPDATE_SETTING, TEST_DISCORD, SLA_TARGETS, UPDATE_SLA_TARGET,
} from "../graphql/admin";
import { useAuth } from "../store/auth";
import { cn } from "../lib/utils";
import { inputCls, Field } from "../components/Form";
import { IconBtn } from "../components/IconBtn";
import { DeleteConfirm } from "../components/DeleteConfirm";
import { PasswordInput } from "../components/PasswordInput";
import { copyWithToast, withToast } from "../store/toast";
import { unmetPasswordRules } from "../lib/passwordPolicy";

const ROLES = ["QA", "ENGINEER", "ADMIN", "SUPER_ADMIN"];

export default function Settings() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
  const tabs = ["password", ...(isAdmin ? ["users", "maintenance", "sla", "discord"] : [])];
  const [tab, setTab] = useState("password");
  const tabLabels: Record<string, string> = {
    password: t("set.tabPassword"),
    users: t("set.tabUsers"),
    maintenance: t("set.tabMaintenance"),
    sla: t("set.tabSla"),
    discord: t("set.tabDiscord"),
  };

  return (
    <div className="h-full space-y-4 overflow-y-auto p-6">
      <div className="inline-flex gap-0.5 rounded bg-muted p-1">
        {tabs.map((tk) => (
          <button
            key={tk}
            onClick={() => setTab(tk)}
            className={cn(
              "rounded px-3 py-1.5 text-xs font-medium capitalize",
              tab === tk ? "bg-background text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tabLabels[tk]}
          </button>
        ))}
      </div>
      {tab === "password" && <ChangePasswordCard />}
      {tab === "users" && isAdmin && <UsersCard />}
      {tab === "maintenance" && isAdmin && <SettingCard kind="maintenance" />}
      {tab === "discord" && isAdmin && <SettingCard kind="discord" />}
      {tab === "sla" && isAdmin && <SlaCard />}
    </div>
  );
}

function Card({ title, action, children }: { title: string; action?: any; children: any }) {
  return (
    <div className="rounded border border-border">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

function ChangePasswordCard() {
  const { t } = useTranslation();
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [changePassword, { loading }] = useMutation(CHANGE_PASSWORD);
  const unmet = unmetPasswordRules(next);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      await changePassword({ variables: { currentPassword: cur, newPassword: next } });
      setMsg({ ok: true, text: t("pw.changed") });
      setCur("");
      setNext("");
    } catch {
      setMsg({ ok: false, text: t("pw.changeFail") });
    }
  };

  return (
    <Card title={t("pw.change")}>
      <form onSubmit={submit} className="max-w-sm space-y-4">
        <Field label={t("pw.current")}>
          <PasswordInput value={cur} onChange={(e) => setCur(e.target.value)} />
        </Field>
        <Field label={t("pw.new")}>
          <PasswordInput value={next} onChange={(e) => setNext(e.target.value)} />
          {next && unmet.length > 0 && (
            <p className="text-xs text-destructive">{t("c.missing", { list: unmet.map((r) => t(`pw.${r}`)).join(", ") })}</p>
          )}
        </Field>
        {msg && <p className={cn("text-xs", msg.ok ? "text-green-600" : "text-destructive")}>{msg.text}</p>}
        <button
          type="submit"
          disabled={loading || unmet.length > 0 || !cur}
          className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? t("c.saving") : t("pw.change")}
        </button>
      </form>
    </Card>
  );
}

function UsersCard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data } = useQuery(USERS);
  const [createUser] = useMutation(CREATE_USER, { refetchQueries: [USERS] });
  const [updateUser] = useMutation(UPDATE_USER, { refetchQueries: [USERS] });
  const [deleteUser] = useMutation(DELETE_USER, { refetchQueries: [USERS] });
  const [resetPw] = useMutation(RESET_USER_PASSWORD);
  const [form, setForm] = useState<{ id?: string; email: string; name: string; role: string; active: boolean } | null>(null);
  const [del, setDel] = useState<{ id: string; name: string } | null>(null);
  const [generated, setGenerated] = useState<string | null>(null);

  const roleOptions = user?.role === "SUPER_ADMIN" ? ROLES : ROLES.filter((r) => r !== "SUPER_ADMIN");

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    const input = { email: form.email, name: form.name, role: form.role, active: form.active };
    if (form.id) {
      const ok = await withToast(updateUser({ variables: { id: form.id, input } }), t("t.userUpdated"), t("t.userUpdateFail"));
      if (ok) setForm(null);
    } else {
      const res = await withToast(createUser({ variables: { input } }), t("t.userCreated"), t("t.userCreateFail"));
      if (!res) return;
      const pw = res.data?.createUser?.defaultPassword ?? null;
      setGenerated(pw);
      if (pw) await copyWithToast(pw, t("set.defaultPwLabel"));
      setForm(null);
    }
  };

  return (
    <div className="flex gap-4">
      <div className="flex-1">
        <Card
          title={t("set.users")}
          action={
            <button
              onClick={() => setForm({ email: "", name: "", role: "QA", active: true })}
              className="flex h-7 items-center gap-1.5 rounded bg-black px-3 text-xs font-medium text-white hover:bg-black/80"
            >
              <Plus className="h-3.5 w-3.5" /> {t("set.addUser")}
            </button>
          }
        >
          {generated && (
            <div className="mb-3 rounded border border-border bg-muted p-3 text-xs">
              <Trans i18nKey="set.userCreatedBanner" values={{ pw: generated }} components={{ b: <b className="font-mono" /> }} />
              <button onClick={() => setGenerated(null)} className="ml-2 underline">{t("set.dismiss")}</button>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="w-8 px-3 py-2 text-left text-xs font-medium text-muted-foreground">#</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("c.name")}</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("c.email")}</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("c.role")}</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("c.status")}</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {(data?.users ?? []).map((u: any, idx: number) => (
                  <tr key={u.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30">
                    <td className="px-3 py-2 text-xs tabular-nums text-muted-foreground">{idx + 1}</td>
                    <td className="px-3 py-2 font-medium">{u.name}</td>
                    <td className="px-3 py-2 font-mono text-xs">{u.email}</td>
                    <td className="px-3 py-2"><span className="rounded bg-muted px-1.5 py-0.5 text-xs">{u.role}</span></td>
                    <td className="px-3 py-2 text-xs">{u.active ? t("set.active") : t("set.inactive")}</td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        <IconBtn title={t("set.resetPw")} onClick={async () => {
                          const r = await withToast(resetPw({ variables: { id: u.id } }), t("t.pwReset"), t("t.pwResetFail"));
                          if (!r) return;
                          const pw = r.data?.resetUserPassword ?? null;
                          setGenerated(pw);
                          if (pw) await copyWithToast(pw, t("set.newPwLabel"));
                        }}>
                          <KeyRound className="h-3.5 w-3.5" />
                        </IconBtn>
                        <IconBtn title={t("c.edit")} onClick={() => setForm({ id: u.id, email: u.email, name: u.name, role: u.role, active: u.active })}>
                          <span className="text-xs">✎</span>
                        </IconBtn>
                        <IconBtn title={t("c.delete")} onClick={() => setDel({ id: u.id, name: u.name })}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </IconBtn>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {form && (
        <div className="w-80 shrink-0">
          <Card title={form.id ? t("set.editUser") : t("set.addUser")}>
            <form onSubmit={save} className="space-y-4">
              <Field label={t("c.name")}><input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
              <Field label={t("c.email")}><input type="email" className={inputCls} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></Field>
              <Field label={t("c.role")}>
                <select className={inputCls} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  {roleOptions.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> {t("set.active")}
              </label>
              {!form.id && <p className="text-xs text-muted-foreground">{t("set.defaultPwNote")}</p>}
              <div className="flex gap-2">
                <button type="submit" className="flex-1 rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">{t("c.save")}</button>
                <button type="button" onClick={() => setForm(null)} className="flex-1 rounded border border-border px-4 py-2 text-sm hover:bg-muted">{t("c.cancel")}</button>
              </div>
            </form>
          </Card>
        </div>
      )}

      <DeleteConfirm
        open={!!del}
        onClose={() => setDel(null)}
        onConfirm={() => del && withToast(deleteUser({ variables: { id: del.id } }), t("t.userDeleted"), t("t.userDeleteFail"))}
        label={del?.name ?? ""}
      />
    </div>
  );
}

function SettingCard({ kind }: { kind: "maintenance" | "discord" }) {
  const { t } = useTranslation();
  const { data } = useQuery(SETTING);
  const [updateSetting, { loading }] = useMutation(UPDATE_SETTING, { refetchQueries: [SETTING] });
  const [testDiscord] = useMutation(TEST_DISCORD);
  const s = data?.setting;
  const [local, setLocal] = useState<any>(null);
  const v = local ?? s ?? {};
  const set = (patch: any) => setLocal({ ...v, ...patch });
  const [testMsg, setTestMsg] = useState<string | null>(null);

  const save = async () => {
    const input =
      kind === "maintenance"
        ? { maintenanceMode: !!v.maintenanceMode, maintenanceMessage: v.maintenanceMessage || null }
        : { discordEnabled: !!v.discordEnabled, discordWebhookUrl: v.discordWebhookUrl || null };
    const ok = await withToast(updateSetting({ variables: { input } }), t("t.settingsSaved"), t("t.settingsSaveFail"));
    if (ok) setLocal(null);
  };

  if (kind === "maintenance") {
    return (
      <Card title={t("set.maintenance")}>
        <div className="max-w-md space-y-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!v.maintenanceMode} onChange={(e) => set({ maintenanceMode: e.target.checked })} />
            {t("set.maintMode")}
          </label>
          <Field label={t("set.message")} optional>
            <textarea className={inputCls} rows={2} value={v.maintenanceMessage ?? ""} onChange={(e) => set({ maintenanceMessage: e.target.value })} />
          </Field>
          <button onClick={save} disabled={loading} className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">{t("c.save")}</button>
        </div>
      </Card>
    );
  }
  return (
    <Card title={t("set.discordTitle")}>
      <div className="max-w-lg space-y-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!v.discordEnabled} onChange={(e) => set({ discordEnabled: e.target.checked })} /> {t("set.enabled")}
        </label>
        <Field label={t("set.webhookUrl")}>
          <input className={inputCls} placeholder="https://discord.com/api/webhooks/…" value={v.discordWebhookUrl ?? ""} onChange={(e) => set({ discordWebhookUrl: e.target.value })} />
        </Field>
        <p className="text-xs text-muted-foreground">{t("set.discordHelp")}</p>
        {testMsg && <p className="text-xs">{testMsg}</p>}
        <div className="flex gap-2">
          <button onClick={save} disabled={loading} className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">{t("c.save")}</button>
          <button
            onClick={async () => {
              setTestMsg(t("set.sending"));
              const r = await testDiscord({ variables: { url: v.discordWebhookUrl } });
              setTestMsg(r.data?.testDiscord ? t("set.testSent") : t("set.testFailed"));
            }}
            disabled={!v.discordWebhookUrl}
            className="rounded border border-border px-4 py-2 text-sm hover:bg-muted disabled:opacity-50"
          >
            {t("set.testSend")}
          </button>
        </div>
      </div>
    </Card>
  );
}

function SlaCard() {
  const { t } = useTranslation();
  const { data } = useQuery(SLA_TARGETS);
  const [update, { loading }] = useMutation(UPDATE_SLA_TARGET, { refetchQueries: [SLA_TARGETS] });
  const [edits, setEdits] = useState<Record<string, { respondMins: string; resolveMins: string }>>({});

  const ORDER = { HIGH: 0, MEDIUM: 1, LOW: 2 } as Record<string, number>;
  const rows = [...(data?.slaTargets ?? [])].sort((a: any, b: any) => (ORDER[a.priority] ?? 9) - (ORDER[b.priority] ?? 9));
  const val = (p: string, field: "respondMins" | "resolveMins", fallback: any) =>
    edits[p]?.[field] ?? (fallback == null ? "" : String(fallback));

  return (
    <Card title={t("set.slaTitle")}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("c.priority")}</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("set.respondMin")}</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("set.resolveMin")}</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row: any) => (
              <tr key={row.priority} className="border-b border-border/50 last:border-0">
                <td className="px-3 py-2 font-medium">{row.priority}</td>
                <td className="px-3 py-2">
                  <input className={`${inputCls} w-24`} placeholder={t("set.none")} value={val(row.priority, "respondMins", row.respondMins)}
                    onChange={(e) => setEdits({ ...edits, [row.priority]: { respondMins: e.target.value, resolveMins: val(row.priority, "resolveMins", row.resolveMins) } })} />
                </td>
                <td className="px-3 py-2">
                  <input className={`${inputCls} w-24`} value={val(row.priority, "resolveMins", row.resolveMins)}
                    onChange={(e) => setEdits({ ...edits, [row.priority]: { respondMins: val(row.priority, "respondMins", row.respondMins), resolveMins: e.target.value } })} />
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    disabled={loading}
                    onClick={() => {
                      const respond = val(row.priority, "respondMins", row.respondMins).trim();
                      const resolve = val(row.priority, "resolveMins", row.resolveMins).trim();
                      withToast(
                        update({ variables: { priority: row.priority, respondMins: respond === "" ? null : parseInt(respond, 10), resolveMins: parseInt(resolve, 10) } }),
                        t("t.slaSaved", { priority: row.priority }),
                        t("t.slaSaveFail"),
                      );
                    }}
                    className="h-7 rounded border border-border px-3 text-xs hover:bg-muted"
                  >
                    {t("c.save")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
