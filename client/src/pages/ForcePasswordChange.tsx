import { useState } from "react";
import { useMutation, useApolloClient } from "@apollo/client";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CHANGE_PASSWORD, ME } from "../graphql";
import { useAuth } from "../store/auth";
import { unmetPasswordRules } from "../lib/passwordPolicy";
import { PasswordInput } from "../components/PasswordInput";

// Blocks the app until a user with mustChangePassword sets a new password.
export default function ForcePasswordChange() {
  const { t } = useTranslation();
  const client = useApolloClient();
  const navigate = useNavigate();
  const { setUser, signOut } = useAuth();
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [changePassword, { loading }] = useMutation(CHANGE_PASSWORD);
  const unmet = unmetPasswordRules(next);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await changePassword({ variables: { currentPassword: cur, newPassword: next } });
      const res = await client.query({ query: ME, fetchPolicy: "network-only" });
      setUser(res.data?.me ?? null);
    } catch (err: any) {
      setError(err?.message ?? t("auth.failed"));
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-sm rounded border border-border bg-card p-6">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold">{t("pw.setNew")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("pw.mustChange")}</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("pw.currentDefault")}</label>
            <PasswordInput required value={cur} onChange={(e) => setCur(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("pw.new")}</label>
            <PasswordInput required value={next} onChange={(e) => setNext(e.target.value)} />
            {next && unmet.length > 0 && <p className="text-xs text-destructive">{t("c.missing", { list: unmet.map((r) => t(`pw.${r}`)).join(", ") })}</p>}
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <button type="submit" disabled={loading || unmet.length > 0 || !cur} className="w-full rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {loading ? t("c.saving") : t("pw.change")}
          </button>
          <div className="text-center">
            <button type="button" onClick={() => { signOut(); navigate("/login"); }} className="text-xs text-muted-foreground underline underline-offset-2">{t("logout")}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
