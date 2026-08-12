// Who may approve a test case. One place, pure, so the UI hint and the server
// gate can't drift apart.
//
// Rules (mode LEAD, the default):
//   - QA_LEAD and up may approve at all.
//   - An approver must match or outrank the creator: an ADMIN's case needs
//     another ADMIN (or SUPER_ADMIN), never a QA_LEAD.
//   - Nobody approves their own case.
//   - A case created by a SUPER_ADMIN is approved on creation, so it never needs
//     one of these checks.
//
// Mode PEER_360 keeps only the last rule: every QA and up reviews everyone
// else's case, whatever the ranks. The mode is an admin setting, so it is
// passed in — these functions stay pure and directly testable.
//
// The creator's rank comes from their *current* role — a demoted creator's old
// case becomes easier to approve. Accepted: no role snapshot column.

import { prisma } from "./db.js";

// The live catalogue, as a Prisma where-fragment: reviewed (APPROVED), not
// retired, and under a feature and project that are themselves live. Retiring a
// project therefore takes everything under it out of the lists, the counts,
// coverage and every new run without rewriting a single test case row — so
// reviving it restores exactly the state it had. Lives here (not in a resolver)
// so coverage.ts can share it without importing upwards.
export const LIVE_TEST_CASE = {
  approval: "APPROVED",
  active: true,
  feature: { active: true, project: { active: true } },
} as const;

export const RANK: Record<string, number> = {
  VIEWER: 0,
  ENGINEER: 0,
  QA: 1,
  QA_LEAD: 2,
  ADMIN: 3,
  SUPER_ADMIN: 4,
};

export interface Actor {
  id: string;
  role: string;
}

export type ApprovalMode = "LEAD" | "PEER_360";

// Approve rights exist from QA_LEAD up — from QA up under 360 review.
export function isApproverRole(role?: string | null, mode: ApprovalMode = "LEAD"): boolean {
  return RANK[role ?? ""] >= (mode === "PEER_360" ? RANK.QA : RANK.QA_LEAD);
}

// A new test case is live immediately only when a SUPER_ADMIN wrote it.
export function approvalOnCreate(creatorRole: string): "PENDING" | "APPROVED" {
  return creatorRole === "SUPER_ADMIN" ? "APPROVED" : "PENDING";
}

// An edit sends the case back for review — otherwise the gate is bypassable:
// get a trivial case approved, then rewrite it.
export function editKeepsApproval(editorRole: string): boolean {
  return editorRole === "SUPER_ADMIN";
}

export function canApproveTestCase(approver: Actor, creator: Actor, mode: ApprovalMode = "LEAD"): boolean {
  if (!isApproverRole(approver.role, mode)) return false;
  if (mode !== "PEER_360" && RANK[approver.role] < RANK[creator.role ?? ""]) return false;
  return approver.id !== creator.id;
}

// Peer review of an app test / testing session report (Setting.testReviewMode):
// any QA and up may review, except the QA who asked for the review. Shared by
// both paths so the two can't drift.
export function canReviewTest(reviewer: Actor, requesterId?: string | null): boolean {
  if (RANK[reviewer.role] < RANK.QA) return false;
  return reviewer.id !== requesterId;
}

// Roles that could approve a case from this creator — used to fan the
// "needs approval" notification out to the right people.
export function approverRolesFor(creatorRole: string, mode: ApprovalMode = "LEAD"): string[] {
  const floor =
    mode === "PEER_360" ? RANK.QA : Math.max(RANK.QA_LEAD, RANK[creatorRole] ?? RANK.QA_LEAD);
  return Object.keys(RANK).filter((r) => RANK[r] >= floor);
}

// --- Auto-approval (admin setting, in hours) ---------------------------------
// null = never auto-approve, a human must decide.
//    0 = approved immediately, no waiting room at all.
//    N = approved once it has waited N hours undecided (the scheduler sweeps).

export function autoApprovesNow(hours?: number | null): boolean {
  return hours === 0;
}

// Cut-off for a sweep: anything requested at or before this is overdue. Null
// when auto-approval is off or immediate (immediate never reaches the sweep).
export function autoApproveCutoff(hours: number | null | undefined, now: Date): Date | null {
  if (hours == null || hours <= 0) return null;
  return new Date(now.getTime() - hours * 3600_000);
}

// --- The modes, read from the admin Setting ----------------------------------
// The rules above take their mode as an argument and stay pure; this is the one
// place that reads it. Cached ~10s like the SLA targets, because field resolvers
// (TestCase.canApprove, AppTest.status) ask once per row. updateSetting drops
// the cache, so an admin's change lands immediately rather than within 10s.

export type TestReviewMode = "NONE" | "PEER_360";

let _modes: { approval: ApprovalMode; review: TestReviewMode } | null = null;
let _modesAt = 0;

export async function approvalModes(): Promise<{ approval: ApprovalMode; review: TestReviewMode }> {
  const now = Date.now();
  if (_modes && now - _modesAt < 10_000) return _modes;
  const s = await prisma.setting.findUnique({ where: { id: "singleton" } });
  _modes = {
    approval: (s?.testCaseApprovalMode as ApprovalMode) ?? "LEAD",
    review: (s?.testReviewMode as TestReviewMode) ?? "NONE",
  };
  _modesAt = now;
  return _modes;
}

export function clearModeCache(): void {
  _modes = null;
}

/** Shorthand: the test-case approval mode alone. */
export async function approvalMode(): Promise<ApprovalMode> {
  return (await approvalModes()).approval;
}

/** True when an app test / session needs another QA's review before PASSED. */
export async function testReviewRequired(): Promise<boolean> {
  return (await approvalModes()).review === "PEER_360";
}
