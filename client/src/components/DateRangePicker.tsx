import { useState } from "react";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { cn } from "../lib/utils";

// Single-calendar range picker (block selection): click a start day, then an end
// day; the span highlights. No external date library.
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
const fmt = (d: Date) => `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;

export function DateRangePicker({
  from,
  to,
  onChange,
}: {
  from: string | null;
  to: string | null;
  onChange: (from: string | null, to: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const startDate = from ? new Date(from) : null;
  const endDate = to ? new Date(to) : null;
  const [view, setView] = useState(() => {
    const base = startDate ?? new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  // Local pending selection while the popover is open.
  const [pStart, setPStart] = useState<Date | null>(startDate);
  const [pEnd, setPEnd] = useState<Date | null>(endDate);

  const year = view.getFullYear();
  const month = view.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const pick = (day: number) => {
    const d = new Date(year, month, day);
    if (!pStart || (pStart && pEnd)) {
      setPStart(d);
      setPEnd(null);
    } else if (d < pStart) {
      setPStart(d);
    } else {
      setPEnd(d);
    }
  };

  const inRange = (d: Date) => pStart && pEnd && d >= pStart && d <= pEnd;
  const apply = () => {
    if (pStart && pEnd) {
      onChange(ymd(pStart), ymd(pEnd));
      setOpen(false);
    }
  };
  const reset = () => {
    setPStart(null);
    setPEnd(null);
    onChange(null, null);
    setOpen(false);
  };

  const label =
    startDate && endDate ? `${fmt(startDate)} – ${fmt(endDate)}` : "Last 6 months";

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 items-center gap-1.5 rounded border border-border bg-background px-2 text-xs hover:bg-muted"
      >
        <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
        {label}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-1 w-64 rounded border border-border bg-background p-3 shadow-md">
            <div className="mb-2 flex items-center justify-between">
              <button onClick={() => setView(new Date(year, month - 1, 1))} className="flex h-6 w-6 items-center justify-center rounded hover:bg-muted">
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="text-xs font-medium">{MONTHS[month]} {year}</span>
              <button onClick={() => setView(new Date(year, month + 1, 1))} className="flex h-6 w-6 items-center justify-center rounded hover:bg-muted">
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] text-muted-foreground">
              {WEEKDAYS.map((w) => <div key={w} className="py-1">{w}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {Array.from({ length: firstDay }).map((_, i) => <div key={`b${i}`} />)}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const d = new Date(year, month, day);
                const isEdge = (pStart && same(d, pStart)) || (pEnd && same(d, pEnd));
                return (
                  <button
                    key={day}
                    onClick={() => pick(day)}
                    className={cn(
                      "h-7 rounded text-xs hover:bg-muted",
                      inRange(d) && !isEdge && "bg-muted",
                      isEdge && "bg-primary text-primary-foreground hover:bg-primary",
                    )}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex items-center justify-between">
              <button onClick={reset} className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">
                Last 6 months
              </button>
              <button
                onClick={apply}
                disabled={!pStart || !pEnd}
                className="h-7 rounded bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                Apply
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
