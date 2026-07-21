import { useState } from "react";
import { useQuery, useMutation } from "@apollo/client";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { TEST_CASE } from "../../graphql/hierarchy";
import { RECORD_TESTS, ISSUES, DELETE_RECORD_TEST, DELETE_ISSUE } from "../../graphql/issue";
import { useNav } from "../../store/nav";
import { cn } from "../../lib/utils";
import { IconBtn } from "../../components/IconBtn";
import { DeleteConfirm } from "../../components/DeleteConfirm";
import { withToast } from "../../store/toast";

function Badge({ children, variant = "muted" }: { children: any; variant?: "muted" | "primary" | "destructive" | "outline" }) {
  const cls = {
    muted: "bg-muted text-muted-foreground",
    primary: "bg-primary text-primary-foreground",
    destructive: "bg-destructive text-white",
    outline: "border border-border text-muted-foreground",
  }[variant];
  return <span className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium", cls)}>{children}</span>;
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString();
}

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
                  {s.expectedResult && <span className="text-muted-foreground"> → Expected: {s.expectedResult}</span>}
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
                  <a key={a.id} href={a.url} target="_blank" rel="noreferrer" className="inline-flex items-center rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted">
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
          <div className="mb-3 flex items-center justify-between">
            <div className="inline-flex gap-0.5 rounded bg-muted p-1">
              {(["records", "issues"] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setTab(k)}
                  className={cn(
                    "rounded px-3 py-1.5 text-xs font-medium capitalize",
                    tab === k ? "bg-background text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {k}
                </button>
              ))}
            </div>
            <button
              onClick={() => openPanel({ kind: tab === "records" ? "record" : "issue", mode: "create" })}
              className="flex h-7 items-center gap-1.5 rounded bg-black px-3 text-xs font-medium text-white hover:bg-black/80"
            >
              <Plus className="h-3.5 w-3.5" /> {tab === "records" ? "Add Record" : "Add Issue"}
            </button>
          </div>
          {tab === "records" ? <RecordsTab testCaseId={id} /> : <IssuesTab testCaseId={id} />}
        </div>
      </div>
    </div>
  );
}

function RecordsTab({ testCaseId }: { testCaseId: string }) {
  const { selectIssue } = useNav();
  const { data, loading } = useQuery(RECORD_TESTS, { variables: { testCaseId } });
  const [del, setDel] = useState<string | null>(null);
  const [deleteRecord] = useMutation(DELETE_RECORD_TEST, {
    refetchQueries: [{ query: RECORD_TESTS, variables: { testCaseId } }],
  });
  const rows = data?.recordTests ?? [];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Date/time</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">QA</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Result</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Note</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Attach</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">Loading…</td></tr>
          )}
          {!loading && rows.length === 0 && (
            <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">No records yet</td></tr>
          )}
          {rows.map((r: any) => (
            <tr key={r.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30">
              <td className="px-3 py-2 text-xs">{fmt(r.executedAt)}</td>
              <td className="px-3 py-2">{r.executedBy.name}</td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-1.5">
                  <Badge variant={r.result === "PASS" ? "primary" : "destructive"}>{r.result}</Badge>
                  {r.retestIssueId && (
                    <button
                      onClick={() => selectIssue(r.retestIssueId)}
                      title="Retest of a fixed issue — open it"
                      className="inline-flex items-center rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-muted"
                    >
                      🔁 retest
                    </button>
                  )}
                </div>
              </td>
              <td className="px-3 py-2 text-xs text-muted-foreground">{r.note || "—"}</td>
              <td className="px-3 py-2 text-xs">{r.attachments.length}</td>
              <td className="px-3 py-2 text-right">
                <IconBtn title="Delete" onClick={() => setDel(r.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </IconBtn>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <DeleteConfirm
        open={!!del}
        onClose={() => setDel(null)}
        onConfirm={() => del && withToast(deleteRecord({ variables: { id: del } }), "Record deleted", "Couldn't delete record")}
        label="record"
      />
    </div>
  );
}

function IssuesTab({ testCaseId }: { testCaseId: string }) {
  const { openPanel, selectIssue } = useNav();
  const { data, loading } = useQuery(ISSUES, { variables: { testCaseId } });
  const [del, setDel] = useState<{ id: string; title: string } | null>(null);
  const [deleteIssue] = useMutation(DELETE_ISSUE, {
    refetchQueries: [{ query: ISSUES, variables: { testCaseId } }],
  });
  const rows = data?.issues ?? [];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Issue</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Type</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Priority</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Status</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Assignee</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">Loading…</td></tr>
          )}
          {!loading && rows.length === 0 && (
            <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">No issues yet</td></tr>
          )}
          {rows.map((i: any) => (
            <tr key={i.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30">
              <td className="px-3 py-2 font-medium">
                <button onClick={() => selectIssue(i.id)} className="hover:underline">
                  {i.title}
                </button>
              </td>
              <td className="px-3 py-2"><Badge variant={i.type === "DEFECT" ? "destructive" : "outline"}>{i.type}</Badge></td>
              <td className="px-3 py-2"><Badge variant="outline">{i.priority}</Badge></td>
              <td className="px-3 py-2"><Badge>{i.status}</Badge></td>
              <td className="px-3 py-2 text-muted-foreground">{i.assignee.name}</td>
              <td className="px-3 py-2 text-right">
                <div className="flex justify-end gap-1">
                  <IconBtn title="Edit" onClick={() => openPanel({ kind: "issue", mode: "edit", id: i.id })}>
                    <Pencil className="h-3.5 w-3.5" />
                  </IconBtn>
                  <IconBtn title="Delete" onClick={() => setDel({ id: i.id, title: i.title })}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </IconBtn>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <DeleteConfirm
        open={!!del}
        onClose={() => setDel(null)}
        onConfirm={() => del && withToast(deleteIssue({ variables: { id: del.id } }), "Issue deleted", "Couldn't delete issue")}
        label={del?.title ?? ""}
      />
    </div>
  );
}
