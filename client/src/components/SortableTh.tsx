import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { cn } from "../lib/utils";
import type { SortDir } from "../lib/list";

// Clickable table header cell that drives sorting. Click a column to sort by it;
// click again to flip direction.
export function SortableTh({
  label,
  colKey,
  sortKey,
  sortDir,
  onSort,
  className = "",
}: {
  label: string;
  colKey: string;
  sortKey: string;
  sortDir: SortDir;
  onSort: (key: string) => void;
  className?: string;
}) {
  const active = sortKey === colKey;
  const Icon = !active ? ChevronsUpDown : sortDir === "asc" ? ChevronUp : ChevronDown;
  return (
    // cn(), not a template string: a status column passes text-center and has to
    // win over the default text-left.
    <th className={cn("px-3 py-2 text-left text-xs font-medium text-muted-foreground", className)}>
      <button
        onClick={() => onSort(colKey)}
        className={cn("inline-flex items-center gap-1 hover:text-foreground", active && "text-foreground")}
      >
        {label}
        <Icon className={`h-3 w-3 ${active ? "opacity-100" : "opacity-40"}`} />
      </button>
    </th>
  );
}

// Toggle helper: same key flips direction, new key starts ascending.
export function nextSort(current: { key: string; dir: SortDir }, key: string): { key: string; dir: SortDir } {
  if (current.key === key) return { key, dir: current.dir === "asc" ? "desc" : "asc" };
  return { key, dir: "asc" };
}
