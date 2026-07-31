import { useTranslation } from "react-i18next";
import { cn } from "../lib/utils";

interface CoverageBarProps {
  percent: number;
  min: number;
  ready: boolean;
  // Feature rows show the number + badge only — the bar is noise at that depth.
  bar?: boolean;
}

// Compact pass% bar + ready/below badge. Bar is monochrome per DESIGN.md;
// the badge carries the ready state.
export function CoverageBar({ percent, min, ready, bar = true }: CoverageBarProps) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2">
      {bar && (
        <div className="h-1.5 w-16 rounded-full bg-muted">
          <div className="h-1.5 rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
        </div>
      )}
      <span className="tabular-nums text-xs">{percent}%</span>
      <span
        className={cn(
          "inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium",
          ready ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground",
        )}
        title={t("coverage.min", { min })}
      >
        {ready ? t("dash.ready") : t("dash.below")}
      </span>
    </div>
  );
}
