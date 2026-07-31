// A FAIL run opens an issue form. What that form starts with — the link back to
// the run plus whatever the testing context already knows — is decided here, so
// the single-run and bulk-run paths can't drift apart.
export interface AppTestCtx {
  environment: string;
  platform: string;
  appVersion?: string | null;
  backendVersion?: string | null;
  createdBy?: { id: string; name: string };
}
export interface SessionAppCtx {
  id: string;
  name: string;
  environment?: string | null;
  platform?: string | null;
  versionFe?: string | null;
  versionBe?: string | null;
}

export function issuePrefill(args: {
  record: { id: string; executedAt: string };
  testCaseId: string;
  featureId: string;
  appTestId?: string;
  appTest?: AppTestCtx;
  sessionTestId?: string;
  sessionApps?: SessionAppCtx[];
}) {
  // With two or more related apps, guessing which one failed would be a lie —
  // only a single app may prefill the issue.
  const onlyApp = args.sessionApps?.length === 1 ? args.sessionApps[0] : undefined;
  return {
    recordTestId: args.record.id,
    testedAt: args.record.executedAt,
    appTestId: args.appTestId,
    sessionTestId: args.sessionTestId,
    testCaseId: args.testCaseId,
    featureId: args.featureId,
    fromAppTest: !!args.appTestId,
    environment: args.appTest?.environment ?? onlyApp?.environment ?? undefined,
    platform: args.appTest?.platform ?? onlyApp?.platform ?? undefined,
    appVersion: args.appTest?.appVersion ?? onlyApp?.versionFe ?? undefined,
    backendVersion: args.appTest?.backendVersion ?? onlyApp?.versionBe ?? undefined,
    assignee: args.appTest?.createdBy,
  };
}
