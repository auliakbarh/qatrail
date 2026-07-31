import { create } from "zustand";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";

export type PanelKind = "project" | "feature" | "testcase" | "record" | "issue" | "postmortem" | "attachment" | "movetc" | "movefeature" | "clonefeature" | "clonetc" | "importtc" | "apptest" | "apptestbuild" | "assigntc" | "bulkrecord" | "usertest" | "pickusertest" | "sessiontest" | "sessiontestapp" | "assignsessiontc" | "closesession" | "moveapptest" | "issuescope" | "testcaseview";
export interface PanelState {
  kind: PanelKind;
  mode: "create" | "edit";
  id?: string; // present for edit
  initial?: any; // prefilled row for edit (project/feature); testcase refetches for steps
}

interface NavState {
  panel: PanelState | null;
  openPanel: (p: PanelState) => void;
  closePanel: () => void;
}

// Only the right-hand panel is app state. The drilldown itself lives in the URL
// (see `useDrill`) so back/forward, refresh and shared links all work.
export const useNav = create<NavState>((set) => ({
  panel: null,
  openPanel: (panel) => set({ panel }),
  closePanel: () => set({ panel: null }),
}));

// `?from=` also says which testing context the case is being looked at in, so a
// run or finding filed from the drilldown lands in that app test / session
// instead of belonging to nothing.
export function scopeFromOrigin(from?: string | null): { appTestId?: string; sessionTestId?: string } {
  const [kind, id] = (from ?? "").split(":");
  if (kind === "app-test" && id) return { appTestId: id };
  if (kind === "session" && id) return { sessionTestId: id };
  return {};
}

export interface DrillIds {
  projectId?: string | null;
  featureId?: string | null;
  testCaseId?: string | null;
  issueId?: string | null;
}

// The canonical drilldown URL. Each level requires the one above it, so a
// half-filled object degrades to the deepest complete prefix.
export function drillPath({ projectId, featureId, testCaseId, issueId }: DrillIds): string {
  if (!projectId) return "/";
  let path = `/projects/${projectId}`;
  if (!featureId) return path;
  path += `/features/${featureId}`;
  if (!testCaseId) return path;
  path += `/test-cases/${testCaseId}`;
  if (!issueId) return path;
  return `${path}/issues/${issueId}`;
}

// Drilldown read from / written to the URL. `?from=` (breadcrumb origin) is
// carried along so the trail doesn't change identity halfway through.
export function useDrill() {
  const { projectId = null, featureId = null, testCaseId = null, issueId = null } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const from = params.get("from");

  const go = (ids: DrillIds) => {
    const path = drillPath(ids);
    useNav.getState().closePanel();
    // The origin trail (app test / session / issue list) only describes how the
    // test case was reached — above that level it's noise, so it's dropped.
    navigate(from && ids.testCaseId ? `${path}?from=${encodeURIComponent(from)}` : path);
  };

  return {
    projectId,
    featureId,
    testCaseId,
    issueId,
    // Where the drilldown was entered from: "app-test:<id>", "session:<id>",
    // "assigned", "issues", "pending", or null for the project hierarchy.
    from,
    goProject: (id: string | null) => go({ projectId: id }),
    goFeature: (id: string | null, pid?: string) => go({ projectId: pid ?? projectId, featureId: id }),
    goTestCase: (id: string | null) => go({ projectId, featureId, testCaseId: id }),
    goIssue: (id: string | null) => go({ projectId, featureId, testCaseId, issueId: id }),
    // One level up from wherever we are.
    up: () =>
      go(
        issueId
          ? { projectId, featureId, testCaseId }
          : testCaseId
            ? { projectId, featureId }
            : featureId
              ? { projectId }
              : {},
      ),
  };
}
