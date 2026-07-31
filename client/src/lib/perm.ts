// Client-side permission hints. The server is the real gate; these only drive
// the disabled look + permission toast so the UI is honest about access.
export function canManageContent(role?: string): boolean {
  return role === "QA" || role === "QA_LEAD" || role === "ADMIN" || role === "SUPER_ADMIN";
}

// QA leads and up review test cases. Whether they may approve a *specific* case
// also depends on its creator — the server answers that per case via
// `TestCase.canApprove`, so use that for a row, and this only to decide whether
// the review UI is worth showing at all.
export function isApprover(role?: string): boolean {
  return role === "QA_LEAD" || role === "ADMIN" || role === "SUPER_ADMIN";
}

// VIEWER may only look. Gates the UI any logged-in user could otherwise act on
// (comments, watch, bulk actions, user tests).
export function canAct(role?: string): boolean {
  return !!role && role !== "VIEWER";
}

// Engineers (and admins) submit/manage app tests — e.g. posting to JIRA.
export function canManageAppTest(role?: string): boolean {
  return role === "ENGINEER" || role === "ADMIN" || role === "SUPER_ADMIN";
}
