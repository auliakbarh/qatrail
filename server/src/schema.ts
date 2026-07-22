// GraphQL type definitions. M0: auth+health. M1: hierarchy. M2: records+issues.
export const typeDefs = /* GraphQL */ `
  enum Role { SUPER_ADMIN ADMIN QA ENGINEER }
  enum AttachKind { IMAGE VIDEO MARKDOWN JSON DOC XLS CSV PDF OTHER }
  enum FindingType { DEFECT BUG }
  enum Platform { ANDROID IOS WEB }
  enum Environment { STAGING PRODUCTION }
  enum Priority { LOW MEDIUM HIGH }
  enum WorkStatus { OPEN IN_PROGRESS NEED_REVIEW IN_REVIEW CLOSED REOPENED HOLD }
  enum ReviewState { PENDING ACCEPTED NEED_CLARIFY REJECTED }
  enum TestResult { PASS FAIL }

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
    steps: [TestCaseStep!]!
    attachments: [Attachment!]!
    recordCount: Int!
    issueCount: Int!
    latestResult: String
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
    attachments: [Attachment!]!
    issueId: ID
    createdAt: String!
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
    steps: [StepInput!]!
    attachments: [AttachmentInput!]!
  }
  input RecordTestInput {
    executedAt: String!
    note: String
    result: TestResult!
    retestIssueId: ID
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
    assigneeId: ID!
    attachments: [AttachmentInput!]!
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

    recordTests(testCaseId: ID!): [RecordTest!]!
    issues(testCaseId: ID, archived: Boolean): [Issue!]!
    issue(id: ID!): Issue
    assignedToMe: [Issue!]!

    notifications: [Notification!]!
    unreadCount: Int!

    issuesPaged(scope: String, filter: IssueFilter, sort: String, dir: String, page: Int, pageSize: Int): IssuePage!

    analytics(projectId: ID, featureId: ID, from: String, to: String): Analytics!

    users: [User!]!
    setting: Setting!
    slaTargets: [SlaTargetType!]!
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

    createFeature(projectId: ID!, input: FeatureInput!): Feature!
    updateFeature(id: ID!, input: FeatureInput!): Feature!
    deleteFeature(id: ID!): Boolean!

    createTestCase(featureId: ID!, input: TestCaseInput!): TestCase!
    updateTestCase(id: ID!, input: TestCaseInput!): TestCase!
    deleteTestCase(id: ID!): Boolean!
    moveTestCase(id: ID!, featureId: ID!): TestCase!

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
    postIssueToJira(id: ID!, jiraKey: String!): Issue!

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
