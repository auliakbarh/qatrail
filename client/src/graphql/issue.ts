import { gql } from "@apollo/client";

export const ENGINEERS = gql`
  query Engineers {
    engineers { id name email }
  }
`;

export const RECORD_TESTS = gql`
  query RecordTests($testCaseId: ID!) {
    recordTests(testCaseId: $testCaseId) {
      id key executedAt result note issueId retestIssueId appTestId appTestKey sessionTestId sessionTestKey
      executedBy { id name }
      attachments { order url kind label }
      createdAt
    }
  }
`;

export const CREATE_RECORD_TEST = gql`
  mutation CreateRecordTest($testCaseId: ID!, $input: RecordTestInput!) {
    createRecordTest(testCaseId: $testCaseId, input: $input) {
      id result executedAt
    }
  }
`;

export const CREATE_RECORD_TESTS = gql`
  mutation CreateRecordTests($executedAt: String!, $appTestId: ID, $sessionTestId: ID, $inputs: [BulkRecordTestInput!]!) {
    createRecordTests(executedAt: $executedAt, appTestId: $appTestId, sessionTestId: $sessionTestId, inputs: $inputs) {
      id result executedAt testCaseId
    }
  }
`;

export const DELETE_RECORD_TEST = gql`
  mutation DeleteRecordTest($id: ID!) { deleteRecordTest(id: $id) }
`;

const ISSUE_FIELDS = `
  id key testCaseId featureId projectId recordTestId recreatedFromId appTestId appTestKey sessionTestId sessionTestKey jiraKey jiraCommentId
  type title description environment platform
  appVersion backendVersion testAccount testPassword testedAt preconditions
  steps actualResult expectedResult priority note status review archived
  isProductionIssue canMarkProductionIssue slaStatus
  reporter { id name } assignee { id name }
  attachments { order url kind label }
  history { id kind fromVal toVal note at by { id name } }
  postmortem { id rootCause resolution impact prevention resolvedAt resolvedBy { id name } }
  respondedAt resolvedAt closedAt createdAt updatedAt
`;

export const ISSUES = gql`
  query Issues($testCaseId: ID, $archived: Boolean) {
    issues(testCaseId: $testCaseId, archived: $archived) {
      id key title type priority status review environment platform archived slaStatus
      appTestId appTestKey sessionTestId sessionTestKey
      assignee { id name } reporter { id name } createdAt
    }
  }
`;

export const ISSUE = gql`
  query Issue($id: ID!) {
    issue(id: $id) { ${ISSUE_FIELDS} }
  }
`;

export const ISSUES_PAGED = gql`
  query IssuesPaged($scope: String, $filter: IssueFilter, $sort: String, $dir: String, $page: Int, $pageSize: Int) {
    issuesPaged(scope: $scope, filter: $filter, sort: $sort, dir: $dir, page: $page, pageSize: $pageSize) {
      items {
        id key title type priority status review environment platform slaStatus isProductionIssue createdAt
        appTestId appTestKey sessionTestId sessionTestKey
        assignee { id name } reporter { id name }
      }
      total
    }
  }
`;

export const ASSIGNED_TO_ME = gql`
  query AssignedToMe {
    assignedToMe {
      id key title type priority status review environment platform slaStatus createdAt
    }
  }
`;

export const CREATE_ISSUE = gql`
  mutation CreateIssue($input: IssueInput!) {
    createIssue(input: $input) { id }
  }
`;

export const UPDATE_ISSUE = gql`
  mutation UpdateIssue($id: ID!, $input: IssueInput!) {
    updateIssue(id: $id, input: $input) { id }
  }
`;

export const DELETE_ISSUE = gql`
  mutation DeleteIssue($id: ID!) { deleteIssue(id: $id) }
`;

export const BULK_ARCHIVE = gql`mutation($ids:[ID!]!,$archived:Boolean!){ bulkArchiveIssues(ids:$ids,archived:$archived) }`;
export const BULK_ASSIGN = gql`mutation($ids:[ID!]!,$assigneeId:ID!){ bulkAssignIssues(ids:$ids,assigneeId:$assigneeId) }`;
export const BULK_DELETE = gql`mutation($ids:[ID!]!){ bulkDeleteIssues(ids:$ids) }`;

export const POST_ISSUE_TO_JIRA = gql`
  mutation PostIssueToJira($id: ID!, $jiraKey: String!) {
    postIssueToJira(id: $id, jiraKey: $jiraKey) { id jiraKey jiraCommentId }
  }
`;
