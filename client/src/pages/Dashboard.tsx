import { useQuery } from "@apollo/client";
import { useTranslation } from "react-i18next";
import { ChevronRight } from "lucide-react";
import { useNav } from "../store/nav";
import { PROJECTS, FEATURES } from "../graphql/hierarchy";
import { ProjectList } from "./hierarchy/ProjectList";
import { FeatureList } from "./hierarchy/FeatureList";
import { TestCaseList } from "./hierarchy/TestCaseList";
import { TestCaseDetail } from "./hierarchy/TestCaseDetail";
import { IssueDetail } from "./hierarchy/IssueDetail";
import { ProjectForm } from "./forms/ProjectForm";
import { FeatureForm } from "./forms/FeatureForm";
import { TestCaseForm } from "./forms/TestCaseForm";
import { RecordForm } from "./forms/RecordForm";
import { IssueForm } from "./forms/IssueForm";
import { PostmortemForm } from "./forms/PostmortemForm";
import { AttachmentPanel } from "./forms/AttachmentPanel";
import { MoveTestCaseForm } from "./forms/MoveTestCaseForm";
import { MoveFeatureForm } from "./forms/MoveFeatureForm";
import { CloneFeatureForm } from "./forms/CloneFeatureForm";
import { CloneTestCaseForm } from "./forms/CloneTestCaseForm";
import { ImportTestCasesForm } from "./forms/ImportTestCasesForm";

export default function Dashboard() {
  const { t } = useTranslation();
  const { projectId, featureId, testCaseId, issueId, panel, selectProject, selectFeature, selectTestCase } =
    useNav();

  // Names for breadcrumb (from cached lists).
  const { data: projData } = useQuery(PROJECTS);
  const { data: featData } = useQuery(FEATURES, { variables: { projectId }, skip: !projectId });
  const projName = projData?.projects?.find((p: any) => p.id === projectId)?.name;
  const featName = featData?.features?.find((f: any) => f.id === featureId)?.name;
  // Feature open but gone from the loaded list → it was deleted.
  const featDeleted = !!featureId && !!featData?.features && !featData.features.some((f: any) => f.id === featureId);

  return (
    <div className="flex h-full">
      <div className="flex-1 overflow-y-auto">
        {/* Breadcrumb */}
        {projectId && (
          <div className="flex items-center gap-1.5 border-b border-border px-6 py-3 text-xs text-muted-foreground">
            <button onClick={() => selectProject(null)} className="hover:text-foreground">
              {t("dash.projects")}
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
                <button
                  onClick={() => selectTestCase(null)}
                  className={testCaseId ? "hover:text-foreground" : "font-medium text-foreground"}
                >
                  {featName}
                </button>
              </>
            )}
            {testCaseId && issueId && (
              <>
                <ChevronRight className="h-3 w-3" />
                <span className="font-medium text-foreground">{t("dash.issueBreadcrumb")}</span>
              </>
            )}
          </div>
        )}

        {/* Level view — exclusive by deepest selection. */}
        {!projectId && !featureId && <ProjectList />}
        {projectId && !featureId && (
          <div className="space-y-4 p-6">
            <FeatureList projectId={projectId} />
          </div>
        )}
        {featureId && !testCaseId && featDeleted && (
          <div className="flex h-full flex-col items-center justify-center gap-3 bg-muted/30 px-4 text-center">
            <h1 className="text-lg font-semibold">{t("feat.deletedTitle")}</h1>
            <p className="max-w-sm text-sm text-muted-foreground">{t("feat.deletedText")}</p>
            <button onClick={() => selectFeature(null)} className="text-xs text-primary underline underline-offset-2 hover:text-primary/80">
              {t("feat.backToList")}
            </button>
          </div>
        )}
        {featureId && !testCaseId && !featDeleted && (
          <div className="space-y-4 p-6">
            <TestCaseList featureId={featureId} />
          </div>
        )}
        {testCaseId && !issueId && (
          <div className="space-y-4 p-6">
            <TestCaseDetail id={testCaseId} />
          </div>
        )}
        {testCaseId && issueId && (
          <div className="space-y-4 p-6">
            <IssueDetail id={issueId} testCaseId={testCaseId} />
          </div>
        )}
      </div>

      {/* Right panel */}
      {panel?.kind === "project" && <ProjectForm panel={panel} />}
      {panel?.kind === "feature" && projectId && <FeatureForm panel={panel} projectId={projectId} />}
      {panel?.kind === "testcase" && featureId && <TestCaseForm panel={panel} featureId={featureId} />}
      {panel?.kind === "record" && testCaseId && featureId && (
        <RecordForm testCaseId={testCaseId} featureId={featureId} retestIssueId={panel.initial?.retestIssueId} />
      )}
      {panel?.kind === "issue" && testCaseId && featureId && (
        <IssueForm panel={panel} testCaseId={testCaseId} featureId={featureId} />
      )}
      {panel?.kind === "postmortem" && panel.id && testCaseId && (
        <PostmortemForm issueId={panel.id} testCaseId={testCaseId} />
      )}
      {panel?.kind === "attachment" && <AttachmentPanel panel={panel} />}
      {panel?.kind === "movetc" && panel.id && featureId && (
        <MoveTestCaseForm testCaseId={panel.id} sourceFeatureId={featureId} />
      )}
      {panel?.kind === "movefeature" && panel.id && projectId && (
        <MoveFeatureForm featureId={panel.id} sourceProjectId={projectId} />
      )}
      {panel?.kind === "clonefeature" && panel.id && projectId && (
        <CloneFeatureForm featureId={panel.id} sourceProjectId={projectId} />
      )}
      {panel?.kind === "clonetc" && panel.id && projectId && featureId && (
        <CloneTestCaseForm testCaseId={panel.id} sourceProjectId={projectId} sourceFeatureId={featureId} />
      )}
      {panel?.kind === "importtc" && panel.initial && (
        <ImportTestCasesForm scope={panel.initial.scope} projectId={panel.initial.projectId} featureId={panel.initial.featureId} />
      )}
    </div>
  );
}
