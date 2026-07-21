import { authResolvers } from "./auth.js";
import { projectResolvers } from "./project.js";
import { featureResolvers } from "./feature.js";
import { testCaseResolvers } from "./testcase.js";
import { recordResolvers } from "./record.js";
import { issueResolvers } from "./issue.js";
import { workflowResolvers } from "./workflow.js";
import { notificationResolvers } from "./notification.js";
import { analyticsResolvers } from "./analytics.js";

export const resolvers = {
  Query: {
    ...authResolvers.Query,
    ...projectResolvers.Query,
    ...featureResolvers.Query,
    ...testCaseResolvers.Query,
    ...recordResolvers.Query,
    ...issueResolvers.Query,
    ...notificationResolvers.Query,
    ...analyticsResolvers.Query,
  },
  Mutation: {
    ...authResolvers.Mutation,
    ...projectResolvers.Mutation,
    ...featureResolvers.Mutation,
    ...testCaseResolvers.Mutation,
    ...recordResolvers.Mutation,
    ...issueResolvers.Mutation,
    ...workflowResolvers.Mutation,
    ...notificationResolvers.Mutation,
  },
  Subscription: {
    ...notificationResolvers.Subscription,
  },
  Project: projectResolvers.Project,
  Feature: featureResolvers.Feature,
  TestCase: testCaseResolvers.TestCase,
  RecordTest: recordResolvers.RecordTest,
  Issue: issueResolvers.Issue,
  StatusEvent: workflowResolvers.StatusEvent,
  Postmortem: workflowResolvers.Postmortem,
  Notification: notificationResolvers.Notification,
};
