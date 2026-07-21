import { authResolvers } from "./auth.js";
import { projectResolvers } from "./project.js";
import { featureResolvers } from "./feature.js";
import { testCaseResolvers } from "./testcase.js";
import { recordResolvers } from "./record.js";
import { issueResolvers } from "./issue.js";

// Merge per-domain resolver maps. Add analytics/notification/... here as
// milestones land.
export const resolvers = {
  Query: {
    ...authResolvers.Query,
    ...projectResolvers.Query,
    ...featureResolvers.Query,
    ...testCaseResolvers.Query,
    ...recordResolvers.Query,
    ...issueResolvers.Query,
  },
  Mutation: {
    ...authResolvers.Mutation,
    ...projectResolvers.Mutation,
    ...featureResolvers.Mutation,
    ...testCaseResolvers.Mutation,
    ...recordResolvers.Mutation,
    ...issueResolvers.Mutation,
  },
  Project: projectResolvers.Project,
  Feature: featureResolvers.Feature,
  TestCase: testCaseResolvers.TestCase,
  RecordTest: recordResolvers.RecordTest,
  Issue: issueResolvers.Issue,
};
