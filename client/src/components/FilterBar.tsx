import type { ReactNode } from "react";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";

interface Opt {
  value: string;
  label: string;
}

interface FilterBarProps {
  search: string;
  onSearch: (v: string) => void;
  // Sort controls are optional — omit when sorting is driven by table headers.
  sortKey?: string;
  onSortKey?: (v: string) => void;
  sortOptions?: Opt[];
  sortDir?: "asc" | "desc";
  onSortDir?: (v: "asc" | "desc") => void;
  groupKey?: string;
  onGroupKey?: (v: string) => void;
  groupOptions?: Opt[];
  // Extra controls (page-specific selects, date pickers) rendered inside the
  // same row — wrapping FilterBar in another flex container instead leaves its
  // own mb-3 inside the row and the controls sit off the baseline.
  children?: ReactNode;
}

const small = "h-8 rounded border border-border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring";

export function FilterBar(p: FilterBarProps) {
  const { t } = useTranslation();
  const showSort = p.sortOptions && p.onSortKey;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={p.search}
          onChange={(e) => p.onSearch(e.target.value)}
          placeholder={t("c.search")}
          className={`${small} w-48 pl-7`}
        />
      </div>
      {showSort && (
        <>
          <select value={p.sortKey} onChange={(e) => p.onSortKey!(e.target.value)} className={small}>
            {p.sortOptions!.map((o) => (
              <option key={o.value} value={o.value}>
                {t("c.sortLabel", { label: o.label })}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => p.onSortDir!(p.sortDir === "asc" ? "desc" : "asc")}
            className={`${small} w-9`}
            title={t("c.toggleDir")}
          >
            {p.sortDir === "asc" ? "↑" : "↓"}
          </button>
        </>
      )}
      {p.groupOptions && p.onGroupKey && (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">{t("c.groupBy")}</span>
          <select value={p.groupKey} onChange={(e) => p.onGroupKey!(e.target.value)} className={small}>
            <option value="">-</option>
            {p.groupOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label.toUpperCase()}
              </option>
            ))}
          </select>
        </div>
      )}
      {p.children}
    </div>
  );
}

/** Class for a page-specific control passed as a FilterBar child, so it lines up. */
export const filterCtl = small;
