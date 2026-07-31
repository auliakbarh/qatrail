import { gql } from "@apollo/client";

export const ISSUE_ACCEPT = gql`mutation($id: ID!){ issueAccept(id:$id){ id status review } }`;
export const ISSUE_REJECT = gql`mutation($id: ID!,$reason:String!){ issueReject(id:$id,reason:$reason){ id review } }`;
export const ISSUE_NEED_CLARIFY = gql`mutation($id: ID!,$note:String!){ issueNeedClarify(id:$id,note:$note){ id review } }`;
export const ISSUE_SOLVE = gql`mutation($id: ID!,$postmortem:PostmortemInput!){ issueSolve(id:$id,postmortem:$postmortem){ id status } }`;
export const ISSUE_HOLD = gql`mutation($id: ID!){ issueHold(id:$id){ id status } }`;
export const ISSUE_RESUME = gql`mutation($id: ID!){ issueResume(id:$id){ id status } }`;
export const ISSUE_CLARIFY_RESPOND = gql`mutation($id: ID!,$note:String){ issueClarifyRespond(id:$id,note:$note){ id review } }`;
export const ISSUE_REVIEW = gql`mutation($id: ID!,$pass:Boolean!,$note:String){ issueReview(id:$id,pass:$pass,note:$note){ id status } }`;
export const ISSUE_REOPEN = gql`mutation($id: ID!,$note:String){ issueReopen(id:$id,note:$note){ id status } }`;
export const SET_ISSUE_ARCHIVED = gql`mutation($id: ID!,$archived:Boolean!){ setIssueArchived(id:$id,archived:$archived){ id archived } }`;
export const SET_PRODUCTION_ISSUE = gql`mutation($id: ID!,$value:Boolean!){ setProductionIssue(id:$id,value:$value){ id isProductionIssue slaStatus } }`;
export const SET_ISSUE_SCOPE = gql`mutation($id: ID!,$appTestId:ID,$sessionTestId:ID){ setIssueScope(id:$id,appTestId:$appTestId,sessionTestId:$sessionTestId){ id appTestId appTestKey sessionTestId sessionTestKey } }`;

export const NOTIFICATIONS = gql`
  query Notifications {
    notifications { id kind message issueId appTestId userTestId sessionTestId testCaseId read createdAt }
    unreadCount
  }
`;
export const MARK_NOTIFICATION_READ = gql`mutation($id: ID!){ markNotificationRead(id:$id) }`;
export const MARK_ALL_READ = gql`mutation{ markAllNotificationsRead }`;
export const NOTIFICATION_ADDED = gql`
  subscription {
    notificationAdded { id kind message issueId appTestId userTestId sessionTestId testCaseId read createdAt }
  }
`;
