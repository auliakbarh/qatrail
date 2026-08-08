import { cn } from "../lib/utils";

// Placeholder blocks shown while a page's first query is in flight. They stand
// in for the real layout, so the page doesn't jump when data lands — which a
// centred "Loading…" line always did.
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded bg-muted", className)} />;
}

/** Filler rows for a table that hasn't loaded yet. Match `cols` to the header. */
export function TableSkeleton({ rows = 6, cols }: { rows?: number; cols: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} className="border-b border-border/50 last:border-0">
          {Array.from({ length: cols }).map((__, c) => (
            <td key={c} className="px-3 py-2">
              {/* Uneven widths read as text rather than a progress bar. */}
              <Skeleton className={cn("h-3", c === 0 ? "w-10" : c % 3 === 1 ? "w-32" : "w-20")} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/** Stand-in for a detail page: title bar, then a couple of card-shaped blocks. */
export function DetailSkeleton() {
  return (
    <div className="space-y-4">
      <div className="rounded border border-border">
        <div className="flex items-center gap-2 border-b border-border px-5 py-4">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="space-y-2 px-5 py-4">
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      </div>
      <div className="rounded border border-border">
        <div className="border-b border-border px-5 py-4">
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="space-y-2 px-5 py-4">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
        </div>
      </div>
    </div>
  );
}
