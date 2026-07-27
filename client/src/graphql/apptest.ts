import { gql } from "@apollo/client";

const APP_TEST_FIELDS = `
  id key projectId projectName environment platform appVersion backendVersion
  downloadLink note jiraTickets status
  coverage { total passed percent } passPercent issueCount assignedCount
  doneTestAt createdAt updatedAt
  createdBy { id name }
`;

export const APP_TESTS = gql`
  query AppTests($projectId: ID) {
    appTests(projectId: $projectId) { ${APP_TEST_FIELDS} }
  }
`;

export const APP_TEST = gql`
  query AppTest($id: ID!) {
    appTest(id: $id) {
      ${APP_TEST_FIELDS}
      builds { id downloadLink appVersion backendVersion note createdAt createdBy { id name } }
    }
  }
`;

export const ASSIGNED_TEST_CASES = gql`
  query AssignedTestCases($appTestId: ID!) {
    assignedTestCases(appTestId: $appTestId) {
      id status issueCount assignedAt doneTestAt featureId featureName
      testCase { id key name }
      assignedBy { id name }
    }
  }
`;

export const ASSIGNABLE_TEST_CASES = gql`
  query AssignableTestCases($appTestId: ID!) {
    assignableTestCases(appTestId: $appTestId) {
      id key name featureId
    }
  }
`;

export const CREATE_APP_TEST = gql`
  mutation CreateAppTest($input: AppTestInput!) {
    createAppTest(input: $input) { id }
  }
`;
export const UPDATE_APP_TEST = gql`
  mutation UpdateAppTest($id: ID!, $input: AppTestInput!) {
    updateAppTest(id: $id, input: $input) { id }
  }
`;
export const ADD_APP_TEST_BUILD = gql`
  mutation AddAppTestBuild($appTestId: ID!, $input: AppTestBuildInput!) {
    addAppTestBuild(appTestId: $appTestId, input: $input) { id }
  }
`;
export const DELETE_APP_TEST = gql`
  mutation DeleteAppTest($id: ID!) { deleteAppTest(id: $id) }
`;
export const ASSIGN_TEST_CASES = gql`
  mutation AssignTestCases($appTestId: ID!, $testCaseIds: [ID!]!) {
    assignTestCases(appTestId: $appTestId, testCaseIds: $testCaseIds) { id status }
  }
`;
export const ASSIGN_FEATURE_TEST_CASES = gql`
  mutation AssignFeatureTestCases($appTestId: ID!, $featureId: ID!) {
    assignFeatureTestCases(appTestId: $appTestId, featureId: $featureId) { id status }
  }
`;
export const UNASSIGN_TEST_CASE = gql`
  mutation UnassignTestCase($appTestId: ID!, $testCaseId: ID!) {
    unassignTestCase(appTestId: $appTestId, testCaseId: $testCaseId) { id status }
  }
`;
export const CLOSE_APP_TEST = gql`
  mutation CloseAppTestTesting($appTestId: ID!) {
    closeAppTestTesting(appTestId: $appTestId) { id status }
  }
`;
export const POST_APP_TEST_TO_JIRA = gql`
  mutation PostAppTestToJira($id: ID!) {
    postAppTestToJira(id: $id) { id }
  }
`;
