import { gql } from "@apollo/client";

export const USERS = gql`
  query Users {
    users { id email name role active mustChangePassword }
  }
`;
export const CREATE_USER = gql`
  mutation CreateUser($input: UserInput!) {
    createUser(input: $input) { user { id } defaultPassword }
  }
`;
export const UPDATE_USER = gql`
  mutation UpdateUser($id: ID!, $input: UserInput!) {
    updateUser(id: $id, input: $input) { id }
  }
`;
export const DELETE_USER = gql`mutation($id: ID!){ deleteUser(id:$id) }`;
export const RESET_USER_PASSWORD = gql`mutation($id: ID!){ resetUserPassword(id:$id) }`;

export const SETTING = gql`
  query Setting {
    setting { maintenanceMode maintenanceMessage discordEnabled discordWebhookUrl autoApproveNewHours autoApproveChangeHours }
  }
`;
export const UPDATE_SETTING = gql`
  mutation UpdateSetting($input: SettingInput!) {
    updateSetting(input: $input) { maintenanceMode maintenanceMessage discordEnabled discordWebhookUrl autoApproveNewHours autoApproveChangeHours }
  }
`;
export const TEST_DISCORD = gql`mutation($url: String!){ testDiscord(url:$url) }`;

export const SLA_TARGETS = gql`
  query SlaTargets {
    slaTargets { priority respondMins resolveMins }
  }
`;
export const UPDATE_SLA_TARGET = gql`
  mutation($priority: Priority!, $respondMins: Int, $resolveMins: Int!) {
    updateSlaTarget(priority: $priority, respondMins: $respondMins, resolveMins: $resolveMins) {
      priority respondMins resolveMins
    }
  }
`;

export const AUDIT_LOGS = gql`
  query AuditLogs($limit: Int) {
    auditLogs(limit: $limit) { id action entityId label actor at }
  }
`;

export const FORGOT_PASSWORD = gql`mutation($email: String!){ forgotPassword(email:$email) }`;
export const RESET_PASSWORD = gql`mutation($token: String!, $newPassword: String!){ resetPassword(token:$token,newPassword:$newPassword) }`;
