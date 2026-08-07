import { useState } from "react";
import { useQuery, useMutation } from "@apollo/client";
import { useTranslation, Trans } from "react-i18next";
import { Plus, Trash2, KeyRound } from "lucide-react";
import { CHANGE_PASSWORD, HEALTH } from "../graphql";
import {
  USERS, CREATE_USER, UPDATE_USER, DELETE_USER, RESET_USER_PASSWORD,
  SETTING, UPDATE_SETTING, TEST_DISCORD, TEST_JIRA, SLA_TARGETS, UPDATE_SLA_TARGET, AUDIT_LOGS,
  PUBLIC_API_CLIENTS, CREATE_PUBLIC_API_CLIENT, UPDATE_PUBLIC_API_CLIENT, REVOKE_PUBLIC_API_CLIENT,
} from "../graphql/admin";
import { useAuth } from "../store/auth";
import { cn, fmtDateTime } from "../lib/utils";
import { inputCls, Field } from "../components/Form";
import { IconBtn } from "../components/IconBtn";
import { DeleteConfirm } from "../components/DeleteConfirm";
import { PasswordInput } from "../components/PasswordInput";
import { copyWithToast, withToast } from "../store/toast";
import { unmetPasswordRules } from "../lib/passwordPolicy";

const ROLES = ["QA", "QA_LEAD", "ENGINEER", "VIEWER", "ADMIN", "SUPER_ADMIN"];

