import { gql } from "@apollo/client";

const COVERAGE = `coverage { total passed percent } ready`;

export const PROJECTS = gql`
  query Projects($includeInactive: Boolean) {
    projects(includeInactive: $includeInactive) {
      id name description squad minPassPercent featureCount ${COVERAGE} createdAt updatedAt
      active pendingRequest { id kind }
    }
  }
`;

export const FEATURES = gql`
  query Features($projectId: ID!, $includeInactive: Boolean) {
    features(projectId: $projectId, includeInactive: $includeInactive) {
      id key projectId name description minPassPercent testCaseCount ${COVERAGE} createdAt updatedAt
      active pendingRequest { id kind }
    }
  }
`;

export const TEST_CASES = gql`
  query TestCases($featureId: ID!, $includeInactive: Boolean) {
    testCases(featureId: $featureId, includeInactive: $includeInactive) {
      id key featureId name description kind recordCount issueCount latestResult createdAt active
      pendingRequest { id kind }
    }
  }
`;

export const TEST_CASE = gql`
  query TestCase($id: ID!) {
    testCase(id: $id) {
      id key featureId name description precondition note kind
      steps { id order step expectedResult }
      attachments { id order url kind label }
      recordCount issueCount latestResult createdAt createdBy { id name }
      approval reviewedAt firstApprovedAt rejectReason canApprove active reviewedBy { id name }
      pendingRequest { id kind canApprove requestedAt requestedBy { id name } targetFeature { id name } targetName }
      feature { id name project { id name } }
    }
  }
`;

export const PENDING_APPROVAL_REQUESTS = gql`
  query PendingApprovalRequests($projectId: ID) {
    pendingApprovalRequests(projectId: $projectId) {
      id target kind state requestedAt canApprove label
      requestedBy { id name }
      targetFeature { id name }
      targetName
      project { id name }
      feature { id name project { id name } }
      testCase { id key name active feature { id name project { id name } } }
    }
  }
`;

export const APPROVE_APPROVAL_REQUEST = gql`
  mutation ApproveApprovalRequest($id: ID!) {
    approveApprovalRequest(id: $id) { id state }
  }
`;
export const APPROVE_APPROVAL_REQUESTS = gql`
  mutation ApproveApprovalRequests($ids: [ID!]!) {
    approveApprovalRequests(ids: $ids) { approved skipped }
  }
`;
export const REJECT_APPROVAL_REQUEST = gql`
  mutation RejectApprovalRequest($id: ID!, $reason: String!) {
    rejectApprovalRequest(id: $id, reason: $reason) { id state rejectReason }
  }
`;
export const SET_PROJECT_ACTIVE = gql`
  mutation SetProjectActive($id: ID!, $active: Boolean!) {
    setProjectActive(id: $id, active: $active) { id active }
  }
`;
export const SET_FEATURE_ACTIVE = gql`
  mutation SetFeatureActive($id: ID!, $active: Boolean!) {
    setFeatureActive(id: $id, active: $active) { id active }
  }
`;
export const SET_TEST_CASE_ACTIVE = gql`
  mutation SetTestCaseActive($id: ID!, $active: Boolean!) {
    setTestCaseActive(id: $id, active: $active) { id active }
  }
`;

// PENDING + REJECTED, oldest first. Carries feature/project so the list can
// group, filter and link without a second round trip.
export const PENDING_TEST_CASES = gql`
  query PendingTestCases($projectId: ID) {
    pendingTestCases(projectId: $projectId) {
      id key name kind approval rejectReason reviewedAt firstApprovedAt createdAt canApprove
      createdBy { id name }
      reviewedBy { id name }
      feature { id name project { id name } }
    }
  }
`;

export const PENDING_APPROVAL_COUNT = gql`
  query PendingApprovalCount {
    pendingApprovalCount
  }
`;

export const APPROVE_TEST_CASE = gql`
  mutation ApproveTestCase($id: ID!) {
    approveTestCase(id: $id) { id approval }
  }
`;
export const APPROVE_TEST_CASES = gql`
  mutation ApproveTestCases($ids: [ID!]!) {
    approveTestCases(ids: $ids) { approved skipped }
  }
`;
export const REJECT_TEST_CASE = gql`
  mutation RejectTestCase($id: ID!, $reason: String!) {
    rejectTestCase(id: $id, reason: $reason) { id approval rejectReason }
  }
`;

export const CREATE_PROJECT = gql`
  mutation CreateProject($input: ProjectInput!) {
    createProject(input: $input) { id }
  }
`;
export const UPDATE_PROJECT = gql`
  mutation UpdateProject($id: ID!, $input: ProjectInput!) {
    updateProject(id: $id, input: $input) { id }
  }
`;
export const DELETE_PROJECT = gql`
  mutation DeleteProject($id: ID!) { deleteProject(id: $id) }
`;

export const CREATE_FEATURE = gql`
  mutation CreateFeature($projectId: ID!, $input: FeatureInput!) {
    createFeature(projectId: $projectId, input: $input) { id }
  }
`;
export const UPDATE_FEATURE = gql`
  mutation UpdateFeature($id: ID!, $input: FeatureInput!) {
    updateFeature(id: $id, input: $input) { id }
  }
`;
export const DELETE_FEATURE = gql`
  mutation DeleteFeature($id: ID!) { deleteFeature(id: $id) }
`;

export const EXPORT_TEST_CASES = gql`
  query ExportTestCases($projectId: ID, $featureId: ID) {
    exportTestCases(projectId: $projectId, featureId: $featureId) {
      featureName name description precondition note kind
      steps { step expectedResult }
    }
  }
`;
export const IMPORT_TEST_CASES = gql`
  mutation ImportTestCases($projectId: ID, $featureId: ID, $dryRun: Boolean!, $rows: [ImportTestCaseInput!]!) {
    importTestCases(projectId: $projectId, featureId: $featureId, dryRun: $dryRun, rows: $rows) {
      ok testCaseCount stepCount newFeatures
      errors { row message }
    }
  }
`;

export const CREATE_TEST_CASE = gql`
  mutation CreateTestCase($featureId: ID!, $input: TestCaseInput!) {
    createTestCase(featureId: $featureId, input: $input) { id }
  }
`;
export const UPDATE_TEST_CASE = gql`
  mutation UpdateTestCase($id: ID!, $input: TestCaseInput!) {
    updateTestCase(id: $id, input: $input) { id }
  }
`;
export const DELETE_TEST_CASE = gql`
  mutation DeleteTestCase($id: ID!) { deleteTestCase(id: $id) }
`;
export const MOVE_TEST_CASE = gql`
  mutation MoveTestCase($id: ID!, $featureId: ID!) {
    moveTestCase(id: $id, featureId: $featureId) { id featureId }
  }
`;
export const MOVE_FEATURE = gql`mutation MoveFeature($id: ID!, $projectId: ID!){ moveFeature(id:$id,projectId:$projectId){ id projectId } }`;
export const CLONE_PROJECT = gql`mutation CloneProject($id: ID!, $name: String){ cloneProject(id:$id,name:$name){ id } }`;
export const CLONE_FEATURE = gql`mutation CloneFeature($id: ID!, $targetProjectId: ID!, $name: String){ cloneFeature(id:$id,targetProjectId:$targetProjectId,name:$name){ id } }`;
export const CLONE_TEST_CASE = gql`mutation CloneTestCase($id: ID!, $targetFeatureId: ID!, $name: String){ cloneTestCase(id:$id,targetFeatureId:$targetFeatureId,name:$name){ id } }`;
