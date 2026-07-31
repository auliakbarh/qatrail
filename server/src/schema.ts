// GraphQL type definitions. M0: auth+health. M1: hierarchy. M2: records+issues.
export const typeDefs = /* GraphQL */ `
  enum Role { SUPER_ADMIN ADMIN QA_LEAD QA ENGINEER VIEWER }
  enum TestCaseApproval { PENDING APPROVED REJECTED }
  enum ApprovalRequestKind { MOVE COPY DELETE DEACTIVATE ACTIVATE }
  enum ApprovalTarget { PROJECT FEATURE TEST_CASE APP_TEST }
  enum AttachKind { IMAGE VIDEO MARKDOWN JSON DOC XLS CSV PDF OTHER }
  enum FindingType { DEFECT BUG }
  enum Platform { ANDROID IOS WEB }
  enum Environment { STAGING PRODUCTION }
  enum Priority { LOW MEDIUM HIGH }
  enum WorkStatus { OPEN IN_PROGRESS NEED_REVIEW IN_REVIEW CLOSED REOPENED HOLD }
  enum ReviewState { PENDING ACCEPTED NEED_CLARIFY REJECTED }
  enum TestResult { PASS FAIL BLOCKED }
  enum AppTestStatus { OPEN ASSIGNED IN_TESTING PASSED CLOSED }
  enum CommentTarget { ISSUE APP_TEST USER_TEST SESSION_TEST TEST_CASE }
  enum TestCaseKind { POSITIVE NEGATIVE }
  enum SessionKind { SIT UAT OTHER }
  enum SessionTestStatus { OPEN IN_TESTING PASSED CLOSED }
  # What happens to a moved app test's assignments (admin-only project move).
  enum MoveAssignmentMode { DROP CLONE }

  type User {
    id: ID!
    email: String!
    name: String!
    role: Role!
    mustChangePassword: Boolean!
    active: Boolean!
  }

  type AuthPayload {
    token: String!
    user: User!
  }

  type Health {
    status: String!
    apiVersion: String!
    maintenance: Boolean!
    maintenanceMessage: String
    jiraConfigured: Boolean!
    jiraBaseUrl: String
    ssoEnabled: Boolean!
  }

  type Coverage {
    total: Int!
    passed: Int!
    percent: Int!
  }

  type Project {
    id: ID!
    key: String!
    name: String!
    description: String
    squad: String
    minPassPercent: Int!
    featureCount: Int!
    coverage: Coverage!
    ready: Boolean!
    createdAt: String!
    updatedAt: String!
    # Retiring a project takes everything under it out of the live catalogue
    # without touching a single row below it.
    active: Boolean!
    pendingRequest: ApprovalRequest
  }

  type Feature {
    id: ID!
    key: String!
    projectId: ID!
    name: String!
    description: String
    minPassPercent: Int!
    testCaseCount: Int!
    coverage: Coverage!
    ready: Boolean!
    createdAt: String!
    updatedAt: String!
    project: Project!
    active: Boolean!
    pendingRequest: ApprovalRequest
  }

  type TestCaseStep {
    id: ID!
    order: Int!
    step: String!
    expectedResult: String
  }

  type Attachment {
    id: ID!
    order: Int!
    url: String!
    kind: AttachKind!
    label: String
  }

  type TestCase {
    id: ID!
    key: String!
    featureId: ID!
    name: String!
    description: String
    precondition: String
    note: String
    kind: TestCaseKind
    steps: [TestCaseStep!]!
    attachments: [Attachment!]!
    recordCount: Int!
    issueCount: Int!
    latestResult: String
    createdBy: User!
    createdAt: String!
    updatedAt: String!
    # Approval gate. Only APPROVED cases appear in the project lists, count
    # toward coverage, or accept assignments/records/issues.
    approval: TestCaseApproval!
    # Latest decision. Null on rows created before approval existed — the UI
    # shows a legacy label there instead of an approver.
    reviewedAt: String
    # First time it ever went live. A PENDING case with this set is a re-review of
    # an edit; without it, the case is brand new.
    firstApprovedAt: String
    reviewedBy: User
    rejectReason: String
    # True when the current viewer may approve/reject this very case.
    canApprove: Boolean!
    # Feature + project of this case, for the pending list and deep links.
    feature: Feature!
    # Retired cases keep their history but leave the catalogue entirely.
    active: Boolean!
    # The open move/copy/delete/(de)activate request, if any.
    pendingRequest: ApprovalRequest
  }

  # A change to existing content waiting for approval. The target keeps working
  # until the decision lands. Exactly one of project/feature/testCase is set,
  # matching the target field; label is the human name of whichever it is.
  type ApprovalRequest {
    id: ID!
    target: ApprovalTarget!
    kind: ApprovalRequestKind!
    state: TestCaseApproval!
    label: String!
    project: Project
    feature: Feature
    testCase: TestCase
    appTest: AppTest
    targetFeature: Feature
    targetProject: Project
    targetName: String
    # App test move only: what happens to its assignments.
    assignmentMode: MoveAssignmentMode
    requestedBy: User!
    requestedAt: String!
    reviewedBy: User
    reviewedAt: String
    rejectReason: String
    canApprove: Boolean!
    # True for the requester while the change is still undecided.
    canCancel: Boolean!
  }

  type RecordTest {
    id: ID!
    key: String!
    testCaseId: ID!
    executedBy: User!
    executedAt: String!
    note: String
    result: TestResult!
    retestIssueId: ID
    appTestId: ID
    appTestKey: String
    sessionTestId: ID
    sessionTestKey: String
    attachments: [Attachment!]!
    issueId: ID
    createdAt: String!
  }

  type Comment {
    id: ID!
    body: String!
    by: User!
    createdAt: String!
    updatedAt: String!
  }

  type StatusEvent {
    id: ID!
    kind: String!
    fromVal: String
    toVal: String
    by: User!
    note: String
    at: String!
  }

  type Postmortem {
    id: ID!
    rootCause: String!
    resolution: String!
    impact: String
    prevention: String
    resolvedBy: User!
    resolvedAt: String!
  }

  type Notification {
    id: ID!
    kind: String!
    message: String!
    issueId: ID
    appTestId: ID
    userTestId: ID
    sessionTestId: ID
    testCaseId: ID
    read: Boolean!
    createdAt: String!
  }

  type Setting {
    maintenanceMode: Boolean!
    maintenanceMessage: String
    discordEnabled: Boolean!
    discordWebhookUrl: String
    # Test case auto-approval, in hours. null = never (a human decides),
    # 0 = approved immediately, N = approved after waiting N hours undecided.
    # "New" covers new test cases; "Change" covers edit / move / copy / delete /
    # activate / deactivate.
    autoApproveNewHours: Int
    autoApproveChangeHours: Int
  }

  type SlaTargetType {
    priority: Priority!
    respondMins: Int
    resolveMins: Int!
  }

  type CreateUserResult {
    user: User!
    defaultPassword: String!
  }

  input UserInput {
    email: String!
    name: String!
    role: Role!
    active: Boolean
  }

  input SettingInput {
    maintenanceMode: Boolean
    maintenanceMessage: String
    discordEnabled: Boolean
    discordWebhookUrl: String
    autoApproveNewHours: Int
    autoApproveChangeHours: Int
  }

  input IssueFilter {
    search: String
    status: WorkStatus
    priority: Priority
    type: FindingType
    appTestId: ID
    sessionTestId: ID
    testCaseId: ID
    isProductionIssue: Boolean
  }
  type IssuePage {
    items: [Issue!]!
    total: Int!
  }

  type StatusCount { status: String!, count: Int! }
  type SlaBreakdown { met: Int!, atRisk: Int!, breached: Int! }
  type MonthPoint { period: String!, created: Int!, resolved: Int! }
  type KeyCoverage { featureId: ID!, projectId: ID!, name: String!, percent: Int!, passed: Int!, total: Int!, min: Int!, ready: Boolean! }

  # One person's work in the selected scope + date range. Every column is filled
  # for everyone; which ones matter depends on the role (QA runs tests, a QA lead
  # approves, an engineer resolves).
  type WorkloadRow {
    userId: ID!
    name: String!
    role: Role!
    testCasesCreated: Int!
    recordsRun: Int!
    issuesReported: Int!
    approvals: Int!
    appTestsSubmitted: Int!
    issuesAssigned: Int!
    issuesResolved: Int!
    avgResolveMins: Int
  }

  type Analytics {
    totalFindings: Int!
    totalDefects: Int!
    totalBugs: Int!
    resolutionRate: Int!       # % of issues resolved
    avgResolveMins: Int        # production, resolved
    slaCompliance: Int         # production, %
    confidence: Coverage!      # coverage for the selected scope
    statusBreakdown: [StatusCount!]!
    slaBreakdown: SlaBreakdown!
    createdVsResolved: [MonthPoint!]!
    keyCoverage: [KeyCoverage!]!
    workload: [WorkloadRow!]!
  }

  type Issue {
    id: ID!
    key: String!
    testCaseId: ID!
    featureId: ID!
    projectId: ID!
    recordTestId: ID
    recreatedFromId: ID
    appTestId: ID
    appTestKey: String
    sessionTestId: ID
    sessionTestKey: String
    jiraKey: String
    jiraCommentId: String
    type: FindingType!
    title: String!
    description: String!
    environment: Environment!
    platform: Platform!
    appVersion: String
    backendVersion: String
    testAccount: String!
    testPassword: String
    testedAt: String!
    preconditions: String
    steps: String!
    actualResult: String!
    expectedResult: String!
    priority: Priority!
    note: String
    status: WorkStatus!
    review: ReviewState!
    archived: Boolean!
    # True only when QA marked this as a real production issue (SLA applies).
    isProductionIssue: Boolean!
    # Whether the flag may still be toggled (prod env, not a testing finding, not resolved).
    canMarkProductionIssue: Boolean!
    slaStatus: String!
    reporter: User!
    assignee: User!
    attachments: [Attachment!]!
    history: [StatusEvent!]!
    postmortem: Postmortem
    respondedAt: String
    resolvedAt: String
    closedAt: String
    createdAt: String!
    updatedAt: String!
  }

  input StepInput {
    step: String!
    expectedResult: String
  }
  input AttachmentInput {
    url: String!
    kind: AttachKind!
    label: String
  }
  input ProjectInput {
    name: String!
    description: String
    squad: String
    minPassPercent: Int!
  }
  input FeatureInput {
    name: String!
    description: String
    minPassPercent: Int!
  }
  input TestCaseInput {
    name: String!
    description: String
    precondition: String
    note: String
    kind: TestCaseKind
    steps: [StepInput!]!
    attachments: [AttachmentInput!]!
  }
  # Bulk CSV import — kind is a loose String (validated server-side); feature
  # name only used at project scope (auto-created if missing).
  input ImportTestCaseInput {
    feature: String
    name: String!
    description: String
    precondition: String
    note: String
    kind: String
    steps: [StepInput!]!
  }
  type ImportRowError {
    row: Int!
    message: String!
  }
  type ImportResult {
    ok: Boolean!
    testCaseCount: Int!
    stepCount: Int!
    newFeatures: [String!]!
    errors: [ImportRowError!]!
  }
  type BulkApproveResult {
    approved: Int!
    skipped: Int!
  }
  type TestCaseExportStep {
    step: String!
    expectedResult: String
  }
  type TestCaseExport {
    featureName: String!
    name: String!
    description: String
    precondition: String
    note: String
    kind: String
    steps: [TestCaseExportStep!]!
  }
  input RecordTestInput {
    executedAt: String!
    note: String
    result: TestResult!
    retestIssueId: ID
    appTestId: ID
    sessionTestId: ID
    attachments: [AttachmentInput!]!
  }
  # One row of a bulk run. Scope (app test / session) and the run's timestamp are
  # shared by the whole batch, so they live on the mutation, not here.
  input BulkRecordTestInput {
    testCaseId: ID!
    result: TestResult!
    note: String
    attachments: [AttachmentInput!]!
  }
  # One row of a bulk retest. The run's scope comes from the issue itself, so it
  # can't be passed in wrong.
  input BulkRetestInput {
    issueId: ID!
    result: TestResult!
    note: String
    attachments: [AttachmentInput!]!
  }
  # Rights and eligibility differ per row, so ineligible ones are counted, not fatal.
  type BulkRetestResult {
    retested: Int!
    skipped: Int!
  }
  input PostmortemInput {
    rootCause: String!
    resolution: String!
    impact: String
    prevention: String
  }

  input IssueInput {
    testCaseId: ID!
    recordTestId: ID
    recreatedFromId: ID
    type: FindingType!
    title: String!
    description: String!
    environment: Environment!
    platform: Platform!
    appVersion: String
    backendVersion: String
    testAccount: String!
    testPassword: String
    testedAt: String!
    preconditions: String
    steps: String!
    actualResult: String!
    expectedResult: String!
    priority: Priority!
    note: String
    isProductionIssue: Boolean
    assigneeId: ID!
    appTestId: ID
    sessionTestId: ID
    attachments: [AttachmentInput!]!
  }

  type AppTest {
    id: ID!
    key: String!
    projectId: ID!
    projectName: String!
    createdBy: User!
    environment: Environment!
    platform: Platform!
    appVersion: String
    backendVersion: String
    downloadLink: String!
    note: String
    jiraTickets: [String!]!
    status: AppTestStatus!
    coverage: Coverage!
    passPercent: Int!
    issueCount: Int!
    assignedCount: Int!
    doneTestAt: String
    createdAt: String!
    updatedAt: String!
    builds: [AppTestBuild!]!
  }

  # One submitted build of an app test (newest = the app test's current link).
  type AppTestBuild {
    id: ID!
    downloadLink: String!
    appVersion: String
    backendVersion: String
    note: String
    createdBy: User!
    createdAt: String!
  }

  # A test case as assigned to an app test, with per-app-test progress.
  type AssignedTestCase {
    id: ID!            # AppTestCase row id
    testCase: TestCase!
    featureId: ID!
    featureName: String!
    status: String!    # PASSED | FAILED | BLOCKED | IN_TESTING | NOT_STARTED
    issueCount: Int!
    assignedBy: User!
    assignedAt: String!
    doneTestAt: String
  }

  input AppTestInput {
    projectId: ID!
    environment: Environment!
    platform: Platform!
    appVersion: String
    backendVersion: String
    downloadLink: String!
    note: String
    jiraTickets: [String!]!
  }

  input AppTestBuildInput {
    downloadLink: String!
    appVersion: String
    backendVersion: String
    note: String
  }

  # A reusable test credential for a project+environment.
  type UserTest {
    id: ID!
    key: String!
    projectId: ID!
    projectName: String!
    createdBy: User!
    account: String!
    password: String
    environment: Environment!
    note: String
    createdAt: String!
    updatedAt: String!
  }

  input UserTestInput {
    projectId: ID!
    account: String!
    password: String
    environment: Environment!
    note: String
  }

  # A testing session (SIT/UAT/other): the reporting unit a sign-off is made
  # from. status/passPercent are derived per request, never stored.
  type SessionTest {
    id: ID!
    key: String!
    projectId: ID!
    projectName: String!
    createdBy: User!
    testedAt: String!
    kind: SessionKind!
    kindOther: String
    kindLabel: String!        # "SIT" / "UAT" / the free-text label
    stakeholders: [String!]!
    minPassPercent: Int!
    note: String
    summary: String
    status: SessionTestStatus!
    coverage: Coverage!
    passPercent: Int!
    issueCount: Int!
    caseCount: Int!
    recordCount: Int!
    apps: [SessionTestApp!]!
    closedAt: String
    createdAt: String!
    updatedAt: String!
  }

  # One app under test in a session. Versions are a snapshot taken when the app
  # was added — an app test keeps mirroring its newest build, this must not.
  type SessionTestApp {
    id: ID!
    appTestId: ID
    appTestKey: String
    name: String!
    versionFe: String
    versionBe: String
    environment: Environment
    platform: Platform
    note: String
    createdAt: String!
  }

  # A test case pulled into a session, with its progress inside that session.
  type SessionTestCaseRow {
    id: ID!                   # SessionTestCase row id
    testCase: TestCase!
    featureId: ID!
    featureName: String!
    status: String!           # PASSED | FAILED | BLOCKED | NOT_STARTED
    issueCount: Int!
    apps: [SessionTestApp!]!
    assignedBy: User!
    assignedAt: String!
    doneTestAt: String
  }

  input SessionTestInput {
    projectId: ID!
    testedAt: String!
    kind: SessionKind!
    kindOther: String
    stakeholders: [String!]!
    minPassPercent: Int!
    note: String
  }

  input SessionTestAppInput {
    appTestId: ID
    name: String
    versionFe: String
    versionBe: String
    environment: Environment
    platform: Platform
    note: String
  }

  type Query {
    health: Health!
    me: User
    engineers: [User!]!
    mentionableUsers: [User!]!

    projects(includeInactive: Boolean): [Project!]!
    project(id: ID!): Project
    features(projectId: ID!, includeInactive: Boolean): [Feature!]!
    feature(id: ID!): Feature
    # APPROVED + active cases — the live catalogue. Pass includeInactive to also
    # see retired ones (so they can be revived).
    testCases(featureId: ID!, includeInactive: Boolean): [TestCase!]!
    # Any case regardless of approval: everyone may read, comment and watch one
    # that is still awaiting review.
    testCase(id: ID!): TestCase
    # Cases awaiting a decision: PENDING + REJECTED, oldest first.
    pendingTestCases(projectId: ID): [TestCase!]!
    # Open move/copy/delete/(de)activate requests, oldest first.
    pendingApprovalRequests(projectId: ID): [ApprovalRequest!]!
    # PENDING cases + open requests the current user may actually approve —
    # drives the nav badge.
    pendingApprovalCount: Int!
    exportTestCases(projectId: ID, featureId: ID): [TestCaseExport!]!

    recordTests(testCaseId: ID!): [RecordTest!]!
    issues(testCaseId: ID, archived: Boolean): [Issue!]!
    issue(id: ID!): Issue
    assignedToMe: [Issue!]!
    comments(target: CommentTarget!, targetId: ID!): [Comment!]!

    appTests(projectId: ID): [AppTest!]!
    appTest(id: ID!): AppTest
    assignedTestCases(appTestId: ID!): [AssignedTestCase!]!
    assignableTestCases(appTestId: ID!): [TestCase!]!

    userTests(projectId: ID): [UserTest!]!
    userTest(id: ID!): UserTest

    sessionTests(projectId: ID): [SessionTest!]!
    sessionTest(id: ID!): SessionTest
    sessionTestCases(sessionTestId: ID!): [SessionTestCaseRow!]!
    sessionAssignableTestCases(sessionTestId: ID!): [TestCase!]!
    sessionTestRecords(sessionTestId: ID!): [RecordTest!]!
    # App tests of the session's project that aren't linked to it yet.
    sessionLinkableAppTests(sessionTestId: ID!): [AppTest!]!

    isWatching(target: CommentTarget!, targetId: ID!): Boolean!
    suggestions(field: String!): [String!]!

    notifications: [Notification!]!
    unreadCount: Int!

    issuesPaged(scope: String, filter: IssueFilter, sort: String, dir: String, page: Int, pageSize: Int): IssuePage!

    analytics(projectId: ID, featureId: ID, sessionTestId: ID, from: String, to: String): Analytics!

    users: [User!]!
    setting: Setting!
    slaTargets: [SlaTargetType!]!
    auditLogs(limit: Int): [AuditLog!]!
  }

  type AuditLog {
    id: ID!
    action: String!
    entityId: String
    label: String
    actor: String
    at: String!
  }

  type Mutation {
    login(email: String!, password: String!): AuthPayload!
    microsoftLogin(idToken: String!): AuthPayload!
    changePassword(currentPassword: String!, newPassword: String!): Boolean!
    forgotPassword(email: String!): Boolean!
    resetPassword(token: String!, newPassword: String!): Boolean!

    createProject(input: ProjectInput!): Project!
    updateProject(id: ID!, input: ProjectInput!): Project!
    # Goes through approval: the project keeps working until the decision lands.
    deleteProject(id: ID!): Boolean!
    setProjectActive(id: ID!, active: Boolean!): Project!
    cloneProject(id: ID!, name: String): Project!

    createFeature(projectId: ID!, input: FeatureInput!): Feature!
    updateFeature(id: ID!, input: FeatureInput!): Feature!
    deleteFeature(id: ID!): Boolean!
    setFeatureActive(id: ID!, active: Boolean!): Feature!
    cloneFeature(id: ID!, targetProjectId: ID!, name: String): Feature!
    moveFeature(id: ID!, projectId: ID!): Feature!

    createTestCase(featureId: ID!, input: TestCaseInput!): TestCase!
    updateTestCase(id: ID!, input: TestCaseInput!): TestCase!
    deleteTestCase(id: ID!): Boolean!
    moveTestCase(id: ID!, featureId: ID!): TestCase!
    cloneTestCase(id: ID!, targetFeatureId: ID!, name: String): TestCase!
    importTestCases(projectId: ID, featureId: ID, dryRun: Boolean!, rows: [ImportTestCaseInput!]!): ImportResult!
    # Retire / revive a case. Goes through approval like any other change, so the
    # returned case may still be unchanged with a pendingRequest attached.
    setTestCaseActive(id: ID!, active: Boolean!): TestCase!
    approveApprovalRequest(id: ID!): ApprovalRequest!
    approveApprovalRequests(ids: [ID!]!): BulkApproveResult!
    rejectApprovalRequest(id: ID!, reason: String!): ApprovalRequest!
    # Withdraw your own pending request.
    cancelApprovalRequest(id: ID!): Boolean!
    approveTestCase(id: ID!): TestCase!
    # Bulk approve. Not all-or-nothing: rights differ per creator, so cases the
    # actor may not approve are skipped instead of failing the batch.
    approveTestCases(ids: [ID!]!): BulkApproveResult!
    rejectTestCase(id: ID!, reason: String!): TestCase!

    createRecordTest(testCaseId: ID!, input: RecordTestInput!): RecordTest!
    # Record several runs of one app test / session in one go. All-or-nothing:
    # everything that can fail here is the QA's own input, so a bad row means fix
    # and resend, not a half-written batch.
    createRecordTests(executedAt: String!, appTestId: ID, sessionTestId: ID, inputs: [BulkRecordTestInput!]!): [RecordTest!]!
    deleteRecordTest(id: ID!): Boolean!

    createIssue(input: IssueInput!): Issue!
    updateIssue(id: ID!, input: IssueInput!): Issue!
    deleteIssue(id: ID!): Boolean!

    # Engineer actions
    issueAccept(id: ID!): Issue!
    issueReject(id: ID!, reason: String!): Issue!
    issueNeedClarify(id: ID!, note: String!): Issue!
    issueSolve(id: ID!, postmortem: PostmortemInput!): Issue!
    issueHold(id: ID!): Issue!
    issueResume(id: ID!): Issue!
    # QA actions
    issueClarifyRespond(id: ID!, note: String): Issue!
    issueReview(id: ID!, pass: Boolean!, note: String): Issue!
    # Retest several issues waiting for review at once: one record each (carrying
    # the issue's own scope) plus the review it implies. Not all-or-nothing —
    # an issue an engineer moved a second ago is skipped, not a batch failure.
    bulkRetest(executedAt: String!, inputs: [BulkRetestInput!]!): BulkRetestResult!
    issueReopen(id: ID!, note: String): Issue!
    setIssueArchived(id: ID!, archived: Boolean!): Issue!
    setProductionIssue(id: ID!, value: Boolean!): Issue!
    # Re-point a finding at an app test or a testing session (pass neither to unlink).
    setIssueScope(id: ID!, appTestId: ID, sessionTestId: ID): Issue!
    postIssueToJira(id: ID!, jiraKey: String!): Issue!

    bulkArchiveIssues(ids: [ID!]!, archived: Boolean!): Int!
    bulkAssignIssues(ids: [ID!]!, assigneeId: ID!): Int!
    bulkDeleteIssues(ids: [ID!]!): Int!

    addComment(target: CommentTarget!, targetId: ID!, body: String!): Comment!
    updateComment(id: ID!, body: String!): Comment!
    deleteComment(id: ID!): Boolean!

    createAppTest(input: AppTestInput!): AppTest!
    updateAppTest(id: ID!, input: AppTestInput!): AppTest!
    addAppTestBuild(appTestId: ID!, input: AppTestBuildInput!): AppTest!
    deleteAppTest(id: ID!): Boolean!
    assignTestCases(appTestId: ID!, testCaseIds: [ID!]!): AppTest!
    assignFeatureTestCases(appTestId: ID!, featureId: ID!): AppTest!
    unassignTestCase(appTestId: ID!, testCaseId: ID!): AppTest!
    closeAppTestTesting(appTestId: ID!): AppTest!
    postAppTestToJira(id: ID!): AppTest!
    # Admin-only: move an app test to another project. Its assignments point at
    # the old project's test cases, so DROP releases them, CLONE copies them over.
    moveAppTestProject(id: ID!, projectId: ID!, mode: MoveAssignmentMode!): AppTest!

    createSessionTest(input: SessionTestInput!): SessionTest!
    updateSessionTest(id: ID!, input: SessionTestInput!): SessionTest!
    deleteSessionTest(id: ID!): Boolean!
    addSessionTestApp(sessionTestId: ID!, input: SessionTestAppInput!): SessionTest!
    updateSessionTestApp(id: ID!, input: SessionTestAppInput!): SessionTest!
    removeSessionTestApp(id: ID!): SessionTest!
    assignSessionTestCases(sessionTestId: ID!, testCaseIds: [ID!]!, appIds: [ID!]!): SessionTest!
    setSessionTestCaseApps(sessionTestCaseId: ID!, appIds: [ID!]!): SessionTest!
    unassignSessionTestCase(sessionTestId: ID!, testCaseId: ID!): SessionTest!
    closeSessionTest(id: ID!, summary: String!): SessionTest!

    createUserTest(input: UserTestInput!): UserTest!
    updateUserTest(id: ID!, input: UserTestInput!): UserTest!
    deleteUserTest(id: ID!): Boolean!

    setWatch(target: CommentTarget!, targetId: ID!, watching: Boolean!): Boolean!

    markNotificationRead(id: ID!): Boolean!
    markAllNotificationsRead: Boolean!

    createUser(input: UserInput!): CreateUserResult!
    updateUser(id: ID!, input: UserInput!): User!
    deleteUser(id: ID!): Boolean!
    resetUserPassword(id: ID!): String!

    updateSetting(input: SettingInput!): Setting!
    testDiscord(url: String!): Boolean!
    updateSlaTarget(priority: Priority!, respondMins: Int, resolveMins: Int!): SlaTargetType!
  }

  type Subscription {
    notificationAdded: Notification!
  }
`;
