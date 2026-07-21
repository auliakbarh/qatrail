import { create } from "zustand";

export type PanelKind = "project" | "feature" | "testcase" | "record" | "issue";
export interface PanelState {
  kind: PanelKind;
  mode: "create" | "edit";
  id?: string; // present for edit
  initial?: any; // prefilled row for edit (project/feature); testcase refetches for steps
}

interface NavState {
  projectId: string | null;
  featureId: string | null;
  testCaseId: string | null;
  panel: PanelState | null;

  selectProject: (id: string | null) => void;
  selectFeature: (id: string | null) => void;
  selectTestCase: (id: string | null) => void;
  openPanel: (p: PanelState) => void;
  closePanel: () => void;
}

export const useNav = create<NavState>((set) => ({
  projectId: null,
  featureId: null,
  testCaseId: null,
  panel: null,

  selectProject: (id) => set({ projectId: id, featureId: null, testCaseId: null, panel: null }),
  selectFeature: (id) => set({ featureId: id, testCaseId: null, panel: null }),
  selectTestCase: (id) => set({ testCaseId: id, panel: null }),
  openPanel: (panel) => set({ panel }),
  closePanel: () => set({ panel: null }),
}));
