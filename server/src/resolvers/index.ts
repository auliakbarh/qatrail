import { authResolvers } from "./auth.js";
import { projectResolvers } from "./project.js";
import { featureResolvers } from "./feature.js";
import { testCaseResolvers } from "./testcase.js";
import { recordResolvers } from "./record.js";
import { issueResolvers } from "./issue.js";
import { workflowResolvers } from "./workflow.js";
import { notificationResolvers } from "./notification.js";
import { analyticsResolvers } from "./analytics.js";
import { adminResolvers } from "./admin.js";
import { commentResolvers } from "./comment.js";
import { appTestResolvers } from "./appTest.js";
import { userTestResolvers } from "./userTest.js";
import { watchResolvers } from "./watch.js";
import { suggestionsResolvers } from "./suggestions.js";
import { readOnlyGuard } from "../context.js";

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
    ...adminResolvers.Query,
    ...commentResolvers.Query,
    ...appTestResolvers.Query,
    ...userTestResolvers.Query,
    ...watchResolvers.Query,
    ...suggestionsResolvers.Query,
  },
  // readOnlyGuard: every mutation is closed to the VIEWER role unless allowlisted.
  Mutation: readOnlyGuard({
    ...authResolvers.Mutation,
    ...projectResolvers.Mutation,
    ...featureResolvers.Mutation,
    ...testCaseResolvers.Mutation,
    ...recordResolvers.Mutation,
    ...issueResolvers.Mutation,
    ...workflowResolvers.Mutation,
    ...notificationResolvers.Mutation,
    ...adminResolvers.Mutation,
    ...commentResolvers.Mutation,
    ...appTestResolvers.Mutation,
    ...userTestResolvers.Mutation,
    ...watchResolvers.Mutation,
  }),
  Subscription: {
    ...notificationResolvers.Subscription,
  },
  Project: projectResolvers.Project,
  Feature: featureResolvers.Feature,
  TestCase: testCaseResolvers.TestCase,
  RecordTest: recordResolvers.RecordTest,
  Issue: issueResolvers.Issue,
  Comment: commentResolvers.Comment,
  AppTest: appTestResolvers.AppTest,
  AppTestBuild: appTestResolvers.AppTestBuild,
  AssignedTestCase: appTestResolvers.AssignedTestCase,
  UserTest: userTestResolvers.UserTest,
  StatusEvent: workflowResolvers.StatusEvent,
  Postmortem: workflowResolvers.Postmortem,
  Notification: notificationResolvers.Notification,
};
