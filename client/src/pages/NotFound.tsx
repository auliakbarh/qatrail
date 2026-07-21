import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

export default function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-muted/30 px-4">
      <h1 className="text-2xl font-semibold">{t("nf.title")}</h1>
      <p className="text-sm text-muted-foreground">{t("nf.text")}</p>
      <Link to="/" className="text-xs text-primary underline underline-offset-2 hover:text-primary/80">
        {t("nf.back")}
      </Link>
    </div>
  );
}
