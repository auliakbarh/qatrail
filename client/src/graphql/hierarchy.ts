import { gql } from "@apollo/client";

const COVERAGE = `coverage { total passed percent } ready`;

export const PROJECTS = gql`
  query Projects {
    projects {
      id name description squad minPassPercent featureCount ${COVERAGE} createdAt updatedAt
    }
  }
`;

export const FEATURES = gql`
  query Features($projectId: ID!) {
    features(projectId: $projectId) {
      id key projectId name description minPassPercent testCaseCount ${COVERAGE} createdAt updatedAt
    }
  }
`;

export const TEST_CASES = gql`
  query TestCases($featureId: ID!) {
    testCases(featureId: $featureId) {
      id key featureId name description recordCount issueCount latestResult createdAt
    }
  }
`;

export const TEST_CASE = gql`
  query TestCase($id: ID!) {
    testCase(id: $id) {
      id key featureId name description precondition note
      steps { id order step expectedResult }
      attachments { id order url kind label }
      recordCount issueCount latestResult createdAt
    }
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
export const CLONE_PROJECT = gql`mutation CloneProject($id: ID!, $name: String){ cloneProject(id:$id,name:$name){ id } }`;
export const CLONE_FEATURE = gql`mutation CloneFeature($id: ID!, $targetProjectId: ID!, $name: String){ cloneFeature(id:$id,targetProjectId:$targetProjectId,name:$name){ id } }`;
export const CLONE_TEST_CASE = gql`mutation CloneTestCase($id: ID!, $targetFeatureId: ID!, $name: String){ cloneTestCase(id:$id,targetFeatureId:$targetFeatureId,name:$name){ id } }`;
