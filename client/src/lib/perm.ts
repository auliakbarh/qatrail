// Client-side permission hints. The server is the real gate; these only drive
// the disabled look + permission toast so the UI is honest about access.
export function canManageContent(role?: string): boolean {
  return role === "QA" || role === "ADMIN" || role === "SUPER_ADMIN";
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
