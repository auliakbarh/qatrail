// Generic stub for pages not yet built (Analytics, Settings, Help).
export default function Placeholder({ title }: { title: string }) {
  return (
    <div className="space-y-4 p-6">
      <div className="rounded border border-border">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">{title}</h2>
        </div>
        <div className="px-5 py-4 text-sm text-muted-foreground">Coming in a later milestone.</div>
      </div>
    </div>
  );
}
