import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

export const inputCls =
  "w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70";

export function Field({
  label,
  optional,
  error,
  children,
}: {
  label: string;
  optional?: boolean;
  error?: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">
        {label} {optional && <span className="font-normal text-muted-foreground">({t("c.optional")})</span>}
      </label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function FormActions({
  onCancel,
  saving,
  saveLabel,
  disabled,
}: {
  onCancel: () => void;
  saving?: boolean;
  saveLabel?: string;
  disabled?: boolean; // blocks submit without claiming a save is in flight
}) {
  const { t } = useTranslation();
  return (
    <div className="flex gap-2 pt-2">
      <button
        type="submit"
        disabled={saving || disabled}
        className="flex-1 rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        {saving ? t("c.saving") : (saveLabel ?? t("c.save"))}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="flex-1 rounded border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
      >
        {t("c.cancel")}
      </button>
    </div>
  );
}
