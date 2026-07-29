// GraphQL type definitions. M0: auth+health. M1: hierarchy. M2: records+issues.
export const typeDefs = /* GraphQL */ `
  enum Role { SUPER_ADMIN ADMIN QA ENGINEER VIEWER }
  enum AttachKind { IMAGE VIDEO MARKDOWN JSON DOC XLS CSV PDF OTHER }
  enum FindingType { DEFECT BUG }
  enum Platform { ANDROID IOS WEB }
  enum Environment { STAGING PRODUCTION }
  enum Priority { LOW MEDIUM HIGH }
  enum WorkStatus { OPEN IN_PROGRESS NEED_REVIEW IN_REVIEW CLOSED REOPENED HOLD }
  enum ReviewState { PENDING ACCEPTED NEED_CLARIFY REJECTED }
  enum TestResult { PASS FAIL }
  enum AppTestStatus { OPEN ASSIGNED IN_TESTING PASSED CLOSED }
  enum CommentTarget { ISSUE APP_TEST USER_TEST SESSION_TEST }
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
    name: String!
    description: String
    squad: String
    minPassPercent: Int!
    featureCount: Int!
    coverage: Coverage!
    ready: Boolean!
    createdAt: String!
    updatedAt: String!
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
    read: Boolean!
    createdAt: String!
  }

  type Setting {
    maintenanceMode: Boolean!
    maintenanceMessage: String
    discordEnabled: Boolean!
    discordWebhookUrl: String
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
    status: String!    # PASSED | FAILED | IN_TESTING | NOT_STARTED
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
    status: String!           # PASSED | FAILED | NOT_STARTED
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

    projects: [Project!]!
    project(id: ID!): Project
    features(projectId: ID!): [Feature!]!
    feature(id: ID!): Feature
    testCases(featureId: ID!): [TestCase!]!
    testCase(id: ID!): TestCase
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
    deleteProject(id: ID!): Boolean!
    cloneProject(id: ID!, name: String): Project!

    createFeature(projectId: ID!, input: FeatureInput!): Feature!
    updateFeature(id: ID!, input: FeatureInput!): Feature!
    deleteFeature(id: ID!): Boolean!
    cloneFeature(id: ID!, targetProjectId: ID!, name: String): Feature!
    moveFeature(id: ID!, projectId: ID!): Feature!

    createTestCase(featureId: ID!, input: TestCaseInput!): TestCase!
    updateTestCase(id: ID!, input: TestCaseInput!): TestCase!
    deleteTestCase(id: ID!): Boolean!
    moveTestCase(id: ID!, featureId: ID!): TestCase!
    cloneTestCase(id: ID!, targetFeatureId: ID!, name: String): TestCase!
    importTestCases(projectId: ID, featureId: ID, dryRun: Boolean!, rows: [ImportTestCaseInput!]!): ImportResult!

    createRecordTest(testCaseId: ID!, input: RecordTestInput!): RecordTest!
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
    issueReopen(id: ID!, note: String): Issue!
    setIssueArchived(id: ID!, archived: Boolean!): Issue!
    setProductionIssue(id: ID!, value: Boolean!): Issue!
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
