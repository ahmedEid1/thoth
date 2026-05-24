-- Add delivery-attempt tracking to HumanCheckpoint so the outbox can
-- (a) order by least-recently-attempted instead of decidedAt, and
-- (b) skip rows marked terminally failed.
ALTER TABLE "HumanCheckpoint"
  ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastDeliveryAttemptAt" TIMESTAMP(3),
  ADD COLUMN "terminalError" TEXT;

CREATE INDEX "HumanCheckpoint_waitToken_terminalError_lastDeliveryAttemptAt_idx"
  ON "HumanCheckpoint" ("waitToken", "terminalError", "lastDeliveryAttemptAt");
