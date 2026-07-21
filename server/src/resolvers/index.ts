import { authResolvers } from "./auth.js";

// Merge per-domain resolver maps. Add project/feature/issue/... resolvers here
// as milestones land.
export const resolvers = {
  Query: {
    ...authResolvers.Query,
  },
  Mutation: {
    ...authResolvers.Mutation,
  },
};