export default function Settings() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const tabs = [
    "password",
    ...(isAdmin ? ["users", "approval", "maintenance", "sla", "discord", "jira", "sso", "audit"] : []),
    // Public API keys read across every project, so they stay super-admin only.
    ...(isSuperAdmin ? ["apiKeys"] : []),
  ];
  const [tab, setTab] = useState("password");
  const tabLabels: Record<string, string> = {
    password: t("set.tabPassword"),
    users: t("set.tabUsers"),
    approval: t("set.tabApproval"),
    maintenance: t("set.tabMaintenance"),
    sla: t("set.tabSla"),
    discord: t("set.tabDiscord"),
    jira: t("set.tabJira"),
    sso: t("set.tabSso"),
    audit: t("set.tabAudit"),
    apiKeys: t("set.tabApiKeys"),
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
      {tab === "approval" && isAdmin && <ApprovalSettingCard />}
      {tab === "maintenance" && isAdmin && <SettingCard kind="maintenance" />}
      {tab === "discord" && isAdmin && <SettingCard kind="discord" />}
      {tab === "jira" && isAdmin && <JiraCard />}
      {tab === "sso" && isAdmin && <SsoCard />}
      {tab === "sla" && isAdmin && <SlaCard />}
      {tab === "audit" && isAdmin && <AuditCard />}
      {tab === "apiKeys" && isSuperAdmin && <PublicApiCard />}
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

// Hours are what the server stores; the picker offers days as a convenience
// because "3 days" is how people actually say it.
function HoursField({
  label,
  help,
  hours,
  onChange,
}: {
  label: string;
  help: string;
  hours: number | null;
  onChange: (h: number | null) => void;
}) {
  const { t } = useTranslation();
  // null = never; 0 = immediate; otherwise show days when it divides evenly.
  const mode = hours == null ? "NEVER" : hours === 0 ? "NOW" : "AFTER";
  const asDays = hours != null && hours > 0 && hours % 24 === 0;
  const [unit, setUnit] = useState<"h" | "d">(asDays ? "d" : "h");
  const amount = hours == null || hours === 0 ? "" : String(unit === "d" ? hours / 24 : hours);

  return (
    <Field label={label}>
      <div className="flex flex-wrap items-center gap-2">
        <select
          className={`${inputCls} w-auto`}
          value={mode}
          onChange={(e) => onChange(e.target.value === "NEVER" ? null : e.target.value === "NOW" ? 0 : 24)}
        >
          <option value="NEVER">{t("set.autoNever")}</option>
          <option value="NOW">{t("set.autoNow")}</option>
          <option value="AFTER">{t("set.autoAfter")}</option>
        </select>
        {mode === "AFTER" && (
          <>
            <input
              type="number"
              min={1}
              className={`${inputCls} w-20`}
              value={amount}
              onChange={(e) => {
                const n = Math.max(1, Number(e.target.value) || 1);
                onChange(unit === "d" ? n * 24 : n);
              }}
            />
            <select
              className={`${inputCls} w-auto`}
              value={unit}
              onChange={(e) => {
                const u = e.target.value as "h" | "d";
                const n = Number(amount) || 1;
                setUnit(u);
                onChange(u === "d" ? n * 24 : n);
              }}
            >
              <option value="h">{t("set.unitHours")}</option>
              <option value="d">{t("set.unitDays")}</option>
            </select>
          </>
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{help}</p>
    </Field>
  );
}

function ApprovalSettingCard() {
  const { t } = useTranslation();
  const { data } = useQuery(SETTING);
  const [updateSetting, { loading }] = useMutation(UPDATE_SETTING, { refetchQueries: [SETTING] });
  const s = data?.setting;
  const [local, setLocal] = useState<any>(null);
  const v = local ?? s ?? {};
  const set = (patch: any) => setLocal({ ...v, ...patch });

  const save = async () => {
    const ok = await withToast(
      updateSetting({
        variables: {
          input: {
            autoApproveNewHours: v.autoApproveNewHours ?? null,
            autoApproveChangeHours: v.autoApproveChangeHours ?? null,
          },
        },
      }),
      t("t.settingsSaved"),
      t("t.settingsSaveFail"),
    );
    if (ok) setLocal(null);
  };

  return (
    <Card title={t("set.approvalTitle")}>
      <div className="max-w-lg space-y-4">
        <p className="text-xs text-muted-foreground">{t("set.approvalHelp")}</p>
        <HoursField
          label={t("set.autoNewLabel")}
          help={t("set.autoNewHelp")}
          hours={v.autoApproveNewHours ?? null}
          onChange={(h) => set({ autoApproveNewHours: h })}
        />
        <HoursField
          label={t("set.autoChangeLabel")}
          help={t("set.autoChangeHelp")}
          hours={v.autoApproveChangeHours ?? null}
          onChange={(h) => set({ autoApproveChangeHours: h })}
        />
        <button
          onClick={save}
          disabled={loading}
          className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {t("c.save")}
        </button>
      </div>
    </Card>
  );
}

// Whether Microsoft SSO is on at all is an env decision (MS_SSO_ENABLED, read
// from health); the only thing an admin picks here is what happens to a tenant
// user who has no account yet.
function SsoCard() {
  const { t } = useTranslation();
  const { data: healthData } = useQuery(HEALTH, { fetchPolicy: "cache-first" });
  const { data } = useQuery(SETTING);
  const [updateSetting, { loading }] = useMutation(UPDATE_SETTING, { refetchQueries: [SETTING] });
  const s = data?.setting;
  const [local, setLocal] = useState<boolean | null>(null);
  const autoProvision = local ?? !!s?.ssoAutoProvision;

  const save = async () => {
    const ok = await withToast(
      updateSetting({ variables: { input: { ssoAutoProvision: autoProvision } } }),
      t("t.settingsSaved"),
      t("t.settingsSaveFail"),
    );
    if (ok) setLocal(null);
  };

  return (
    <Card title={t("set.ssoTitle")}>
      <div className="max-w-lg space-y-4">
        <p className="text-xs text-muted-foreground">
          {healthData?.health?.ssoEnabled ? t("set.ssoOn") : t("set.ssoOff")}
        </p>
        <Field label={t("set.ssoUnknownUser")}>
          <select className={inputCls} value={autoProvision ? "viewer" : "deny"} onChange={(e) => setLocal(e.target.value === "viewer")}>
            <option value="deny">{t("set.ssoDeny")}</option>
            <option value="viewer">{t("set.ssoViewer")}</option>
          </select>
        </Field>
        <p className="text-xs text-muted-foreground">{autoProvision ? t("set.ssoViewerHelp") : t("set.ssoDenyHelp")}</p>
        <button onClick={save} disabled={loading} className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {t("c.save")}
        </button>
      </div>
    </Card>
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

// JIRA has no editable setting — credentials live in server/.env — so this card
// is purely a connectivity check: who the token authenticates as, and (with a
// ticket key) whether a comment actually lands.
function JiraCard() {
  const { t } = useTranslation();
  const { data: healthData } = useQuery(HEALTH, { fetchPolicy: "cache-first" });
  const [testJira, { loading }] = useMutation(TEST_JIRA);
  const [jiraKey, setJiraKey] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const configured = healthData?.health?.jiraConfigured;

  const run = async (withKey: boolean) => {
    setResult(null);
    try {
      const r = await testJira({ variables: { jiraKey: withKey ? jiraKey.trim() : null } });
      setResult(r.data?.testJira ?? null);
    } catch (e: any) {
      setResult({ ok: false, message: e?.message ?? String(e) });
    }
  };

  return (
    <Card title={t("set.jiraTitle")}>
      <div className="max-w-lg space-y-4">
        <Field label={t("set.jiraServer")}>
          <input className={inputCls} value={healthData?.health?.jiraBaseUrl ?? t("set.jiraNoServer")} readOnly disabled />
        </Field>
        {!configured && <p className="text-xs text-muted-foreground">{t("set.jiraNotConfigured")}</p>}
        <Field label={t("set.jiraTicketKey")} optional>
          <input
            className={inputCls}
            placeholder="e.g. CAI-652"
            value={jiraKey}
            onChange={(e) => setJiraKey(e.target.value)}
          />
        </Field>
        <p className="text-xs text-muted-foreground">{t("set.jiraHelp")}</p>
        {loading && <p className="text-xs">{t("set.sending")}</p>}
        {result && !loading && (
          <p className={cn("text-xs", result.ok ? "text-green-600" : "text-destructive")}>
            {result.ok ? "✅ " : "❌ "}
            {result.message}
          </p>
        )}
        <div className="flex gap-2">
          <button
            onClick={() => run(false)}
            disabled={!configured || loading}
            className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {t("set.jiraTestConn")}
          </button>
          <button
            onClick={() => run(true)}
            disabled={!configured || loading || !jiraKey.trim()}
            className="rounded border border-border px-4 py-2 text-sm hover:bg-muted disabled:opacity-50"
          >
            {t("set.jiraTestComment")}
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

// Public API clients (server/src/publicApi, docs/API_PUBLIC.md). The raw key
// exists only in the mutation response — it is never stored, so it is shown
// once and copied from here.
function PublicApiCard() {
  const { t } = useTranslation();
  const { data } = useQuery(PUBLIC_API_CLIENTS, { fetchPolicy: "cache-and-network" });
  const [createClient] = useMutation(CREATE_PUBLIC_API_CLIENT, { refetchQueries: [PUBLIC_API_CLIENTS] });
  const [updateClient] = useMutation(UPDATE_PUBLIC_API_CLIENT, { refetchQueries: [PUBLIC_API_CLIENTS] });
  const [revokeClient] = useMutation(REVOKE_PUBLIC_API_CLIENT, { refetchQueries: [PUBLIC_API_CLIENTS] });
  const [form, setForm] = useState<{ appId: string; name: string; origins: string; ips: string } | null>(null);
  const [issued, setIssued] = useState<string | null>(null);
  const [del, setDel] = useState<{ id: string; appId: string } | null>(null);
  const rows = data?.publicApiClients ?? [];

  const list = (v: string) => v.split(",").map((x) => x.trim()).filter(Boolean);

  const submit = async () => {
    if (!form) return;
    const res = await withToast(
      createClient({
        variables: { input: { appId: form.appId, name: form.name, allowedOrigins: list(form.origins), allowedIps: list(form.ips) } },
      }),
      t("api.created"),
      t("api.createFail"),
    );
    if (!res) return;
    const key = res.data?.createPublicApiClient?.key ?? null;
    setIssued(key);
    setForm(null);
    if (key) await copyWithToast(key, t("set.tabApiKeys"));
  };

  return (
    <div className="space-y-4">
      <Card
        title={t("set.tabApiKeys")}
        action={
          <IconBtn title={t("api.add")} onClick={() => setForm({ appId: "", name: "", origins: "", ips: "" })}>
            <Plus className="size-4" />
          </IconBtn>
        }
      >
        <p className="px-3 pb-2 text-xs text-muted-foreground">{t("api.intro")}</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("api.appId")}</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("api.name")}</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("api.origins")}</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("api.ips")}</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("api.lastUsed")}</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("api.active")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-xs text-muted-foreground">{t("api.empty")}</td></tr>
              )}
              {rows.map((c: any) => (
                <tr key={c.id} className="border-b border-border/50 last:border-0">
                  <td className="px-3 py-2 font-mono text-xs">{c.appId}</td>
                  <td className="px-3 py-2 text-xs">{c.name}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{c.allowedOrigins.join(", ") || "—"}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{c.allowedIps.join(", ") || "—"}</td>
                  <td className="px-3 py-2 text-xs tabular-nums text-muted-foreground whitespace-nowrap">
                    {c.lastUsedAt ? fmtDateTime(c.lastUsedAt) : t("api.never")}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <input
                      type="checkbox"
                      checked={c.active}
                      onChange={() =>
                        withToast(
                          updateClient({ variables: { id: c.id, input: { active: !c.active } } }),
                          t("api.updated"),
                          t("api.updateFail"),
                        )
                      }
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <IconBtn title={t("c.delete")} onClick={() => setDel({ id: c.id, appId: c.appId })}>
                      <Trash2 className="size-4" />
                    </IconBtn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {issued && (
        <Card
          title={t("api.created")}
          action={
            <IconBtn title={t("c.copy")} onClick={() => void copyWithToast(issued, t("set.tabApiKeys"))}>
              <KeyRound className="size-4" />
            </IconBtn>
          }
        >
          <p className="break-all px-3 py-2 font-mono text-xs">{issued}</p>
        </Card>
      )}

      {form && (
        <Card title={t("api.add")}>
          <div className="space-y-3 p-3">
            <Field label={t("api.appId")}>
              <input className={inputCls} value={form.appId} onChange={(e) => setForm({ ...form, appId: e.target.value })} />
            </Field>
            <Field label={t("api.name")}>
              <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label={t("api.origins")}>
              <input className={inputCls} value={form.origins} onChange={(e) => setForm({ ...form, origins: e.target.value })} />
              <p className="text-xs text-muted-foreground">{t("api.originsHint")}</p>
            </Field>
            <Field label={t("api.ips")}>
              <input className={inputCls} value={form.ips} onChange={(e) => setForm({ ...form, ips: e.target.value })} />
              <p className="text-xs text-muted-foreground">{t("api.ipsHint")}</p>
            </Field>
            <div className="flex gap-2">
              <button
                className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
                disabled={!form.appId.trim() || !form.name.trim() || (!list(form.origins).length && !list(form.ips).length)}
                onClick={submit}
              >
                {t("c.save")}
              </button>
              <button className="rounded border border-border px-3 py-1.5 text-xs" onClick={() => setForm(null)}>
                {t("c.cancel")}
              </button>
            </div>
          </div>
        </Card>
      )}

      <DeleteConfirm
        open={!!del}
        onClose={() => setDel(null)}
        onConfirm={() =>
          del && withToast(revokeClient({ variables: { id: del.id } }), t("api.revoked"), t("api.revokeFail"))
        }
        label={del?.appId ?? ""}
        note={t("api.revokeNote")}
      />
    </div>
  );
}

function AuditCard() {
  const { t } = useTranslation();
  const { data } = useQuery(AUDIT_LOGS, { variables: { limit: 200 }, fetchPolicy: "cache-and-network" });
  const rows = data?.auditLogs ?? [];
  return (
    <Card title={t("set.tabAudit")}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("audit.when")}</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("audit.actor")}</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("audit.action")}</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("audit.target")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={4} className="px-3 py-6 text-center text-xs text-muted-foreground">{t("audit.empty")}</td></tr>
            )}
            {rows.map((r: any) => (
              <tr key={r.id} className="border-b border-border/50 last:border-0">
                <td className="px-3 py-2 text-xs tabular-nums text-muted-foreground whitespace-nowrap">{fmtDateTime(r.at)}</td>
                <td className="px-3 py-2 text-xs">{r.actor ?? "—"}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.action}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{r.label ?? r.entityId ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
