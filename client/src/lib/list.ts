// Client-side list ops: search, sort, group. Datasets are small (per-project),
// so filtering in the browser is simpler than server params.
// ponytail: client-side; move to server query args if a list ever grows large.

export function searchRows<T>(rows: T[], query: string, fields: (keyof T)[]): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) =>
    fields.some((f) => String(r[f] ?? "").toLowerCase().includes(q)),
  );
}

export type SortDir = "asc" | "desc";

export function sortRows<T>(rows: T[], key: keyof T, dir: SortDir = "asc"): T[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * sign;
    return String(av).localeCompare(String(bv)) * sign;
  });
}

export function groupRows<T>(rows: T[], key: keyof T): Record<string, T[]> {
  return rows.reduce<Record<string, T[]>>((acc, r) => {
    const k = String(r[key] ?? "—");
    (acc[k] ??= []).push(r);
    return acc;
  }, {});
}
