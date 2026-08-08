import { RotateCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../lib/utils";

// Manual refetch for a page's own query. Apollo only refetches on mount or after
// your own mutation, so someone else's change is invisible until then — this is
// how you ask for it without reloading the app.
// ponytail: no polling. A tab left open overnight would query forever for nobody.
export function RefreshBtn({ onClick, loading = false }: { onClick: () => void; loading?: boolean }) {
  const { t } = useTranslation();
  return (
    <button
      title={t("c.refresh")}
      onClick={onClick}
      disabled={loading}
      className="flex h-7 w-7 items-center justify-center rounded border border-border hover:bg-muted disabled:opacity-50"
    >
      <RotateCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
    </button>
  );
}
