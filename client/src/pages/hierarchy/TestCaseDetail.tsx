import { useState } from "react";
import { useQuery } from "@apollo/client";
import { Pencil } from "lucide-react";
import { TEST_CASE } from "../../graphql/hierarchy";
import { useNav } from "../../store/nav";
import { cn } from "../../lib/utils";

export function TestCaseDetail({ id }: { id: string }) {
  const { openPanel } = useNav();
  const { data, loading } = useQuery(TEST_CASE, { variables: { id } });
  const [tab, setTab] = useState<"records" | "issues">("records");

  if (loading) return <div className="rounded border border-border p-8 text-sm text-muted-foreground">Loading…</div>;
  const tc = data?.testCase;
  if (!tc) return <div className="rounded border border-border p-8 text-sm text-muted-foreground">Not found</div>;

  return (
    <div className="space-y-4">
      <div className="rounded border border-border">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">{tc.name}</h2>
          <button
            onClick={() => openPanel({ kind: "testcase", mode: "edit", id: tc.id })}
            className="flex h-7 items-center gap-1.5 rounded border border-border px-3 text-xs hover:bg-muted"
          >
            <Pencil className="h-3.5 w-3.5" /> Edit
          </button>
        </div>
        <div className="space-y-3 px-5 py-4 text-sm">
          {tc.description && <p className="text-muted-foreground">{tc.description}</p>}
          {tc.precondition && (
            <p>
              <span className="font-medium">Precondition:</span> {tc.precondition}
            </p>
          )}
          <div>
            <div className="mb-1 font-medium">Steps</div>
            <div className="space-y-1">
              {tc.steps.map((s: any) => (
                <div key={s.id} className="text-xs">
                  {s.order}. {s.step}
                  {s.expectedResult && (
                    <span className="text-muted-foreground"> → Expected: {s.expectedResult}</span>
                  )}
                </div>
              ))}
              {tc.steps.length === 0 && <div className="text-xs text-muted-foreground">No steps</div>}
            </div>
          </div>
          {tc.attachments.length > 0 && (
            <div>
              <div className="mb-1 font-medium">Attachments</div>
              <div className="flex flex-wrap gap-2">
                {tc.attachments.map((a: any) => (
                  <a
                    key={a.id}
                    href={a.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted"
                  >
                    {a.order}. {a.label || a.kind}
                  </a>
                ))}
              </div>
            </div>
          )}
          {tc.note && (
            <p>
              <span className="font-medium">Note:</span> {tc.note}
            </p>
          )}
        </div>
      </div>

      <div className="rounded border border-border">
        <div className="px-5 py-4">
          <div className="mb-3 inline-flex gap-0.5 rounded bg-muted p-1">
            {(["records", "issues"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={cn(
                  "rounded px-3 py-1.5 text-xs font-medium capitalize",
                  tab === k ? "bg-background text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {k} ({k === "records" ? tc.recordCount : tc.issueCount})
              </button>
            ))}
          </div>
          <div className="py-8 text-center text-sm text-muted-foreground">
            {tab === "records" ? "Record tests" : "Issues"} land in M2.
          </div>
        </div>
      </div>
    </div>
  );
}
