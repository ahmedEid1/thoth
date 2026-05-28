import type { RunStatus } from "@/components/runs/run-status-pill";

const ACTIVE = new Set<RunStatus>([
  "PENDING",
  "PLANNING",
  "AWAITING_PLAN_APPROVAL",
  "RETRIEVING",
  "AWAITING_PAPERS_APPROVAL",
  "ASSESSING",
  "DRAFTING",
  "DISCOVERING",
  "AWAITING_DISCOVERY_APPROVAL",
  "FETCHING",
  "SCREENING",
]);

/**
 * Bucket counts by terminal category. Used for the project page run
 * summary line. Exported for unit testing.
 *
 * Buckets:
 *   - completed: COMPLETED (drew a draft).
 *   - rejected: REJECTED (user deliberately aborted at an HITL gate).
 *   - failed:   FAILED (agent crashed — rate limit, bug, provider outage).
 *   - active:   every non-terminal state.
 *
 * M86/M87 differentiated REJECTED from FAILED visually (informational
 * vs error). M88 follows through: the summary line should split them
 * too so a project page reads "1 completed · 2 rejected" vs "1
 * completed · 2 failed" — very different things.
 */
export function bucketRuns(runs: { status: RunStatus | string }[]): {
  completed: number;
  rejected: number;
  failed: number;
  active: number;
} {
  let completed = 0;
  let rejected = 0;
  let failed = 0;
  let active = 0;
  for (const r of runs) {
    const s = r.status as RunStatus;
    if (s === "COMPLETED") completed++;
    else if (s === "REJECTED") rejected++;
    else if (s === "FAILED") failed++;
    else if (ACTIVE.has(s)) active++;
  }
  return { completed, rejected, failed, active };
}

/**
 * Render a one-line summary of run statuses for the project page.
 * Hides zero-count buckets so a fresh project doesn't read "0
 * completed · 0 active · 0 rejected · 0 failed". Returns null if
 * there's nothing to show (caller should skip rendering).
 */
export function RunsBreakdown({ runs }: { runs: { status: RunStatus | string }[] }) {
  const { completed, rejected, failed, active } = bucketRuns(runs);
  const parts: string[] = [];
  if (completed > 0) parts.push(`${completed} completed`);
  if (active > 0) parts.push(`${active} in progress`);
  if (rejected > 0) parts.push(`${rejected} rejected`);
  if (failed > 0) parts.push(`${failed} failed`);
  if (parts.length === 0) return null;
  return (
    <p className="text-xs text-muted-foreground tabular-nums">{parts.join(" · ")}</p>
  );
}
