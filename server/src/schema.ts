// GraphQL type definitions. M0: auth + health only. Extended per milestone.
export const typeDefs = /* GraphQL */ `
  enum Role { SUPER_ADMIN ADMIN QA ENGINEER }

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

  type Query {
    health: Health!
    me: User
  }

  type Mutation {
    login(email: String!, password: String!): AuthPayload!
    changePassword(currentPassword: String!, newPassword: String!): Boolean!
  }
`;
