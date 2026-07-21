import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../store/auth";

// Shown to non-admin users while maintenance mode is on. Only logout is allowed.
export default function Maintenance({ message }: { message?: string | null }) {
  const { t } = useTranslation();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-muted/30 px-4 text-center">
      <h1 className="text-2xl font-semibold">{t("maint.title")}</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        {message || t("maint.default")}
      </p>
      <button
        onClick={() => {
          signOut();
          navigate("/login");
        }}
        className="rounded border border-border px-4 py-2 text-sm hover:bg-muted"
      >
        {t("logout")}
      </button>
    </div>
  );
}
