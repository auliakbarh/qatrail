import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@apollo/client";
import { useTranslation } from "react-i18next";
import { ChevronRight } from "lucide-react";
import { PROJECTS, FEATURES, TEST_CASE } from "../graphql/hierarchy";
import { ISSUE } from "../graphql/issue";
import { APP_TEST } from "../graphql/apptest";
import { SESSION_TEST } from "../graphql/sessiontest";
import { useDrill, useNav } from "../store/nav";
import { cn } from "../lib/utils";

interface Crumb {
  label: string;
  onClick?: () => void; // omitted → current level, not clickable
}

// Where the drilldown was entered from, so the trail reads the way the user got
// here: `?from=app-test:<id>` | `session:<id>` | `assigned` | `issues` | `pending`.
function parseFrom(from: string): { kind: string; id: string } {
  const [kind, id = ""] = from.split(":");
  return { kind, id };
}

export function Breadcrumb() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { projectId, featureId, testCaseId, issueId, goProject, goFeature, goTestCase } = useDrill();
  const panel = useNav((s) => s.panel);
  const { kind: origin, id: originId } = parseFrom(params.get("from") ?? "");

  const hierarchy =
    origin !== "app-test" && origin !== "session" && origin !== "assigned" && origin !== "issues" && origin !== "pending";

  // Names/keys per level. Each query is skipped unless its level is in play, and
  // the pages themselves have usually already primed the cache.
  const { data: projData } = useQuery(PROJECTS, { variables: { includeInactive: true }, skip: !hierarchy || !projectId });
  // includeInactive so a retired feature still names itself in the trail.
  const { data: featData } = useQuery(FEATURES, {
    variables: { projectId, includeInactive: true },
    skip: !hierarchy || !featureId,
  });
  const { data: tcData } = useQuery(TEST_CASE, { variables: { id: testCaseId }, skip: !testCaseId });
  const { data: issueData } = useQuery(ISSUE, { variables: { id: issueId }, skip: !issueId });
  const { data: appData } = useQuery(APP_TEST, { variables: { id: originId }, skip: origin !== "app-test" });
  const { data: sessData } = useQuery(SESSION_TEST, { variables: { id: originId }, skip: origin !== "session" });

  const crumbs: Crumb[] = [];
  if (origin === "app-test") {
    crumbs.push({ label: t("nav.appTests"), onClick: () => navigate("/app-tests") });
    crumbs.push({ label: appData?.appTest?.key ?? "…", onClick: () => navigate(`/app-tests/${originId}`) });
  } else if (origin === "session") {
    crumbs.push({ label: t("nav.sessionTests"), onClick: () => navigate("/session-tests") });
    crumbs.push({ label: sessData?.sessionTest?.key ?? "…", onClick: () => navigate(`/session-tests/${originId}`) });
  } else if (origin === "assigned") {
    crumbs.push({ label: t("nav.assigned"), onClick: () => navigate("/assigned") });
  } else if (origin === "issues") {
    crumbs.push({ label: t("nav.allIssues"), onClick: () => navigate("/issues") });
  } else if (origin === "pending") {
    crumbs.push({ label: t("nav.approvals"), onClick: () => navigate("/approvals") });
  } else {
    crumbs.push({ label: t("dash.projects"), onClick: () => goProject(null) });
    if (projectId) {
      const name = projData?.projects?.find((p: any) => p.id === projectId)?.name;
      if (name) crumbs.push({ label: name, onClick: () => goFeature(null) });
    }
    if (featureId) {
      const name = featData?.features?.find((f: any) => f.id === featureId)?.name;
      if (name) crumbs.push({ label: name, onClick: () => goTestCase(null) });
    }
  }

  // Coming from a flat issue list, the test case is a detour the user never took.
  const flatIssueList = origin === "assigned" || origin === "issues";
  if (testCaseId && !(issueId && flatIssueList)) {
    crumbs.push({ label: tcData?.testCase?.key ?? "…", onClick: () => goTestCase(testCaseId) });
  }
  if (issueId) crumbs.push({ label: issueData?.issue?.key ?? "…" });
  // A record has no page of its own — it only exists as an open panel.
  if (panel?.kind === "record") crumbs.push({ label: t("dash.recordBreadcrumb") });

  // The last crumb is where we are: never clickable.
  const last = crumbs.length - 1;

  if (crumbs.length <= 1) return null;
  // Sticky: the trail is also the way back up a level, and a feature with fifty
  // test cases scrolls it out of reach. Opaque background so rows can't show
  // through it.
  return (
    <div className="sticky top-0 z-20 flex flex-wrap items-center gap-1.5 border-b border-border bg-background px-6 py-3 text-xs text-muted-foreground">
      {crumbs.map((c, i) => (
        <span key={`${c.label}-${i}`} className="flex items-center gap-1.5">
          {i > 0 && <ChevronRight className="h-3 w-3" />}
          {i === last || !c.onClick ? (
            <span className="font-medium text-foreground">{c.label}</span>
          ) : (
            <button onClick={c.onClick} className={cn("hover:text-foreground")}>
              {c.label}
            </button>
          )}
        </span>
      ))}
    </div>
  );
}
