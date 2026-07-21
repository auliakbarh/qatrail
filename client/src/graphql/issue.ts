import { gql } from "@apollo/client";

export const ENGINEERS = gql`
  query Engineers {
    engineers { id name email }
  }
`;

export const RECORD_TESTS = gql`
  query RecordTests($testCaseId: ID!) {
    recordTests(testCaseId: $testCaseId) {
      id executedAt result note issueId
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

export const DELETE_RECORD_TEST = gql`
  mutation DeleteRecordTest($id: ID!) { deleteRecordTest(id: $id) }
`;

const ISSUE_FIELDS = `
  id testCaseId recordTestId type title description environment platform
  appVersion backendVersion testAccount testPassword testedAt preconditions
  steps actualResult expectedResult priority note status review archived
  reporter { id name } assignee { id name }
  attachments { order url kind label }
  createdAt updatedAt
`;

export const ISSUES = gql`
  query Issues($testCaseId: ID, $archived: Boolean) {
    issues(testCaseId: $testCaseId, archived: $archived) {
      id title type priority status review environment platform archived
      assignee { id name } reporter { id name } createdAt
    }
  }
`;

export const ISSUE = gql`
  query Issue($id: ID!) {
    issue(id: $id) { ${ISSUE_FIELDS} }
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
