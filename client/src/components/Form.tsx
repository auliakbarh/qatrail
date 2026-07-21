import type { ReactNode } from "react";

export const inputCls =
  "w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

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
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">
        {label} {optional && <span className="font-normal text-muted-foreground">(optional)</span>}
      </label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function FormActions({
  onCancel,
  saving,
  saveLabel = "Save",
}: {
  onCancel: () => void;
  saving?: boolean;
  saveLabel?: string;
}) {
  return (
    <div className="flex gap-2 pt-2">
      <button
        type="submit"
        disabled={saving}
        className="flex-1 rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        {saving ? "Saving…" : saveLabel}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="flex-1 rounded border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
      >
        Cancel
      </button>
    </div>
  );
}
