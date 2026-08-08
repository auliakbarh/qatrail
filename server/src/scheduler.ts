import { prisma } from "./db.js";
import { logger } from "./logger.js";
import { notify } from "./notify.js";
import { slaTargets, classifyResolve, respondBreached } from "./sla.js";
import { autoApproveCutoff } from "./approval.js";
import { autoApproveRequest } from "./resolvers/approvalRequest.js";
import { settleWindow } from "./maintenance.js";

const log = logger.child({ mod: "scheduler" });

const CHECK_MS = 5 * 60_000; // every 5 minutes

async function checkSla() {
  try {
    const now = new Date();
    const targets = await slaTargets();
    // Open production issues that haven't already been notified for each breach.
    const issues = await prisma.issue.findMany({
      where: { environment: "PRODUCTION", isProductionIssue: true, archived: false, resolvedAt: null },
      select: {
        id: true, title: true, assigneeId: true, priority: true, createdAt: true,
        respondedAt: true, slaRespondNotifiedAt: true, slaResolveNotifiedAt: true,
      },
    });
    for (const i of issues) {
      if (!i.slaRespondNotifiedAt && respondBreached(i, targets, now)) {
        await notify(i.assigneeId, "SLA_RESPOND", `SLA respond breached: ${i.title}`, i.id);
        await prisma.issue.update({ where: { id: i.id }, data: { slaRespondNotifiedAt: now } });
      }
      if (!i.slaResolveNotifiedAt && classifyResolve({ ...i, resolvedAt: null }, targets, now) === "breached") {
        await notify(i.assigneeId, "SLA_RESOLVE", `SLA resolve breached: ${i.title}`, i.id);
        await prisma.issue.update({ where: { id: i.id }, data: { slaResolveNotifiedAt: now } });
      }
    }
  } catch (err) {
    log.error({ err }, "sla check failed");
  }
}

// Approve whatever has waited out the admin's auto-approve window. reviewedById
// stays null so the decision reads as "auto-approved" rather than naming someone
// who never looked at it. Runs on the same 5-minute tick, so the effective delay
// is the configured window rounded up to the next tick.
async function sweepAutoApprovals() {
  try {
    const now = new Date();
    const s = await prisma.setting.findUnique({ where: { id: "singleton" } });
    const newCut = autoApproveCutoff(s?.autoApproveNewHours, now);
    const changeCut = autoApproveCutoff(s?.autoApproveChangeHours, now);

    if (newCut) {
      // A rejected case is a decision — only untouched PENDING ones ripen.
      // Pick the ids first: firstApprovedAt is set once and never overwritten, so
      // the second pass has to be limited to what this sweep just approved —
      // otherwise it would also stamp legacy rows that never had a review.
      const due = await prisma.testCase.findMany({
        where: { approval: "PENDING", updatedAt: { lte: newCut } },
        select: { id: true, firstApprovedAt: true },
      });
      if (due.length) {
        await prisma.testCase.updateMany({
          where: { id: { in: due.map((c) => c.id) } },
          data: { approval: "APPROVED", reviewedAt: now, reviewedById: null },
        });
        const firstTime = due.filter((c) => !c.firstApprovedAt).map((c) => c.id);
        if (firstTime.length) {
          await prisma.testCase.updateMany({ where: { id: { in: firstTime } }, data: { firstApprovedAt: now } });
        }
        log.info({ count: due.length }, "auto-approved test cases");
      }
    }
    if (changeCut) {
      const due = await prisma.approvalRequest.findMany({
        where: { state: "PENDING", requestedAt: { lte: changeCut } },
        select: { id: true },
      });
      for (const r of due) {
        // Reuse the normal path so the action actually runs and the requester
        // hears about it; a bad target (deleted feature) must not kill the sweep.
        try {
          await autoApproveRequest(r.id, now);
        } catch (err) {
          log.warn({ err, requestId: r.id }, "auto-approve request failed");
        }
      }
      if (due.length) log.info({ count: due.length }, "auto-approved test case changes");
    }
  } catch (err) {
    log.error({ err }, "auto-approve sweep failed");
  }
}

// Fold a finished maintenance window back into the stored flag. `maintenanceActive`
// already answers correctly while this is pending, so the tick's lag is invisible;
// what this buys is a switch an admin can actually turn off afterwards.
async function settleMaintenance() {
  try {
    const s = await prisma.setting.findUnique({ where: { id: "singleton" } });
    const data = settleWindow(s);
    if (!data) return;
    await prisma.setting.update({ where: { id: "singleton" }, data });
    log.info({ data }, "maintenance window settled");
  } catch (e) {
    log.error({ err: e }, "settleMaintenance failed");
  }
}

export function startScheduler() {
  log.info("SLA scheduler started");
  void checkSla();
  void sweepAutoApprovals();
  void settleMaintenance();
  setInterval(() => void checkSla(), CHECK_MS);
  setInterval(() => void sweepAutoApprovals(), CHECK_MS);
  setInterval(() => void settleMaintenance(), CHECK_MS);
}
