// GraphQL type definitions. M0: auth + health. M1: project/feature/test-case.
export const typeDefs = /* GraphQL */ `
  enum Role { SUPER_ADMIN ADMIN QA ENGINEER }
  enum AttachKind { IMAGE VIDEO MARKDOWN JSON DOC XLS CSV PDF OTHER }

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

  type Query {
    health: Health!
    me: User

    projects: [Project!]!
    project(id: ID!): Project
    features(projectId: ID!): [Feature!]!
    feature(id: ID!): Feature
    testCases(featureId: ID!): [TestCase!]!
    testCase(id: ID!): TestCase
  }

  type Mutation {
    login(email: String!, password: String!): AuthPayload!
    changePassword(currentPassword: String!, newPassword: String!): Boolean!

    createProject(input: ProjectInput!): Project!
    updateProject(id: ID!, input: ProjectInput!): Project!
    deleteProject(id: ID!): Boolean!

    createFeature(projectId: ID!, input: FeatureInput!): Feature!
    updateFeature(id: ID!, input: FeatureInput!): Feature!
    deleteFeature(id: ID!): Boolean!

    createTestCase(featureId: ID!, input: TestCaseInput!): TestCase!
    updateTestCase(id: ID!, input: TestCaseInput!): TestCase!
    deleteTestCase(id: ID!): Boolean!
  }
`;
