// Who may approve a test case. One place, pure, so the UI hint and the server
// gate can't drift apart.
//
// Rules:
//   - QA_LEAD and up may approve at all.
//   - An approver must match or outrank the creator: an ADMIN's case needs
//     another ADMIN (or SUPER_ADMIN), never a QA_LEAD.
//   - Nobody approves their own case.
//   - A case created by a SUPER_ADMIN is approved on creation, so it never needs
//     one of these checks.
//
// The creator's rank comes from their *current* role — a demoted creator's old
// case becomes easier to approve. Accepted: no role snapshot column.

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

// Approve rights exist from QA_LEAD up.
export function isApproverRole(role?: string | null): boolean {
  return RANK[role ?? ""] >= RANK.QA_LEAD;
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

export function canApproveTestCase(approver: Actor, creator: Actor): boolean {
  if (!isApproverRole(approver.role)) return false;
  if (RANK[approver.role] < RANK[creator.role ?? ""]) return false;
  return approver.id !== creator.id;
}

// Roles that could approve a case from this creator — used to fan the
// "needs approval" notification out to the right people.
export function approverRolesFor(creatorRole: string): string[] {
  const floor = Math.max(RANK.QA_LEAD, RANK[creatorRole] ?? RANK.QA_LEAD);
  return Object.keys(RANK).filter((r) => RANK[r] >= floor);
}
