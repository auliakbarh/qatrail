import { useState } from "react";
import { useQuery } from "@apollo/client";
import { useNavigate } from "react-router-dom";
import { ChevronRight, ChevronDown } from "lucide-react";
import { PROJECTS, FEATURES } from "../graphql/hierarchy";
import { useNav } from "../store/nav";
import { cn } from "../lib/utils";

// Collapsible Project → Feature tree in the sidebar. Selecting a node primes
// nav state and routes to the dashboard, where the drilldown renders it.
export function SidebarTree() {
  const { data } = useQuery(PROJECTS);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const projects = data?.projects ?? [];

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  if (projects.length === 0) return null;

  return (
    <div className="mt-1 flex flex-col gap-0.5">
      {projects.map((p: any) => (
        <ProjectNode key={p.id} project={p} expanded={expanded.has(p.id)} onToggle={() => toggle(p.id)} />
      ))}
    </div>
  );
}

function ProjectNode({ project, expanded, onToggle }: { project: any; expanded: boolean; onToggle: () => void }) {
  const { projectId, selectProject } = useNav();
  const navigate = useNavigate();
  const active = projectId === project.id;

  return (
    <div>
      <div className={cn("flex items-center gap-1 rounded px-1.5 py-1 text-xs", active && "bg-muted")}>
        <button onClick={onToggle} className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground">
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </button>
        <button
          onClick={() => {
            selectProject(project.id);
            navigate("/");
          }}
          className="flex-1 truncate text-left hover:text-foreground"
          title={project.name}
        >
          {project.name}
        </button>
      </div>
      {expanded && <FeatureBranch projectId={project.id} />}
    </div>
  );
}

function FeatureBranch({ projectId }: { projectId: string }) {
  const { data, loading } = useQuery(FEATURES, { variables: { projectId } });
  const { featureId, selectFeature } = useNav();
  const navigate = useNavigate();
  const features = data?.features ?? [];

  if (loading) return <div className="py-1 pl-7 text-[11px] text-muted-foreground">Loading…</div>;
  if (features.length === 0) return <div className="py-1 pl-7 text-[11px] text-muted-foreground">No features</div>;

  return (
    <div className="flex flex-col gap-0.5">
      {features.map((f: any) => (
        <button
          key={f.id}
          onClick={() => {
            selectFeature(f.id);
            navigate("/");
          }}
          className={cn(
            "truncate rounded py-1 pl-7 pr-2 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground",
            featureId === f.id && "bg-muted font-medium text-foreground",
          )}
          title={f.name}
        >
          {f.name}
        </button>
      ))}
    </div>
  );
}
