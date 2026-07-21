import { useQuery } from "@apollo/client";
import { ChevronRight } from "lucide-react";
import { useNav } from "../store/nav";
import { PROJECTS, FEATURES } from "../graphql/hierarchy";
import { ProjectList } from "./hierarchy/ProjectList";
import { FeatureList } from "./hierarchy/FeatureList";
import { TestCaseList } from "./hierarchy/TestCaseList";
import { TestCaseDetail } from "./hierarchy/TestCaseDetail";
import { ProjectForm } from "./forms/ProjectForm";
import { FeatureForm } from "./forms/FeatureForm";
import { TestCaseForm } from "./forms/TestCaseForm";

export default function Dashboard() {
  const { projectId, featureId, testCaseId, panel, selectProject, selectFeature } = useNav();

  // Names for breadcrumb (from cached lists).
  const { data: projData } = useQuery(PROJECTS);
  const { data: featData } = useQuery(FEATURES, { variables: { projectId }, skip: !projectId });
  const projName = projData?.projects?.find((p: any) => p.id === projectId)?.name;
  const featName = featData?.features?.find((f: any) => f.id === featureId)?.name;

  return (
    <div className="flex h-full">
      <div className="flex-1 overflow-y-auto">
        {/* Breadcrumb */}
        {projectId && (
          <div className="flex items-center gap-1.5 border-b border-border px-6 py-3 text-xs text-muted-foreground">
            <button onClick={() => selectProject(null)} className="hover:text-foreground">
              Projects
            </button>
            {projName && (
              <>
                <ChevronRight className="h-3 w-3" />
                <button
                  onClick={() => selectFeature(null)}
                  className={featureId ? "hover:text-foreground" : "font-medium text-foreground"}
                >
                  {projName}
                </button>
              </>
            )}
            {featureId && featName && (
              <>
                <ChevronRight className="h-3 w-3" />
                <span className={testCaseId ? "" : "font-medium text-foreground"}>{featName}</span>
              </>
            )}
          </div>
        )}

        {/* Level view */}
        {!projectId && <ProjectList />}
        {projectId && !featureId && (
          <div className="space-y-4 p-6">
            <FeatureList projectId={projectId} />
          </div>
        )}
        {featureId && !testCaseId && (
          <div className="space-y-4 p-6">
            <TestCaseList featureId={featureId} />
          </div>
        )}
        {testCaseId && (
          <div className="space-y-4 p-6">
            <TestCaseDetail id={testCaseId} />
          </div>
        )}
      </div>

      {/* Right panel */}
      {panel?.kind === "project" && <ProjectForm panel={panel} />}
      {panel?.kind === "feature" && projectId && <FeatureForm panel={panel} projectId={projectId} />}
      {panel?.kind === "testcase" && featureId && <TestCaseForm panel={panel} featureId={featureId} />}
    </div>
  );
}
