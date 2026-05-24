import { describe, it, expect, beforeEach, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return { logger };
});

vi.mock("@trigger.dev/sdk", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@trigger.dev/sdk");
  return {
    ...actual,
    // schedules.task returns the config object so we can call .run({}) in tests.
    schedules: {
      task: (cfg: { run: (payload: unknown) => Promise<unknown> }) => cfg,
    },
    logger: mocks.logger,
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    humanCheckpoint: { findMany: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("@/lib/agent/checkpoint-delivery", () => ({
  deliverCheckpoint: vi.fn(),
}));

import { db } from "@/lib/db";
import { deliverCheckpoint } from "@/lib/agent/checkpoint-delivery";

beforeEach(() => {
  vi.clearAllMocks();
});

async function loadTask() {
  const mod = await import("@/trigger/checkpoint-delivery-outbox");
  return mod.checkpointDeliveryOutboxTask as unknown as {
    id: string;
    cron: string;
    run: () => Promise<{
      considered: number;
      delivered: number;
      alreadyDelivered: number;
      errors: number;
      terminal: number;
    }>;
  };
}

/** Helper: a row shape matching the new `select` (incl. attemptCount). */
function row(
  id: string,
  runId: string,
  attemptCount = 0,
  status: "APPROVED" | "REJECTED" = "APPROVED",
) {
  return {
    id,
    runId,
    status,
    createdAt: new Date(),
    decidedAt: new Date(),
    attemptCount,
  };
}

describe("checkpoint-delivery-outbox task", () => {
  it("is scheduled every minute and has the expected id", async () => {
    const task = await loadTask();
    expect(task.id).toBe("checkpoint-delivery-outbox");
    expect(task.cron).toBe("* * * * *");
  });

  it("logs and returns zeros when no stranded checkpoints exist", async () => {
    vi.mocked(db.humanCheckpoint.findMany).mockResolvedValue([] as never);

    const task = await loadTask();
    const result = await task.run();

    expect(result).toEqual({
      considered: 0,
      delivered: 0,
      alreadyDelivered: 0,
      errors: 0,
      terminal: 0,
    });
    expect(deliverCheckpoint).not.toHaveBeenCalled();
    expect(mocks.logger.info).toHaveBeenCalledWith(
      "checkpoint-outbox: nothing to deliver",
    );
  });

  it("processes a batch: 2 delivered, 1 already_delivered, 0 errors", async () => {
    vi.mocked(db.humanCheckpoint.findMany).mockResolvedValue([
      row("cp1", "r1"),
      row("cp2", "r1", 0, "REJECTED"),
      row("cp3", "r2"),
    ] as never);
    vi.mocked(deliverCheckpoint)
      .mockResolvedValueOnce({ outcome: "delivered" })
      .mockResolvedValueOnce({ outcome: "delivered" })
      .mockResolvedValueOnce({ outcome: "already_delivered" });

    const task = await loadTask();
    const result = await task.run();

    expect(result).toEqual({
      considered: 3,
      delivered: 2,
      alreadyDelivered: 1,
      errors: 0,
      terminal: 0,
    });
    expect(deliverCheckpoint).toHaveBeenCalledTimes(3);
    expect(deliverCheckpoint).toHaveBeenNthCalledWith(1, "cp1");
    expect(deliverCheckpoint).toHaveBeenNthCalledWith(2, "cp2");
    expect(deliverCheckpoint).toHaveBeenNthCalledWith(3, "cp3");
  });

  it("isolates a failing delivery — other rows still process and errors are counted", async () => {
    vi.mocked(db.humanCheckpoint.findMany).mockResolvedValue([
      row("cp1", "r1"),
      row("cp2", "r1", 0, "REJECTED"),
      row("cp3", "r2"),
    ] as never);
    vi.mocked(deliverCheckpoint)
      .mockResolvedValueOnce({ outcome: "delivered" })
      .mockRejectedValueOnce(new Error("Trigger 503"))
      .mockResolvedValueOnce({ outcome: "delivered" });

    const task = await loadTask();
    const result = await task.run();

    expect(result).toEqual({
      considered: 3,
      delivered: 2,
      alreadyDelivered: 0,
      errors: 1,
      terminal: 0,
    });
    // All three rows were attempted — the throw on cp2 did NOT abort the loop.
    expect(deliverCheckpoint).toHaveBeenCalledTimes(3);
    expect(mocks.logger.error).toHaveBeenCalledWith(
      "checkpoint-outbox: delivery failed",
      expect.objectContaining({
        checkpointId: "cp2",
        runId: "r1",
        reason: "Trigger 503",
      }),
    );
  });

  it("queries with the starvation-safe filter: status != PENDING AND waitToken NOT NULL AND terminalError IS NULL, ordered by lastDeliveryAttemptAt asc nulls-first", async () => {
    vi.mocked(db.humanCheckpoint.findMany).mockResolvedValue([] as never);

    const task = await loadTask();
    await task.run();

    expect(db.humanCheckpoint.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: { not: "PENDING" },
          waitToken: { not: null },
          // Critical: skip rows already quarantined so they can't
          // hoard the top-50 cap and starve newer recoverable rows.
          terminalError: null,
        },
        take: 50,
        // Critical: never-tried rows (NULL lastDeliveryAttemptAt) MUST
        // come first; otherwise a backlog of failing rows would keep
        // returning to the front of the queue and block fresh traffic.
        orderBy: [
          { lastDeliveryAttemptAt: { sort: "asc", nulls: "first" } },
          { decidedAt: "asc" },
        ],
      }),
    );
  });

  it("selects attemptCount so the loop can compute terminality after a failure", async () => {
    vi.mocked(db.humanCheckpoint.findMany).mockResolvedValue([] as never);

    const task = await loadTask();
    await task.run();

    const args = vi.mocked(db.humanCheckpoint.findMany).mock.calls[0]![0] as {
      select: Record<string, boolean>;
    };
    expect(args.select.attemptCount).toBe(true);
  });

  it("marks a row terminal after MAX_ATTEMPTS (=10) failures", async () => {
    // Row arrived with attemptCount=9 from a prior tick; the helper
    // bumps to 10 before throwing → cp.attemptCount + 1 === MAX_ATTEMPTS.
    vi.mocked(db.humanCheckpoint.findMany).mockResolvedValue([
      row("cp_dead", "r_dead", 9),
    ] as never);
    vi.mocked(deliverCheckpoint).mockRejectedValueOnce(
      new Error("permanent: Trigger has forgotten this token"),
    );
    vi.mocked(db.humanCheckpoint.update).mockResolvedValue({} as never);

    const task = await loadTask();
    const result = await task.run();

    expect(result.errors).toBe(1);
    expect(result.terminal).toBe(1);
    // The row must be stamped with terminalError so future ticks skip it.
    expect(db.humanCheckpoint.update).toHaveBeenCalledWith({
      where: { id: "cp_dead" },
      data: { terminalError: expect.stringContaining("permanent") },
    });
    expect(mocks.logger.warn).toHaveBeenCalledWith(
      "checkpoint-outbox: marked terminal",
      expect.objectContaining({
        checkpointId: "cp_dead",
        attemptCount: 10,
      }),
    );
  });

  it("does NOT mark terminal when attempt count is still under MAX_ATTEMPTS", async () => {
    // attemptCount=5 → after helper bump = 6, well under threshold.
    vi.mocked(db.humanCheckpoint.findMany).mockResolvedValue([
      row("cp_recoverable", "r_x", 5),
    ] as never);
    vi.mocked(deliverCheckpoint).mockRejectedValueOnce(new Error("Trigger 503"));

    const task = await loadTask();
    const result = await task.run();

    expect(result.errors).toBe(1);
    expect(result.terminal).toBe(0);
    expect(db.humanCheckpoint.update).not.toHaveBeenCalled();
  });

  it("clamps terminalError text to 500 chars so a giant stack trace doesn't bloat the row", async () => {
    const huge = "x".repeat(2000);
    vi.mocked(db.humanCheckpoint.findMany).mockResolvedValue([
      row("cp_huge", "r_h", 9),
    ] as never);
    vi.mocked(deliverCheckpoint).mockRejectedValueOnce(new Error(huge));
    vi.mocked(db.humanCheckpoint.update).mockResolvedValue({} as never);

    const task = await loadTask();
    await task.run();

    const call = vi.mocked(db.humanCheckpoint.update).mock.calls[0]![0] as {
      data: { terminalError: string };
    };
    expect(call.data.terminalError.length).toBe(500);
  });
});
