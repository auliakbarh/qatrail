import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight } from "lucide-react";

const SIZES = [10, 25, 50, 100];

export type PageState = ReturnType<typeof usePageState>;

/** Client-side pagination for an already-loaded list. `size = 0` means show all. */
export function usePageState(initial = 10) {
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(initial);
  return { page, setPage, size, setSize };
}

// ponytail: no reset-on-filter effect — the page is clamped to what exists, so a
// shrinking list can never land on a blank page.
export function paged<T>(rows: T[], st: PageState): T[] {
  if (!st.size) return rows;
  const p = Math.min(st.page, Math.max(1, Math.ceil(rows.length / st.size)));
  return rows.slice((p - 1) * st.size, p * st.size);
}

export function Pager({ total, st }: { total: number; st: PageState }) {
  const { t } = useTranslation();
  const totalPages = st.size ? Math.max(1, Math.ceil(total / st.size)) : 1;
  const page = Math.min(st.page, totalPages);
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">{t("page.of", { total, page, totalPages })}</span>
        <select
          value={st.size}
          onChange={(e) => { st.setSize(Number(e.target.value)); st.setPage(1); }}
          className="h-7 rounded border border-border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
          title={t("page.perPage")}
        >
          {SIZES.map((n) => <option key={n} value={n}>{t("page.perPage", { n })}</option>)}
          <option value={0}>{t("page.showAll")}</option>
        </select>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button onClick={() => st.setPage(Math.max(1, page - 1))} disabled={page <= 1}
            className="flex h-7 w-7 items-center justify-center rounded border border-border hover:bg-muted disabled:opacity-40">
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => st.setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages}
            className="flex h-7 w-7 items-center justify-center rounded border border-border hover:bg-muted disabled:opacity-40">
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
