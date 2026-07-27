import { prisma } from "./db.js";
import { logger } from "./logger.js";
import { notify } from "./notify.js";
import { slaTargets, classifyResolve, respondBreached } from "./sla.js";

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

export function startScheduler() {
  log.info("SLA scheduler started");
  void checkSla();
  setInterval(() => void checkSla(), CHECK_MS);
}
