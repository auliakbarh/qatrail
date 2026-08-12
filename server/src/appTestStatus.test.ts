import { describe, it, expect } from "vitest";
import { deriveStatus } from "./appTestStatus.js";

describe("deriveStatus", () => {
  it("CLOSED wins regardless of other state", () => {
    expect(deriveStatus({ closed: true, assignedCount: 5, coveragePercent: 100, activity: 3 })).toBe("CLOSED");
    expect(deriveStatus({ closed: true, assignedCount: 0, coveragePercent: 0, activity: 0 })).toBe("CLOSED");
  });
  it("OPEN when nothing assigned", () => {
    expect(deriveStatus({ closed: false, assignedCount: 0, coveragePercent: 0, activity: 0 })).toBe("OPEN");
  });
  it("ASSIGNED when assigned but no activity", () => {
    expect(deriveStatus({ closed: false, assignedCount: 3, coveragePercent: 0, activity: 0 })).toBe("ASSIGNED");
  });
  it("IN_TESTING when assigned with records/issues but not all passed", () => {
    expect(deriveStatus({ closed: false, assignedCount: 3, coveragePercent: 50, activity: 2 })).toBe("IN_TESTING");
  });
  it("PASSED when coverage is 100%", () => {
    expect(deriveStatus({ closed: false, assignedCount: 3, coveragePercent: 100, activity: 3 })).toBe("PASSED");
  });

  describe("with peer review on", () => {
    const green = { closed: false, assignedCount: 3, coveragePercent: 100, activity: 3, reviewRequired: true };

    it("full coverage is not PASSED until a peer approves", () => {
      expect(deriveStatus({ ...green, reviewState: null })).toBe("IN_TESTING");
      expect(deriveStatus({ ...green, reviewState: "CHANGES_REQUESTED" })).toBe("IN_TESTING");
      expect(deriveStatus({ ...green, reviewState: "APPROVED" })).toBe("PASSED");
    });

    it("IN_REVIEW while a peer has it, even if a late FAIL dropped coverage", () => {
      expect(deriveStatus({ ...green, reviewState: "IN_REVIEW" })).toBe("IN_REVIEW");
      expect(deriveStatus({ ...green, coveragePercent: 40, reviewState: "IN_REVIEW" })).toBe("IN_REVIEW");
    });

    it("CLOSED still wins", () => {
      expect(deriveStatus({ ...green, closed: true, reviewState: "IN_REVIEW" })).toBe("CLOSED");
    });

    it("switching the setting off releases whatever was waiting", () => {
      expect(deriveStatus({ ...green, reviewRequired: false, reviewState: "IN_REVIEW" })).toBe("PASSED");
    });
  });
});
