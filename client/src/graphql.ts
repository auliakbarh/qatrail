import { gql } from "@apollo/client";

export const ME = gql`
  query Me {
    me {
      id
      email
      name
      role
      mustChangePassword
      active
    }
  }
`;

export const HEALTH = gql`
  query Health {
    health {
      status
      apiVersion
      maintenance
      maintenanceMessage
      jiraConfigured
      ssoEnabled
    }
  }
`;

export const LOGIN = gql`
  mutation Login($email: String!, $password: String!) {
    login(email: $email, password: $password) {
      token
      user {
        id
        email
        name
        role
        mustChangePassword
        active
      }
    }
  }
`;

export const MICROSOFT_LOGIN = gql`
  mutation MicrosoftLogin($idToken: String!) {
    microsoftLogin(idToken: $idToken) {
      token
      user { id email name role mustChangePassword active }
    }
  }
`;

export const CHANGE_PASSWORD = gql`
  mutation ChangePassword($currentPassword: String!, $newPassword: String!) {
    changePassword(currentPassword: $currentPassword, newPassword: $newPassword)
  }
`;
