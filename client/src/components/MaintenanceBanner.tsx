import { useQuery } from "@apollo/client";
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import { HEALTH } from "../graphql";
import { fmtDateTime } from "../lib/utils";

// Announces a scheduled maintenance window on every page. Admins see it too —
// they are the ones who have to be ready when it starts.
//
// Only the upcoming window is announced: once maintenance is actually on, a
// non-admin is already looking at the Maintenance screen, and an admin working
// through it does not need a banner repeating what they switched on.
export function MaintenanceBanner() {
  const { t } = useTranslation();
  const { data } = useQuery(HEALTH, { fetchPolicy: "cache-and-network" });
  const h = data?.health;
  const start = h?.maintenanceStartAt ? new Date(h.maintenanceStartAt) : null;
  if (h?.maintenance || !start || start <= new Date()) return null;

  const end = h.maintenanceEndAt ? new Date(h.maintenanceEndAt) : null;

  return (
    <div className="flex items-center gap-2 border-b border-[var(--warn)]/40 bg-[var(--warn)]/10 px-5 py-2 text-xs">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-[var(--warn)]" />
      <span>
        {end
          ? t("maint.scheduledRange", { from: fmtDateTime(h.maintenanceStartAt), to: fmtDateTime(h.maintenanceEndAt) })
          : t("maint.scheduledFrom", { from: fmtDateTime(h.maintenanceStartAt) })}
      </span>
      {h.maintenanceMessage && <span className="text-muted-foreground">— {h.maintenanceMessage}</span>}
    </div>
  );
}
