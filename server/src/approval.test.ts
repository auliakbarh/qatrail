import { describe, it, expect } from "vitest";
import {
  canApproveTestCase,
  canReviewTest,
  canSubmitTestReview,
  approvalOnCreate,
  editKeepsApproval,
  isApproverRole,
  approverRolesFor,
  autoApprovesNow,
  autoApproveCutoff,
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

describe("canApproveTestCase — PEER_360 (360 review)", () => {
  it("lets a plain QA approve anyone else's case, whatever their rank", () => {
    for (const creator of ["QA", "QA_LEAD", "ADMIN", "SUPER_ADMIN"]) {
      expect(canApproveTestCase(u("q1", "QA"), u("c1", creator), "PEER_360")).toBe(true);
    }
  });

  it("still refuses the author's own case", () => {
    expect(canApproveTestCase(u("q1", "QA"), u("q1", "QA"), "PEER_360")).toBe(false);
    expect(canApproveTestCase(u("a1", "ADMIN"), u("a1", "ADMIN"), "PEER_360")).toBe(false);
  });

  it("still refuses everyone below QA", () => {
    for (const role of ["ENGINEER", "VIEWER"]) {
      expect(canApproveTestCase(u("x", role), u("q1", "QA"), "PEER_360")).toBe(false);
    }
  });
});

describe("canReviewTest", () => {
  it("lets any QA and up review someone else's report", () => {
    for (const role of ["QA", "QA_LEAD", "ADMIN", "SUPER_ADMIN"]) {
      expect(canReviewTest(u("x", role), "q1")).toBe(true);
    }
  });

  it("refuses the QA who asked for the review, and everyone below QA", () => {
    expect(canReviewTest(u("q1", "QA"), "q1")).toBe(false);
    expect(canReviewTest(u("e1", "ENGINEER"), "q1")).toBe(false);
    expect(canReviewTest(u("v1", "VIEWER"), "q1")).toBe(false);
  });
});

describe("canSubmitTestReview", () => {
  it("leaves a first submission open to any QA", () => {
    expect(canSubmitTestReview(u("q2", "QA"), null, null)).toBe(true);
    expect(canSubmitTestReview(u("q2", "QA"), "APPROVED", "q1")).toBe(true);
  });

  it("hands a sent-back report back to its own submitter only", () => {
    expect(canSubmitTestReview(u("q1", "QA"), "CHANGES_REQUESTED", "q1")).toBe(true);
    expect(canSubmitTestReview(u("q2", "QA_LEAD"), "CHANGES_REQUESTED", "q1")).toBe(false);
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

describe("auto-approval window", () => {
  const now = new Date("2026-08-01T12:00:00Z");

  it("0 hours means approve on the spot, null means never", () => {
    expect(autoApprovesNow(0)).toBe(true);
    expect(autoApprovesNow(null)).toBe(false);
    expect(autoApprovesNow(undefined)).toBe(false);
    expect(autoApprovesNow(24)).toBe(false);
  });

  it("only a positive window produces a sweep cut-off", () => {
    expect(autoApproveCutoff(null, now)).toBeNull();
    expect(autoApproveCutoff(0, now)).toBeNull();
    expect(autoApproveCutoff(6, now)?.toISOString()).toBe("2026-08-01T06:00:00.000Z");
    expect(autoApproveCutoff(48, now)?.toISOString()).toBe("2026-07-30T12:00:00.000Z");
  });
});

describe("isApproverRole / approverRolesFor", () => {
  it("approver rights start at QA_LEAD", () => {
    expect(isApproverRole("QA_LEAD")).toBe(true);
    expect(isApproverRole("QA")).toBe(false);
    expect(isApproverRole(null)).toBe(false);
  });

  it("360 review drops the floor to QA on both", () => {
    expect(isApproverRole("QA", "PEER_360")).toBe(true);
    expect(isApproverRole("ENGINEER", "PEER_360")).toBe(false);
    expect(approverRolesFor("ADMIN", "PEER_360").sort()).toEqual(["ADMIN", "QA", "QA_LEAD", "SUPER_ADMIN"]);
  });

  it("fan-out floor rises with the creator's rank", () => {
    expect(approverRolesFor("QA").sort()).toEqual(["ADMIN", "QA_LEAD", "SUPER_ADMIN"]);
    expect(approverRolesFor("QA_LEAD").sort()).toEqual(["ADMIN", "QA_LEAD", "SUPER_ADMIN"]);
    expect(approverRolesFor("ADMIN").sort()).toEqual(["ADMIN", "SUPER_ADMIN"]);
    expect(approverRolesFor("SUPER_ADMIN")).toEqual(["SUPER_ADMIN"]);
  });
});
