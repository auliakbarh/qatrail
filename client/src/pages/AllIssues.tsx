import { useState } from "react";
import { useQuery } from "@apollo/client";
import { useNavigate } from "react-router-dom";
import { ISSUES } from "../graphql/issue";
import { FilterBar } from "../components/FilterBar";
import { SortableTh, nextSort } from "../components/SortableTh";
import { searchRows, sortRows, groupRows } from "../lib/list";
import { cn } from "../lib/utils";
import { Fragment } from "react";

function Badge({ children, variant = "muted" }: { children: any; variant?: "muted" | "primary" | "destructive" | "outline" }) {
  const c = {
    muted: "bg-muted text-muted-foreground",
    primary: "bg-primary text-primary-foreground",
    destructive: "bg-destructive text-white",
    outline: "border border-border text-muted-foreground",
  }[variant];
  return <span className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium", c)}>{children}</span>;
}

export default function AllIssues() {
  const navigate = useNavigate();
  const { data, loading } = useQuery(ISSUES, { fetchPolicy: "cache-and-network" });
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [groupKey, setGroupKey] = useState("");
  const onSort = (k: string) => {
    const n = nextSort({ key: sortKey, dir: sortDir }, k);
    setSortKey(n.key);
    setSortDir(n.dir);
  };
  const rows = sortRows(searchRows(data?.issues ?? [], search, ["title", "status", "priority"]), sortKey as any, sortDir);
  const groups: [string, any[]][] = groupKey ? Object.entries(groupRows(rows, groupKey as any)) : [["", rows]];

  return (
    <div className="h-full space-y-4 overflow-y-auto p-6">
      <div className="rounded border border-border">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">All issues</h2>
          <span className="text-xs text-muted-foreground">{rows.length} issue(s)</span>
        </div>
        <div className="px-5 py-4">
          <FilterBar
            search={search}
            onSearch={setSearch}
            groupKey={groupKey}
            onGroupKey={setGroupKey}
            groupOptions={[
              { value: "status", label: "status" },
              { value: "priority", label: "priority" },
              { value: "type", label: "type" },
            ]}
          />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <SortableTh label="Issue" colKey="title" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  <SortableTh label="Type" colKey="type" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  <SortableTh label="Priority" colKey="priority" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  <SortableTh label="Status" colKey="status" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Assignee</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Reporter</th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">Loading…</td></tr>}
                {!loading && rows.length === 0 && (
                  <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">No issues</td></tr>
                )}
                {groups.map(([label, gr]) => (
                  <Fragment key={label || "all"}>
                    {groupKey && (
                      <tr className="bg-muted/40">
                        <td colSpan={6} className="px-3 py-1.5 text-xs font-medium text-muted-foreground">{label} · {gr.length}</td>
                      </tr>
                    )}
                    {gr.map((i: any) => (
                      <tr key={i.id} className="cursor-pointer border-b border-border/50 last:border-0 hover:bg-muted/30" onClick={() => navigate(`/issues/${i.id}`)}>
                        <td className="px-3 py-2 font-medium">{i.title}</td>
                        <td className="px-3 py-2"><Badge variant={i.type === "DEFECT" ? "destructive" : "outline"}>{i.type}</Badge></td>
                        <td className="px-3 py-2"><Badge variant="outline">{i.priority}</Badge></td>
                        <td className="px-3 py-2"><Badge>{i.status}</Badge></td>
                        <td className="px-3 py-2 text-muted-foreground">{i.assignee?.name ?? "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{i.reporter?.name ?? "—"}</td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
