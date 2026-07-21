import { ApolloClient, InMemoryCache, createHttpLink, split } from "@apollo/client";
import { setContext } from "@apollo/client/link/context";
import { GraphQLWsLink } from "@apollo/client/link/subscriptions";
import { getMainDefinition } from "@apollo/client/utilities";
import { createClient } from "graphql-ws";
import { API_URL, TOKEN_KEY } from "./config";

const httpLink = createHttpLink({ uri: API_URL });

const authLink = setContext((_, { headers }) => {
  const token = localStorage.getItem(TOKEN_KEY);
  return { headers: { ...headers, ...(token && { authorization: `Bearer ${token}` }) } };
});

const wsLink = new GraphQLWsLink(
  createClient({
    url: API_URL.replace(/^http/, "ws"),
    connectionParams: () => {
      const token = localStorage.getItem(TOKEN_KEY);
      return token ? { authorization: `Bearer ${token}` } : {};
    },
  }),
);

const splitLink = split(
  ({ query }) => {
    const def = getMainDefinition(query);
    return def.kind === "OperationDefinition" && def.operation === "subscription";
  },
  wsLink,
  authLink.concat(httpLink),
);

export const apollo = new ApolloClient({
  link: splitLink,
  cache: new InMemoryCache(),
});
