import { gql } from "@apollo/client";

const SESSION_APP_FIELDS = `
  id appTestId appTestKey name versionFe versionBe environment platform note createdAt
`;

const SESSION_FIELDS = `
  id key projectId projectName testedAt kind kindOther kindLabel stakeholders
  minPassPercent jiraTickets note summary status passPercent issueCount caseCount recordCount
  coverage { total passed percent }
  closedAt createdAt updatedAt
  createdBy { id name }
`;

export const SESSION_TESTS = gql`
  query SessionTests($projectId: ID) {
    sessionTests(projectId: $projectId) { ${SESSION_FIELDS} }
  }
`;

export const SESSION_TEST = gql`
  query SessionTest($id: ID!) {
    sessionTest(id: $id) {
      ${SESSION_FIELDS}
      apps { ${SESSION_APP_FIELDS} }
    }
  }
`;

export const SESSION_TEST_CASES = gql`
  query SessionTestCases($sessionTestId: ID!) {
    sessionTestCases(sessionTestId: $sessionTestId) {
      id status issueCount assignedAt doneTestAt featureId featureName
      testCase { id key name }
      # environment/platform/versions feed the issue prefill when a case relates
      # to exactly one app (lib/issuePrefill.ts).
      apps { id name appTestKey environment platform versionFe versionBe }
      assignedBy { id name }
    }
  }
`;

export const SESSION_ASSIGNABLE_TEST_CASES = gql`
  query SessionAssignableTestCases($sessionTestId: ID!) {
    sessionAssignableTestCases(sessionTestId: $sessionTestId) { id key name featureId }
  }
`;

export const SESSION_TEST_RECORDS = gql`
  query SessionTestRecords($sessionTestId: ID!) {
    sessionTestRecords(sessionTestId: $sessionTestId) {
      id key testCaseId result executedAt note issueId
      executedBy { id name }
    }
  }
`;

export const SESSION_LINKABLE_APP_TESTS = gql`
  query SessionLinkableAppTests($sessionTestId: ID!) {
    sessionLinkableAppTests(sessionTestId: $sessionTestId) {
      id key platform environment appVersion backendVersion status
    }
  }
`;

export const CREATE_SESSION_TEST = gql`
  mutation CreateSessionTest($input: SessionTestInput!) {
    createSessionTest(input: $input) { id }
  }
`;
export const UPDATE_SESSION_TEST = gql`
  mutation UpdateSessionTest($id: ID!, $input: SessionTestInput!) {
    updateSessionTest(id: $id, input: $input) { id }
  }
`;
export const POST_SESSION_TEST_TO_JIRA = gql`
  mutation PostSessionTestToJira($id: ID!) {
    postSessionTestToJira(id: $id) { id }
  }
`;
export const DELETE_SESSION_TEST = gql`
  mutation DeleteSessionTest($id: ID!) { deleteSessionTest(id: $id) }
`;
export const ADD_SESSION_TEST_APP = gql`
  mutation AddSessionTestApp($sessionTestId: ID!, $input: SessionTestAppInput!) {
    addSessionTestApp(sessionTestId: $sessionTestId, input: $input) { id }
  }
`;
export const UPDATE_SESSION_TEST_APP = gql`
  mutation UpdateSessionTestApp($id: ID!, $input: SessionTestAppInput!) {
    updateSessionTestApp(id: $id, input: $input) { id }
  }
`;
export const REMOVE_SESSION_TEST_APP = gql`
  mutation RemoveSessionTestApp($id: ID!) {
    removeSessionTestApp(id: $id) { id }
  }
`;
export const ASSIGN_SESSION_TEST_CASES = gql`
  mutation AssignSessionTestCases($sessionTestId: ID!, $testCaseIds: [ID!]!, $appIds: [ID!]!) {
    assignSessionTestCases(sessionTestId: $sessionTestId, testCaseIds: $testCaseIds, appIds: $appIds) { id status }
  }
`;
export const SET_SESSION_TEST_CASE_APPS = gql`
  mutation SetSessionTestCaseApps($sessionTestCaseId: ID!, $appIds: [ID!]!) {
    setSessionTestCaseApps(sessionTestCaseId: $sessionTestCaseId, appIds: $appIds) { id }
  }
`;
export const UNASSIGN_SESSION_TEST_CASE = gql`
  mutation UnassignSessionTestCase($sessionTestId: ID!, $testCaseId: ID!) {
    unassignSessionTestCase(sessionTestId: $sessionTestId, testCaseId: $testCaseId) { id status }
  }
`;
export const CLOSE_SESSION_TEST = gql`
  mutation CloseSessionTest($id: ID!, $summary: String!) {
    closeSessionTest(id: $id, summary: $summary) { id status summary closedAt }
  }
`;
export const MOVE_APP_TEST_PROJECT = gql`
  mutation MoveAppTestProject($id: ID!, $projectId: ID!, $mode: MoveAssignmentMode!) {
    moveAppTestProject(id: $id, projectId: $projectId, mode: $mode) { id projectId projectName status }
  }
`;
