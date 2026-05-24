import { schedules, logger } from "@trigger.dev/sdk";
import { db } from "@/lib/db";
import { deliverCheckpoint } from "@/lib/agent/checkpoint-delivery";

/**
 * Recovery outbox for stranded HITL checkpoints.
 *
 * After Phase 3.2 (commit 1d275f5), the approve/reject routes split
 * decision commit (Phase 1) from delivery to Trigger.dev (Phase 2). If
 * Phase 2 fails AFTER Phase 1 commits (e.g. a Trigger.dev 5xx, network
 * partition, or worker crash between resolveWaitToken and the waitToken
 * null-out), the checkpoint is "stranded": status != PENDING but
 * waitToken is still set. The UI hides resolved checkpoints, so the
 * user has no surface to retry; the agent would otherwise wait until
 * the wait-token's natural timeout.
 *
 * This cron polls every minute for stranded rows and re-runs the shared
 * deliverCheckpoint helper (the same one the routes call for Phase 2).
 * The helper acquires a per-checkpoint advisory lock and replays the
 * PERSISTED decisionPayload, so:
 *   - a concurrent UI retry and the cron will serialize on the lock —
 *     exactly one delivery wins
 *   - the agent always sees the originally committed decision; the
 *     cron cannot substitute its own payload
 *
 * If Trigger.dev is down for an extended period, the outbox will retry
 * on every tick — that is intentional. Once Trigger recovers, the next
 * tick delivers and the row drops out of the candidate set.
 *
 * Starvation safeguard: ordering is `lastDeliveryAttemptAt ASC NULLS
 * FIRST, decidedAt ASC`. The helper bumps attemptCount +
 * lastDeliveryAttemptAt on every attempt (even failed ones), so a
 * batch of permanently-failing rows gets pushed to the back of the
 * queue and newer never-tried rows (NULL lastDeliveryAttemptAt) are
 * processed first. Combined with the terminalError quarantine below,
 * a one-time backlog of broken rows cannot starve fresh traffic.
 *
 * Terminal quarantine: after MAX_ATTEMPTS failed deliveries the row is
 * stamped with terminalError and excluded from future selects. An
 * operator can clear terminalError manually (or a manual UI retry will
 * clear it on success) to put the row back in rotation.
 *
 * Batch is capped at 50 rows per tick so a one-time backlog after a
 * long outage doesn't fan out into a thundering herd.
 */
const MAX_ATTEMPTS = 10;

export const checkpointDeliveryOutboxTask = schedules.task({
  id: "checkpoint-delivery-outbox",
  // Every minute, UTC. Cron format: min hour dom month dow.
  cron: "* * * * *",
  maxDuration: 300,
  run: async () => {
    const stranded = await db.humanCheckpoint.findMany({
      where: {
        status: { not: "PENDING" },
        waitToken: { not: null },
        terminalError: null,
      },
      select: {
        id: true,
        runId: true,
        status: true,
        createdAt: true,
        decidedAt: true,
        attemptCount: true,
      },
      // Cap the batch so a one-time backlog doesn't all run at once.
      take: 50,
      // Least-recently-attempted first, nulls (never-tried) first. This
      // prevents a backlog of permanently-failing rows that fill the
      // top-50 cap from starving newer recoverable rows.
      orderBy: [
        { lastDeliveryAttemptAt: { sort: "asc", nulls: "first" } },
        { decidedAt: "asc" },
      ],
    });

    if (stranded.length === 0) {
      logger.info("checkpoint-outbox: nothing to deliver");
      return {
        considered: 0,
        delivered: 0,
        alreadyDelivered: 0,
        errors: 0,
        terminal: 0,
      };
    }

    let delivered = 0;
    let alreadyDelivered = 0;
    let errors = 0;
    let terminal = 0;

    for (const cp of stranded) {
      try {
        const r = await deliverCheckpoint(cp.id);
        if (r.outcome === "delivered") delivered += 1;
        else if (r.outcome === "already_delivered") alreadyDelivered += 1;
      } catch (err) {
        errors += 1;
        const reason = err instanceof Error ? err.message : String(err);
        logger.error("checkpoint-outbox: delivery failed", {
          checkpointId: cp.id,
          runId: cp.runId,
          attemptCount: cp.attemptCount + 1,
          reason,
        });
        // The helper bumped attemptCount BEFORE throwing, so the
        // in-DB value is now `cp.attemptCount + 1`. Once that crosses
        // MAX_ATTEMPTS, quarantine the row so it stops dominating
        // future selects (and operator alerts).
        if (cp.attemptCount + 1 >= MAX_ATTEMPTS) {
          terminal += 1;
          try {
            await db.humanCheckpoint.update({
              where: { id: cp.id },
              data: { terminalError: reason.slice(0, 500) },
            });
            logger.warn("checkpoint-outbox: marked terminal", {
              checkpointId: cp.id,
              runId: cp.runId,
              attemptCount: cp.attemptCount + 1,
              reason: reason.slice(0, 500),
            });
          } catch (markErr) {
            logger.error("checkpoint-outbox: failed to mark terminal", {
              checkpointId: cp.id,
              runId: cp.runId,
              reason: markErr instanceof Error ? markErr.message : String(markErr),
            });
          }
        }
      }
    }

    logger.info("checkpoint-outbox: done", {
      considered: stranded.length,
      delivered,
      alreadyDelivered,
      errors,
      terminal,
    });

    return {
      considered: stranded.length,
      delivered,
      alreadyDelivered,
      errors,
      terminal,
    };
  },
});
