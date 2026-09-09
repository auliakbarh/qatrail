import { useState, useEffect } from "react";
import { useQuery } from "@apollo/client";
import { useTranslation } from "react-i18next";
import { ChevronRight, ChevronDown } from "lucide-react";
import { PROJECTS, FEATURES } from "../graphql/hierarchy";
import { useNavigate } from "react-router-dom";
import { useDrill, useProjectScope } from "../store/nav";
import { groupRows } from "../lib/list";
import { cn } from "../lib/utils";
import { Skeleton } from "./Skeleton";

// Collapsible Project → Category → Feature tree in the sidebar. Selecting a node
// primes nav state and routes to the dashboard, where the drilldown renders it.
// The category level is Feature.category — a label, so features without one are
// listed under their own bucket instead of vanishing.
export function SidebarTree() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data } = useQuery(PROJECTS);
  const { projectId: drilledProjectId, goProject } = useDrill();
  const { projectId: scope, setProjectId: setScope } = useProjectScope();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // The whole project list collapses, separate from each project's feature branch.
  const [listOpen, setListOpen] = useState(true);
  const projects = data?.projects ?? [];

  // Opening a project anywhere in the app scopes the sidebar to it, so the picker
  // never disagrees with what the page is showing. One-directional on purpose:
  // it follows the URL and nothing else. `scope` must stay out of the condition
  // and the deps — with it in, the picker's own write re-ran this effect, which
  // set the scope straight back to the URL's project and made the dropdown
  // un-selectable anywhere inside a drilldown.
  useEffect(() => {
    if (drilledProjectId) setScope(drilledProjectId);
  }, [drilledProjectId, setScope]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  if (projects.length === 0) return null;

  // A stale id (project deleted, or retired out of the list) falls back to
  // showing everything rather than an empty sidebar.
  const picked = projects.filter((p: any) => p.id === scope);
  const shown = picked.length ? picked : projects;

  return (
    <div className="mt-1 flex flex-col gap-1">
      <select
        value={picked.length ? scope : ""}
        onChange={(e) => {
          const next = e.target.value;
          setScope(next);
          // The chosen project opens straight away — picking it and then having
          // to click its chevron is one click too many.
          if (next) setExpanded(new Set([next]));
          // Already looking at a project? Take the page there too, otherwise the
          // sidebar would name one project while the page still shows another.
          // On any other page the picker only scopes the tree — it must not yank
          // someone off the list they were reading.
          if (drilledProjectId && next !== drilledProjectId) {
            if (next) goProject(next);
            else navigate("/");
          }
        }}
        className="w-full rounded border border-border bg-background px-1.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
        title={t("nav.scopeHint")}
      >
        <option value="">{t("an.scopeAll")}</option>
        {projects.map((p: any) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
      <button
        onClick={() => setListOpen((v) => !v)}
        className="flex items-center gap-1 rounded px-1.5 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground"
        title={listOpen ? t("nav.collapseProjects") : t("nav.expandProjects")}
      >
        {listOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {t("dash.projects")} · {shown.length}
      </button>
      {listOpen &&
        shown.map((p: any) => (
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
  // Categories start open: the tree exists to show what is in the project, and a
  // collapsed-by-default level would hide it on arrival.
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const features = data?.features ?? [];

  if (loading)
    return (
      <div className="flex flex-col gap-1 py-1 pl-7">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-2.5 w-24" />)}
      </div>
    );
  if (features.length === 0) return <div className="py-1 pl-7 text-[11px] text-muted-foreground">{t("an.noFeatures")}</div>;

  const groups = Object.entries(groupRows(features, "category")).sort(([a], [b]) => a.localeCompare(b));
  // Nothing is filed yet: one "—" group would just be an extra row to click past.
  const flat = groups.length === 1;
  const toggle = (label: string) =>
    setClosed((prev) => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });

  const featureBtn = (f: any, indent: string) => (
    <button
      key={f.id}
      onClick={() => {
        goFeature(f.id, projectId);
      }}
      className={cn(
        "truncate rounded py-1 pr-2 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground",
        indent,
        featureId === f.id && "bg-muted font-medium text-foreground",
      )}
      title={f.name}
    >
      {f.name}
    </button>
  );

  if (flat) return <div className="flex flex-col gap-0.5">{features.map((f: any) => featureBtn(f, "pl-7"))}</div>;

  return (
    <div className="flex flex-col gap-0.5">
      {groups.map(([label, gr]) => (
        <div key={label} className="flex flex-col gap-0.5">
          <button
            onClick={() => toggle(label)}
            className="flex items-center gap-1 rounded py-1 pl-6 pr-2 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground"
            title={label}
          >
            {closed.has(label) ? <ChevronRight className="h-3 w-3 shrink-0" /> : <ChevronDown className="h-3 w-3 shrink-0" />}
            <span className="truncate">{label}</span>
          </button>
          {!closed.has(label) && gr.map((f: any) => featureBtn(f, "pl-11"))}
        </div>
      ))}
    </div>
  );
}
