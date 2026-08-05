// The ONLY place that decides which fields leave through the public API.
// Never spread a Prisma row into a response — list every field by hand, so a
// new column can't leak by accident. `map.test.ts` fails if PII appears.
import type { Coverage } from "../coverage.js";
import { formatKey } from "./keys.js";

export interface PublicProject {
  id: string;
  name: string;
}

export interface PublicAppTest {
  key: string;
  id: string;
  project: PublicProject;
  environment: string;
  platform: string;
  appVersion: string | null;
  backendVersion: string | null;
  status: string;
  coverage: Coverage;
  openIssueCount: number;
  passedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublicSessionTest {
  key: string;
  id: string;
  project: PublicProject;
  kind: string;
  status: string;
  minPassPercent: number;
  coverage: Coverage;
  openIssueCount: number;
  testedAt: string;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublicIssue {
  key: string;
  id: string;
  project: PublicProject;
  title: string;
  type: string;
  status: string;
  review: string;
  priority: string;
  environment: string;
  isProductionIssue: boolean;
  scope: { appTest: string | null; sessionTest: string | null };
  archived: boolean;
  respondedAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublicIssueSummary {
  key: string;
  title: string;
  status: string;
  priority: string;
  createdAt: string;
}

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

export function mapProject(p: { id: string; name: string }): PublicProject {
  return { id: p.id, name: p.name };
}

export function mapAppTest(row: {
  number: number;
  id: string;
  project: { id: string; name: string };
  environment: string;
  platform: string;
  appVersion: string | null;
  backendVersion: string | null;
  passedAt: Date | null;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}, derived: { status: string; coverage: Coverage; openIssueCount: number }): PublicAppTest {
  return {
    key: formatKey("APP", row.number),
    id: row.id,
    project: mapProject(row.project),
    environment: row.environment,
    platform: row.platform,
    appVersion: row.appVersion,
    backendVersion: row.backendVersion,
    status: derived.status,
    coverage: derived.coverage,
    openIssueCount: derived.openIssueCount,
    passedAt: iso(row.passedAt),
    closedAt: iso(row.closedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function mapSessionTest(row: {
  number: number;
  id: string;
  project: { id: string; name: string };
  kind: string;
  minPassPercent: number;
  testedAt: Date;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}, derived: { status: string; coverage: Coverage; openIssueCount: number }): PublicSessionTest {
  return {
    key: formatKey("ST", row.number),
    id: row.id,
    project: mapProject(row.project),
    kind: row.kind,
    status: derived.status,
    minPassPercent: row.minPassPercent,
    coverage: derived.coverage,
    openIssueCount: derived.openIssueCount,
    testedAt: row.testedAt.toISOString(),
    closedAt: iso(row.closedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function mapIssue(row: {
  number: number;
  id: string;
  title: string;
  type: string;
  status: string;
  review: string;
  priority: string;
  environment: string;
  isProductionIssue: boolean;
  archived: boolean;
  respondedAt: Date | null;
  resolvedAt: Date | null;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  appTest: { number: number } | null;
  sessionTest: { number: number } | null;
}, project: { id: string; name: string }): PublicIssue {
  return {
    key: formatKey("ISSUE", row.number),
    id: row.id,
    project: mapProject(project),
    title: row.title,
    type: row.type,
    status: row.status,
    review: row.review,
    priority: row.priority,
    environment: row.environment,
    isProductionIssue: row.isProductionIssue,
    scope: {
      appTest: row.appTest ? formatKey("APP", row.appTest.number) : null,
      sessionTest: row.sessionTest ? formatKey("ST", row.sessionTest.number) : null,
    },
    archived: row.archived,
    respondedAt: iso(row.respondedAt),
    resolvedAt: iso(row.resolvedAt),
    closedAt: iso(row.closedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function mapIssueSummary(row: {
  number: number;
  title: string;
  status: string;
  priority: string;
  createdAt: Date;
}): PublicIssueSummary {
  return {
    key: formatKey("ISSUE", row.number),
    title: row.title,
    status: row.status,
    priority: row.priority,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Field names that must never appear in a public response. Asserted in tests. */
export const FORBIDDEN_FIELDS = [
  "testAccount",
  "testPassword",
  "steps",
  "preconditions",
  "description",
  "actualResult",
  "expectedResult",
  "note",
  "downloadLink",
  "attachments",
  "reporter",
  "assignee",
  "reporterId",
  "assigneeId",
  "createdById",
  "stakeholders",
  "summary",
  "jiraKey",
  "jiraCommentId",
] as const;
