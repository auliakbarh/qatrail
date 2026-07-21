import { useState } from "react";
import { useMutation, useQuery } from "@apollo/client";
import { useNavigate, Navigate, Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { LOGIN, HEALTH } from "../graphql";
import { useAuth } from "../store/auth";
import { PasswordInput } from "../components/PasswordInput";

interface Form {
  email: string;
  password: string;
}

export default function Login() {
  const { t } = useTranslation();
  const { user, signIn } = useAuth();
  const navigate = useNavigate();
  const { register, handleSubmit, formState } = useForm<Form>();
  const [login, { loading }] = useMutation(LOGIN);
  const { data: health } = useQuery(HEALTH, { fetchPolicy: "cache-first" });
  const ssoEnabled = !!health?.health?.ssoEnabled;
  const [error, setError] = useState<string | null>(null);

  if (user) return <Navigate to="/" replace />;

  const onSubmit = async (values: Form) => {
    setError(null);
    try {
      const res = await login({ variables: values });
      const payload = res.data?.login;
      if (payload) {
        signIn(payload.token, payload.user);
        navigate("/");
      }
    } catch (e: any) {
      setError(e?.message ?? t("login.error"));
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-sm rounded border border-border bg-card p-6">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold">{t("app")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("login.subtitle")}</p>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("login.email")}</label>
            <input
              type="email"
              autoComplete="username"
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="name@hpam.co.id"
              {...register("email", { required: true })}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("login.password")}</label>
            <PasswordInput
              autoComplete="current-password"
              placeholder="••••••••"
              {...register("password", { required: true })}
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <button
            type="submit"
            disabled={loading || formState.isSubmitting}
            className="w-full rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? "…" : t("login.submit")}
          </button>
          <button
            type="button"
            disabled={!ssoEnabled}
            onClick={() => setError(t("login.ssoNotReady"))}
            className="flex w-full items-center justify-center gap-2 rounded border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted disabled:opacity-60 disabled:hover:bg-transparent"
          >
            {t("login.microsoft")}
            {!ssoEnabled && (
              <span className="rounded border border-border px-1.5 py-0.5 text-[10px]">{t("login.soon")}</span>
            )}
          </button>
          <div className="text-center">
            <Link to="/forgot-password" className="text-xs text-primary underline underline-offset-2 hover:text-primary/80">
              {t("login.forgot")}
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
