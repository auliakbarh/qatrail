import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useMutation } from "@apollo/client";
import { RESET_PASSWORD } from "../graphql/admin";
import { unmetPasswordRules } from "../lib/passwordPolicy";

export default function ResetPassword() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [pw, setPw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [reset, { loading }] = useMutation(RESET_PASSWORD);
  const unmet = unmetPasswordRules(pw);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await reset({ variables: { token, newPassword: pw } });
      navigate("/login");
    } catch (err: any) {
      setError(err?.message ?? "Reset failed");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-sm rounded border border-border bg-card p-6">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold">Reset password</h1>
          <p className="mt-1 text-sm text-muted-foreground">Choose a new password.</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">New password</label>
            <input
              type="password"
              required
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {pw && unmet.length > 0 && <p className="text-xs text-destructive">Missing: {unmet.join(", ")}</p>}
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <button type="submit" disabled={loading || unmet.length > 0} className="w-full rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {loading ? "Saving…" : "Set new password"}
          </button>
          <div className="text-center">
            <Link to="/login" className="text-xs text-primary underline underline-offset-2">Back to sign in</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
