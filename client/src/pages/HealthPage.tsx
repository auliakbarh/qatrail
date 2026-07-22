import { useQuery } from "@apollo/client";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { HEALTH } from "../graphql";
import { UI_VERSION } from "../config";
import { cn } from "../lib/utils";

// Public system-health page (/health). No auth required — the health query is public.
export default function HealthPage() {
  const { t } = useTranslation();
  const { data, loading, error, refetch } = useQuery(HEALTH, {
    fetchPolicy: "network-only",
    pollInterval: 15000,
  });
  const h = data?.health;
  const apiUp = !error && !!h;

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-md rounded border border-border bg-card p-6">
        <div className="mb-5 flex items-center justify-between">
          <h1 className="text-lg font-semibold">{t("health.title")}</h1>
          <button
            onClick={() => refetch()}
            className="h-7 rounded border border-border px-3 text-xs hover:bg-muted"
          >
            {t("health.refresh")}
          </button>
        </div>

        <div className="mb-4 flex items-center gap-2">
          <Dot ok={apiUp} />
          <span className="text-sm font-medium">
            {loading ? t("c.loading") : apiUp ? t("health.up") : t("health.down")}
          </span>
        </div>

        <div className="divide-y divide-border/60 rounded border border-border">
          <Row label={t("health.api")} value={apiUp ? `v${h?.apiVersion}` : "—"} ok={apiUp} />
          <Row label={t("health.ui")} value={`v${UI_VERSION}`} ok />
          <Row label={t("health.db")} value={apiUp ? t("health.reachable") : t("health.unknown")} ok={apiUp} />
          <Row
            label={t("health.maintenance")}
            value={h?.maintenance ? t("health.on") : t("health.off")}
            ok={!h?.maintenance}
          />
          <Row label={t("health.jira")} value={h?.jiraConfigured ? t("health.configured") : t("health.notConfigured")} ok={!!h?.jiraConfigured} muted={!h?.jiraConfigured} />
          <Row label={t("health.sso")} value={h?.ssoEnabled ? t("health.enabled") : t("health.disabled")} ok={!!h?.ssoEnabled} muted={!h?.ssoEnabled} />
        </div>

        {h?.maintenance && h?.maintenanceMessage && (
          <p className="mt-3 rounded border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            {h.maintenanceMessage}
          </p>
        )}

        <div className="mt-5 text-center">
          <Link to="/" className="text-xs text-primary underline underline-offset-2">{t("nf.back")}</Link>
        </div>
      </div>
    </div>
  );
}

function Dot({ ok }: { ok: boolean }) {
  return <span className={cn("h-2.5 w-2.5 rounded-full", ok ? "bg-[var(--good)]" : "bg-destructive")} />;
}

function Row({ label, value, ok, muted }: { label: string; value: string; ok: boolean; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2">
        <span className={muted ? "text-muted-foreground" : ""}>{value}</span>
        <span className={cn("h-2 w-2 rounded-full", muted ? "bg-muted-foreground/40" : ok ? "bg-[var(--good)]" : "bg-destructive")} />
      </span>
    </div>
  );
}
