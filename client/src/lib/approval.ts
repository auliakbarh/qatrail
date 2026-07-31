// How long a test case waited: "3h", "2d 4h", "12m". Used for both the pending
// list ("waiting since") and the approval gap on an approved case.
// ponytail: no date library — two subtractions and a format.
export function gapLabel(fromIso?: string | null, toIso?: string | null, t?: (k: string, o?: any) => string): string {
  if (!fromIso || !toIso) return "—";
  const mins = Math.max(0, Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 60000));
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  const unit = (n: number, key: "d" | "h" | "m") => `${n}${t ? t(`gap.${key}`) : key}`;
  if (d > 0) return h > 0 ? `${unit(d, "d")} ${unit(h, "h")}` : unit(d, "d");
  if (h > 0) return m > 0 ? `${unit(h, "h")} ${unit(m, "m")}` : unit(h, "h");
  return unit(m, "m");
}

// Same measure, but open-ended: how long this case has been waiting so far.
export function waitedFor(fromIso?: string | null, t?: (k: string, o?: any) => string): string {
  return gapLabel(fromIso, new Date().toISOString(), t);
}
