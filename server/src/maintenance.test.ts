import { describe, it, expect } from "vitest";
import { maintenanceActive, maintenanceUpcoming, settleWindow } from "./maintenance.js";

const now = new Date("2026-08-08T12:00:00Z");
const at = (mins: number) => new Date(now.getTime() + mins * 60_000);
const off = { maintenanceMode: false };

describe("maintenanceActive", () => {
  it("is off with no flag and no window", () => {
    expect(maintenanceActive(off, now)).toBe(false);
    expect(maintenanceActive(null, now)).toBe(false);
  });
  it("follows the manual switch on its own", () => {
    expect(maintenanceActive({ maintenanceMode: true }, now)).toBe(true);
  });
  it("stays off before the window opens", () => {
    expect(maintenanceActive({ ...off, maintenanceStartAt: at(30), maintenanceEndAt: at(90) }, now)).toBe(false);
  });
  it("is on inside the window", () => {
    expect(maintenanceActive({ ...off, maintenanceStartAt: at(-10), maintenanceEndAt: at(50) }, now)).toBe(true);
  });
  it("lifts itself after the window when autoEnd is on", () => {
    const s = { ...off, maintenanceStartAt: at(-120), maintenanceEndAt: at(-10), maintenanceAutoEnd: true };
    expect(maintenanceActive(s, now)).toBe(false);
  });
  it("stays on after the window when autoEnd is off", () => {
    const s = { ...off, maintenanceStartAt: at(-120), maintenanceEndAt: at(-10), maintenanceAutoEnd: false };
    expect(maintenanceActive(s, now)).toBe(true);
  });
  it("treats a window with no end as open-ended", () => {
    expect(maintenanceActive({ ...off, maintenanceStartAt: at(-1) }, now)).toBe(true);
  });
});

describe("maintenanceUpcoming", () => {
  it("is true only before the start", () => {
    expect(maintenanceUpcoming({ ...off, maintenanceStartAt: at(30) }, now)).toBe(true);
    expect(maintenanceUpcoming({ ...off, maintenanceStartAt: at(-1) }, now)).toBe(false);
    expect(maintenanceUpcoming(off, now)).toBe(false);
  });
});

describe("settleWindow", () => {
  it("does nothing while the window is still running", () => {
    expect(settleWindow({ ...off, maintenanceStartAt: at(-10), maintenanceEndAt: at(10) }, now)).toBeNull();
  });
  it("does nothing without an end date", () => {
    expect(settleWindow({ ...off, maintenanceStartAt: at(-10) }, now)).toBeNull();
  });
  it("clears the dates and leaves the flag alone when autoEnd is on", () => {
    const s = { ...off, maintenanceStartAt: at(-60), maintenanceEndAt: at(-1), maintenanceAutoEnd: true };
    expect(settleWindow(s, now)).toEqual({ maintenanceStartAt: null, maintenanceEndAt: null });
  });
  it("turns the window into the manual switch when autoEnd is off", () => {
    const s = { ...off, maintenanceStartAt: at(-60), maintenanceEndAt: at(-1), maintenanceAutoEnd: false };
    expect(settleWindow(s, now)).toEqual({
      maintenanceStartAt: null,
      maintenanceEndAt: null,
      maintenanceMode: true,
    });
  });
  it("settling a sticky window keeps maintenance on", () => {
    const s = { ...off, maintenanceStartAt: at(-60), maintenanceEndAt: at(-1), maintenanceAutoEnd: false };
    const settled = { ...s, ...settleWindow(s, now) };
    expect(maintenanceActive(settled, now)).toBe(true);
    // …and an admin switching it off now actually ends it.
    expect(maintenanceActive({ ...settled, maintenanceMode: false }, now)).toBe(false);
  });
});
