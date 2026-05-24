import { db } from "@/lib/db";
import { resolveWaitToken } from "@/lib/trigger-client";

export type CheckpointDeliveryOutcome =
  | { outcome: "delivered" }
  | { outcome: "already_delivered" }
  | { outcome: "not_found" };

/**
 * Atomically deliver a HumanCheckpoint's wait-token to Trigger.dev and
 * null the token. Uses a per-checkpoint Postgres advisory lock so
 * concurrent callers (UI retry, outbox cron, recovery branch in
 * approve/reject) serialize on the same checkpoint.
 *
 * Always uses the PERSISTED decisionPayload — never an external payload —
 * so retries after a partial failure can't substitute their own decision.
 * Trigger.dev's wait.completeToken is documented idempotent (no-op success
 * on already-completed tokens), so a re-delivery after a rolled-back
 * null-out is safe.
 *
 * Attempt tracking: BEFORE entering the advisory-locked transaction we
 * increment `attemptCount` and stamp `lastDeliveryAttemptAt`. That update
 * is committed independently of the delivery transaction, so even when
 * the inner tx fails (Trigger 5xx, network partition) the attempt is
 * persisted. The outbox cron uses both fields to (a) order by
 * least-recently-attempted instead of strictly by decidedAt, preventing
 * a backlog of permanently-failing rows from starving newer recoverable
 * ones; and (b) escalate to `terminalError` once MAX_ATTEMPTS is hit.
 * Terminality is decided by the outbox, not here, because the outbox is
 * the only place that knows about the attempt-count threshold.
 *
 * Returns:
 *   - delivered: this call successfully delivered (or re-delivered) the token
 *   - already_delivered: waitToken was null when we got the lock — someone
 *     else got there first
 *   - not_found: checkpoint row no longer exists
 */
export async function deliverCheckpoint(
  checkpointId: string,
): Promise<CheckpointDeliveryOutcome> {
  // Phase 2A: claim attempt outside the delivery transaction so the
  // attempt-count bump persists even if the inner tx throws.
  // P2025 = "record to update not found"; treat as not_found.
  let claim: { waitToken: string | null } | null = null;
  try {
    claim = await db.humanCheckpoint.update({
      where: { id: checkpointId },
      data: {
        attemptCount: { increment: 1 },
        lastDeliveryAttemptAt: new Date(),
      },
      select: { waitToken: true },
    });
  } catch {
    return { outcome: "not_found" };
  }
  if (!claim.waitToken) return { outcome: "already_delivered" };

  // Phase 2B: advisory-locked delivery + waitToken null-out. Re-reads the
  // row under the lock so a concurrent UI retry that committed between
  // 2A and 2B observes already_delivered semantics rather than a
  // double-deliver.
  return db.$transaction(
    async (tx): Promise<CheckpointDeliveryOutcome> => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${checkpointId}))`;
      const row = await tx.humanCheckpoint.findUnique({
        where: { id: checkpointId },
        select: { waitToken: true, decisionPayload: true },
      });
      if (!row) return { outcome: "not_found" };
      if (!row.waitToken) return { outcome: "already_delivered" };
      await resolveWaitToken(
        row.waitToken,
        (row.decisionPayload ?? {}) as Record<string, unknown>,
      );
      await tx.humanCheckpoint.update({
        where: { id: checkpointId },
        // Clear terminalError too: if this is a manual UI retry of a row
        // the outbox previously marked terminal, success should reset
        // the row's quarantine flag.
        data: { waitToken: null, terminalError: null },
      });
      return { outcome: "delivered" };
    },
    { timeout: 30_000 },
  );
}
