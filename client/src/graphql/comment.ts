import { gql } from "@apollo/client";

// Generic comments for any target (ISSUE | APP_TEST).
export const COMMENTS = gql`
  query Comments($target: CommentTarget!, $targetId: ID!) {
    comments(target: $target, targetId: $targetId) {
      id body createdAt updatedAt by { id name }
    }
  }
`;
// Names offered by the "@" picker; the server matches mentions by these exact names.
export const MENTIONABLE_USERS = gql`
  query MentionableUsers {
    mentionableUsers { id name }
  }
`;
export const ADD_COMMENT = gql`
  mutation AddComment($target: CommentTarget!, $targetId: ID!, $body: String!) {
    addComment(target: $target, targetId: $targetId, body: $body) {
      id body createdAt updatedAt by { id name }
    }
  }
`;
export const UPDATE_COMMENT = gql`
  mutation UpdateComment($id: ID!, $body: String!) {
    updateComment(id: $id, body: $body) { id body updatedAt }
  }
`;
export const DELETE_COMMENT = gql`
  mutation DeleteComment($id: ID!) { deleteComment(id: $id) }
`;
