import { useState } from "react";
import { useQuery } from "@apollo/client";
import { useTranslation } from "react-i18next";
import { ChevronRight, ChevronDown } from "lucide-react";
import { PROJECTS, FEATURES } from "../graphql/hierarchy";
import { useDrill } from "../store/nav";
import { cn } from "../lib/utils";
import { Skeleton } from "./Skeleton";

// Collapsible Project → Feature tree in the sidebar. Selecting a node primes
// nav state and routes to the dashboard, where the drilldown renders it.
export function SidebarTree() {
  const { t } = useTranslation();
  const { data } = useQuery(PROJECTS);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // The whole project list collapses, separate from each project's feature branch.
  const [listOpen, setListOpen] = useState(true);
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
      <button
        onClick={() => setListOpen((v) => !v)}
        className="flex items-center gap-1 rounded px-1.5 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground"
        title={listOpen ? t("nav.collapseProjects") : t("nav.expandProjects")}
      >
        {listOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {t("dash.projects")} · {projects.length}
      </button>
      {listOpen &&
        projects.map((p: any) => (
          <ProjectNode key={p.id} project={p} expanded={expanded.has(p.id)} onToggle={() => toggle(p.id)} />
        ))}
    </div>
  );
}

function ProjectNode({ project, expanded, onToggle }: { project: any; expanded: boolean; onToggle: () => void }) {
  const { projectId, goProject } = useDrill();
  const active = projectId === project.id;

  return (
    <div>
      <div className={cn("flex items-center gap-1 rounded px-1.5 py-1 text-xs", active && "bg-muted")}>
        <button onClick={onToggle} className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground">
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </button>
        <button
          onClick={() => {
            goProject(project.id);
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
  const { t } = useTranslation();
  const { data, loading } = useQuery(FEATURES, { variables: { projectId } });
  const { featureId, goFeature } = useDrill();
  const features = data?.features ?? [];

  if (loading)
    return (
      <div className="flex flex-col gap-1 py-1 pl-7">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-2.5 w-24" />)}
      </div>
    );
  if (features.length === 0) return <div className="py-1 pl-7 text-[11px] text-muted-foreground">{t("an.noFeatures")}</div>;

  return (
    <div className="flex flex-col gap-0.5">
      {features.map((f: any) => (
        <button
          key={f.id}
          onClick={() => {
            goFeature(f.id, projectId);
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
