import { gql } from "@apollo/client";

const USER_TEST_FIELDS = `
  id key projectId projectName account password environment note
  createdAt updatedAt createdBy { id name }
`;

export const USER_TESTS = gql`
  query UserTests($projectId: ID) {
    userTests(projectId: $projectId) { ${USER_TEST_FIELDS} }
  }
`;

export const USER_TEST = gql`
  query UserTest($id: ID!) {
    userTest(id: $id) { ${USER_TEST_FIELDS} }
  }
`;

export const CREATE_USER_TEST = gql`
  mutation CreateUserTest($input: UserTestInput!) {
    createUserTest(input: $input) { id }
  }
`;
export const UPDATE_USER_TEST = gql`
  mutation UpdateUserTest($id: ID!, $input: UserTestInput!) {
    updateUserTest(id: $id, input: $input) { id }
  }
`;
export const DELETE_USER_TEST = gql`
  mutation DeleteUserTest($id: ID!) { deleteUserTest(id: $id) }
`;
