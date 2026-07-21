import { prisma } from "./db.js";
import { logger } from "./logger.js";
import { notify } from "./notify.js";
import { slaTargets, classifyResolve, respondBreached } from "./sla.js";

const log = logger.child({ mod: "scheduler" });

// Dedupe SLA notifications within a process run.
// ponytail: in-memory; a breach can re-notify once after a restart. Persist a
// flag on Issue if that matters.
const notified = new Set<string>();

const CHECK_MS = 5 * 60_000; // every 5 minutes

async function checkSla() {
  try {
    const now = new Date();
    const targets = await slaTargets();
    // Open production issues that could breach (not yet closed/resolved).
    const issues = await prisma.issue.findMany({
      where: { environment: "PRODUCTION", archived: false, resolvedAt: null },
      select: { id: true, title: true, assigneeId: true, priority: true, createdAt: true, respondedAt: true },
    });
    for (const i of issues) {
      if (respondBreached(i, targets, now)) {
        const key = `respond:${i.id}`;
        if (!notified.has(key)) {
          notified.add(key);
          await notify(i.assigneeId, "SLA_RESPOND", `SLA respond breached: ${i.title}`, i.id);
        }
      }
      if (classifyResolve({ ...i, resolvedAt: null }, targets, now) === "breached") {
        const key = `resolve:${i.id}`;
        if (!notified.has(key)) {
          notified.add(key);
          await notify(i.assigneeId, "SLA_RESOLVE", `SLA resolve breached: ${i.title}`, i.id);
        }
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
