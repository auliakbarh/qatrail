import { gql } from "@apollo/client";

export const USERS = gql`
  query Users {
    users { id email name role active mustChangePassword authProvider approvedAt }
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
    setting { maintenanceMode maintenanceMessage discordEnabled discordWebhookUrl autoApproveNewHours autoApproveChangeHours testCaseApprovalMode testReviewMode ssoAutoProvision ssoAllowedDomains maintenanceStartAt maintenanceEndAt maintenanceAutoEnd }
  }
`;
export const UPDATE_SETTING = gql`
  mutation UpdateSetting($input: SettingInput!) {
    updateSetting(input: $input) { maintenanceMode maintenanceMessage discordEnabled discordWebhookUrl autoApproveNewHours autoApproveChangeHours testCaseApprovalMode testReviewMode ssoAutoProvision ssoAllowedDomains maintenanceStartAt maintenanceEndAt maintenanceAutoEnd }
  }
`;
export const TEST_DISCORD = gql`mutation($url: String!){ testDiscord(url:$url) }`;
export const TEST_JIRA = gql`mutation($jiraKey: String){ testJira(jiraKey:$jiraKey){ ok message } }`;

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

export const PUBLIC_API_CLIENTS = gql`
  query PublicApiClients {
    publicApiClients { id appId name allowedOrigins allowedIps active expiresAt lastUsedAt createdAt }
  }
`;
export const CREATE_PUBLIC_API_CLIENT = gql`
  mutation CreatePublicApiClient($input: PublicApiClientInput!) {
    createPublicApiClient(input: $input) { client { id appId } key }
  }
`;
export const UPDATE_PUBLIC_API_CLIENT = gql`
  mutation UpdatePublicApiClient($id: ID!, $input: PublicApiClientUpdateInput!) {
    updatePublicApiClient(id: $id, input: $input) { id active }
  }
`;
export const REVOKE_PUBLIC_API_CLIENT = gql`mutation($id: ID!){ revokePublicApiClient(id:$id) }`;

export const AUDIT_LOGS = gql`
  query AuditLogs($filter: AuditLogFilter, $offset: Int, $limit: Int, $sortKey: String, $sortDir: String) {
    auditLogs(filter: $filter, offset: $offset, limit: $limit, sortKey: $sortKey, sortDir: $sortDir) {
      total
      actions
      actors
      rows { id action entityId label actor at details { name value } }
    }
  }
`;

export const REVIEW_ACTIVITY = gql`
  query ReviewActivity($id: ID!) {
    reviewActivity(id: $id) { id action actor at details { name value } }
  }
`;

export const FORGOT_PASSWORD = gql`mutation($email: String!){ forgotPassword(email:$email) }`;
export const RESET_PASSWORD = gql`mutation($token: String!, $newPassword: String!){ resetPassword(token:$token,newPassword:$newPassword) }`;
