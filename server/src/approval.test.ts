import { describe, it, expect } from "vitest";
import {
  canApproveTestCase,
  approvalOnCreate,
  editKeepsApproval,
  isApproverRole,
  approverRolesFor,
} from "./approval.js";

const u = (id: string, role: string) => ({ id, role });

describe("canApproveTestCase", () => {
  const qaCase = u("qa1", "QA");

  it("lets QA_LEAD, ADMIN and SUPER_ADMIN approve a QA's case", () => {
    for (const role of ["QA_LEAD", "ADMIN", "SUPER_ADMIN"]) {
      expect(canApproveTestCase(u("x", role), qaCase)).toBe(true);
    }
  });

  it("refuses QA, ENGINEER and VIEWER", () => {
    for (const role of ["QA", "ENGINEER", "VIEWER"]) {
      expect(canApproveTestCase(u("x", role), qaCase)).toBe(false);
    }
  });

  it("refuses self-approval even for an admin", () => {
    expect(canApproveTestCase(u("a1", "ADMIN"), u("a1", "ADMIN"))).toBe(false);
    expect(canApproveTestCase(u("l1", "QA_LEAD"), u("l1", "QA_LEAD"))).toBe(false);
  });

  it("needs another QA_LEAD (or higher) for a QA_LEAD's case", () => {
    const leadCase = u("l1", "QA_LEAD");
    expect(canApproveTestCase(u("l2", "QA_LEAD"), leadCase)).toBe(true);
    expect(canApproveTestCase(u("a1", "ADMIN"), leadCase)).toBe(true);
    expect(canApproveTestCase(u("q1", "QA"), leadCase)).toBe(false);
  });

  it("needs ADMIN or above for an ADMIN's case — a QA_LEAD may not", () => {
    const adminCase = u("a1", "ADMIN");
    expect(canApproveTestCase(u("l1", "QA_LEAD"), adminCase)).toBe(false);
    expect(canApproveTestCase(u("a2", "ADMIN"), adminCase)).toBe(true);
    expect(canApproveTestCase(u("s1", "SUPER_ADMIN"), adminCase)).toBe(true);
  });
});

describe("approvalOnCreate", () => {
  it("approves a SUPER_ADMIN's own case, everything else waits", () => {
    expect(approvalOnCreate("SUPER_ADMIN")).toBe("APPROVED");
    for (const role of ["ADMIN", "QA_LEAD", "QA"]) expect(approvalOnCreate(role)).toBe("PENDING");
  });
});

describe("editKeepsApproval", () => {
  it("only a SUPER_ADMIN edit keeps the approval", () => {
    expect(editKeepsApproval("SUPER_ADMIN")).toBe(true);
    for (const role of ["ADMIN", "QA_LEAD", "QA"]) expect(editKeepsApproval(role)).toBe(false);
  });
});

describe("isApproverRole / approverRolesFor", () => {
  it("approver rights start at QA_LEAD", () => {
    expect(isApproverRole("QA_LEAD")).toBe(true);
    expect(isApproverRole("QA")).toBe(false);
    expect(isApproverRole(null)).toBe(false);
  });

  it("fan-out floor rises with the creator's rank", () => {
    expect(approverRolesFor("QA").sort()).toEqual(["ADMIN", "QA_LEAD", "SUPER_ADMIN"]);
    expect(approverRolesFor("QA_LEAD").sort()).toEqual(["ADMIN", "QA_LEAD", "SUPER_ADMIN"]);
    expect(approverRolesFor("ADMIN").sort()).toEqual(["ADMIN", "SUPER_ADMIN"]);
    expect(approverRolesFor("SUPER_ADMIN")).toEqual(["SUPER_ADMIN"]);
  });
});
