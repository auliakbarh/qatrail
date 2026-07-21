import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation } from "@apollo/client";
import { useTranslation, Trans } from "react-i18next";
import { FORGOT_PASSWORD } from "../graphql/admin";

export default function ForgotPassword() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [forgot, { loading }] = useMutation(FORGOT_PASSWORD);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    await forgot({ variables: { email } });
    setSent(true);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-sm rounded border border-border bg-card p-6">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold">{t("auth.forgotTitle")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("auth.forgotSub")}</p>
        </div>
        {sent ? (
          <div className="space-y-4 text-center">
            <p className="text-sm"><Trans i18nKey="auth.resetSent" values={{ email }} components={{ b: <b /> }} /></p>
            <Link to="/login" className="text-xs text-primary underline underline-offset-2">{t("auth.backSignIn")}</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("c.email")}</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="name@hpam.co.id"
              />
            </div>
            <button type="submit" disabled={loading} className="w-full rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {loading ? t("auth.sending") : t("auth.sendReset")}
            </button>
            <div className="text-center">
              <Link to="/login" className="text-xs text-primary underline underline-offset-2">{t("auth.backSignIn")}</Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
