import { useTranslation } from "react-i18next";
import { Badge } from "./Badge";

interface CoverageBarProps {
  percent: number;
  min: number;
  ready: boolean;
}

// Compact pass% bar + ready/below badge, for a detail header. Bar is monochrome
// per DESIGN.md; the badge carries the ready state. The lists print the number
// and the badge as two columns of their own instead.
export function CoverageBar({ percent, min, ready }: CoverageBarProps) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 rounded-full bg-muted">
        <div className="h-1.5 rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
      </div>
      <span className="tabular-nums text-xs">{percent}%</span>
      <Badge variant={ready ? "primary" : "outline"} title={t("coverage.min", { min })}>
        {ready ? t("dash.ready") : t("dash.below")}
      </Badge>
    </div>
  );
}
