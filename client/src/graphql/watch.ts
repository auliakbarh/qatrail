import { gql } from "@apollo/client";

export const IS_WATCHING = gql`
  query IsWatching($target: CommentTarget!, $targetId: ID!) {
    isWatching(target: $target, targetId: $targetId)
  }
`;
export const SET_WATCH = gql`
  mutation SetWatch($target: CommentTarget!, $targetId: ID!, $watching: Boolean!) {
    setWatch(target: $target, targetId: $targetId, watching: $watching)
  }
`;
export const SUGGESTIONS = gql`
  query Suggestions($field: String!) {
    suggestions(field: $field)
  }
`;
