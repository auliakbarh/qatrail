import { useQuery } from "@apollo/client";
import { useTranslation } from "react-i18next";
import { useNav, useDrill, scopeFromOrigin } from "../store/nav";
import { Breadcrumb } from "../components/Breadcrumb";
import { FEATURES } from "../graphql/hierarchy";
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
import { IssueScopeForm } from "./forms/IssueScopeForm";
import { TestCaseViewPanel } from "./forms/TestCaseViewPanel";

export default function Dashboard() {
  const { t } = useTranslation();
  const { panel } = useNav();
  const { projectId, featureId, testCaseId, issueId, goFeature, from } = useDrill();
  // Entered from an app test / session: runs and findings filed here belong to it.
  const originScope = scopeFromOrigin(from);

  // Same variables as FeatureList so both read one cache entry: with different
  // variables this one goes stale and a freshly created feature reads as deleted.
  const { data: featData } = useQuery(FEATURES, {
    variables: { projectId, includeInactive: true },
    skip: !featureId,
    fetchPolicy: "cache-and-network",
  });
  // Feature open but gone from the loaded list → it was deleted.
  const featDeleted = !!featureId && !!featData?.features && !featData.features.some((f: any) => f.id === featureId);

  return (
    <div className="flex h-full">
      <div className="flex-1 overflow-y-auto">
        <Breadcrumb />

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
            <button onClick={() => goFeature(null)} className="text-xs text-primary underline underline-offset-2 hover:text-primary/80">
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
        <RecordForm
          testCaseId={testCaseId}
          featureId={featureId}
          retestIssueId={panel.initial?.retestIssueId}
          // A retest carries the issue's own scope — including none at all, which
          // is why the origin must not fill the gap here. Any other run belongs
          // to whatever context the drilldown was entered from.
          appTestId={panel.initial?.appTestId ?? (panel.initial?.retestIssueId ? undefined : originScope.appTestId)}
          sessionTestId={panel.initial?.sessionTestId ?? (panel.initial?.retestIssueId ? undefined : originScope.sessionTestId)}
        />
      )}
      {panel?.kind === "issue" && testCaseId && featureId && (
        <IssueForm
          panel={panel}
          testCaseId={testCaseId}
          featureId={featureId}
          appTestId={panel.initial?.appTestId ?? originScope.appTestId}
          sessionTestId={panel.initial?.sessionTestId ?? originScope.sessionTestId}
        />
      )}
      {panel?.kind === "postmortem" && panel.id && testCaseId && (
        <PostmortemForm issueId={panel.id} testCaseId={testCaseId} />
      )}
      {panel?.kind === "attachment" && <AttachmentPanel panel={panel} />}
      {panel?.kind === "issuescope" && panel.initial && <IssueScopeForm issue={panel.initial} />}
      {panel?.kind === "testcaseview" && panel.id && <TestCaseViewPanel testCaseId={panel.id} />}
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
