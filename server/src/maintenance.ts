// Maintenance mode: one derived answer, shared by the health query, the mutation
// guard and the scheduler, so the banner, the lockout and the sweep can never
// disagree about whether the instance is closed.

export interface MaintenanceState {
  maintenanceMode: boolean;
  maintenanceStartAt?: Date | null;
  maintenanceEndAt?: Date | null;
  // What happens when the window ends: true = maintenance lifts by itself,
  // false = it stays on until an admin switches it off.
  maintenanceAutoEnd?: boolean;
}

/**
 * Whether the instance is closed right now.
 *
 * Derived rather than stored so the window opens on the second, not on the next
 * five-minute scheduler tick. Once the window has passed, `scheduler.ts` folds
 * the result back into `maintenanceMode` and clears the dates — until it does,
 * the `!autoEnd` arm below keeps a sticky window closed.
 */
export function maintenanceActive(s: MaintenanceState | null | undefined, now = new Date()): boolean {
  if (!s) return false;
  if (s.maintenanceMode) return true;
  const start = s.maintenanceStartAt;
  if (!start || now < start) return false;
  const end = s.maintenanceEndAt;
  if (!end) return true; // open-ended window: closed until an admin ends it
  if (now < end) return true;
  return s.maintenanceAutoEnd === false;
}

/** True while a window is set and has not started yet — what the banner announces. */
export function maintenanceUpcoming(s: MaintenanceState | null | undefined, now = new Date()): boolean {
  if (!s?.maintenanceStartAt) return false;
  return now < s.maintenanceStartAt;
}

/**
 * What the scheduler should do with a window that has ended. Returns the fields
 * to write, or null when there is nothing to do.
 */
export function settleWindow(s: MaintenanceState | null | undefined, now = new Date()) {
  if (!s?.maintenanceEndAt || now < s.maintenanceEndAt) return null;
  const cleared = { maintenanceStartAt: null, maintenanceEndAt: null };
  // autoEnd lifts it; otherwise the window becomes the manual switch, which is
  // the only thing an admin can then turn off.
  return s.maintenanceAutoEnd === false ? { ...cleared, maintenanceMode: true } : cleared;
}
