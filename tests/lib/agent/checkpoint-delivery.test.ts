import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    $transaction: vi.fn(),
    humanCheckpoint: {
      update: vi.fn(),
    },
  },
}));
vi.mock("@/lib/trigger-client", () => ({
  resolveWaitToken: vi.fn(),
}));

import { db } from "@/lib/db";
import { resolveWaitToken } from "@/lib/trigger-client";
import { deliverCheckpoint } from "@/lib/agent/checkpoint-delivery";

beforeEach(() => vi.clearAllMocks());

type Row = {
  waitToken: string | null;
  decisionPayload: unknown;
} | null;

/**
 * Mirror of the helper's `db.$transaction` surface so we can assert the
 * exact order of operations inside the helper:
 *   advisory lock -> findUnique -> resolveWaitToken -> update(waitToken=null)
 *
 * `row` simulates the row that `findUnique` returns. Spies capture every
 * call so the test can assert nothing is called when it shouldn't be
 * (e.g. resolveWaitToken must NOT fire when waitToken is null).
 */
function installTxMock(row: Row) {
  const executeRaw = vi.fn();
  const findUnique = vi.fn().mockResolvedValue(row);
  const update = vi.fn().mockResolvedValue({});

  vi.mocked(db.$transaction).mockImplementation((async (fnOrOps: unknown) => {
    const fn = fnOrOps as (t: unknown) => unknown;
    const tx = {
      $executeRaw: (async (...args: unknown[]) => {
        executeRaw(...args);
        return 1;
      }) as never,
      humanCheckpoint: {
        findUnique: findUnique as never,
        update: update as never,
      },
    };
    return fn(tx);
  }) as never);

  return { executeRaw, findUnique, update };
}

/**
 * Default Phase-2A claim behaviour. Returns a row whose waitToken matches
 * what the inner tx is going to see, unless an override is provided.
 */
function installClaimMock(claim: { waitToken: string | null } | "throw") {
  if (claim === "throw") {
    vi.mocked(db.humanCheckpoint.update).mockRejectedValueOnce(
      new Error("P2025 not found"),
    );
    return;
  }
  vi.mocked(db.humanCheckpoint.update).mockResolvedValueOnce(claim as never);
}

describe("deliverCheckpoint", () => {
  it("delivers when waitToken is non-null — calls resolveWaitToken with the PERSISTED payload, then nulls the token", async () => {
    const persisted = { approved: true, corpusItemIds: ["c1", "c2"] };
    installClaimMock({ waitToken: "tk_x" });
    const { executeRaw, findUnique, update } = installTxMock({
      waitToken: "tk_x",
      decisionPayload: persisted,
    });

    const result = await deliverCheckpoint("cp1");

    expect(result).toEqual({ outcome: "delivered" });
    // Advisory lock acquired with hashtext(<id>).
    expect(executeRaw).toHaveBeenCalledTimes(1);
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: "cp1" },
      select: { waitToken: true, decisionPayload: true },
    });
    // Critical invariant: delivered the persisted payload exactly.
    expect(resolveWaitToken).toHaveBeenCalledTimes(1);
    expect(resolveWaitToken).toHaveBeenCalledWith("tk_x", persisted);
    // On success the helper ALSO clears terminalError so a manual UI
    // retry can rescue a row the outbox previously quarantined.
    expect(update).toHaveBeenCalledWith({
      where: { id: "cp1" },
      data: { waitToken: null, terminalError: null },
    });
  });

  it("delivers an empty object when decisionPayload is null in the row", async () => {
    // Sanity: the helper coerces null/undefined decisionPayload to {} so
    // Trigger doesn't receive `null` as the resume payload.
    installClaimMock({ waitToken: "tk_x" });
    const { update } = installTxMock({
      waitToken: "tk_x",
      decisionPayload: null,
    });

    const result = await deliverCheckpoint("cp1");

    expect(result).toEqual({ outcome: "delivered" });
    expect(resolveWaitToken).toHaveBeenCalledWith("tk_x", {});
    expect(update).toHaveBeenCalled();
  });

  it("returns already_delivered when the Phase-2A claim sees a null waitToken — does NOT enter the delivery tx", async () => {
    installClaimMock({ waitToken: null });
    const { update } = installTxMock({
      waitToken: null,
      decisionPayload: { approved: true },
    });

    const result = await deliverCheckpoint("cp1");

    expect(result).toEqual({ outcome: "already_delivered" });
    expect(resolveWaitToken).not.toHaveBeenCalled();
    // Phase-2B never ran.
    expect(update).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("returns not_found when the Phase-2A update throws (missing row)", async () => {
    installClaimMock("throw");
    const { update } = installTxMock(null);

    const result = await deliverCheckpoint("cp_missing");

    expect(result).toEqual({ outcome: "not_found" });
    expect(resolveWaitToken).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("accepts no external payload — signature forces persisted-only delivery", () => {
    // Compile-time / structural assertion: deliverCheckpoint takes a
    // single string id. There is no way to pass a substitute payload.
    // This is the invariant that prevents an audit-divergent retry.
    // If anyone adds a payload param, this test will start failing the
    // arity check below and force a code-review conversation.
    expect(deliverCheckpoint.length).toBe(1);
  });

  describe("attempt tracking", () => {
    it("bumps attemptCount + lastDeliveryAttemptAt BEFORE entering the delivery tx (so the bump persists even on failure)", async () => {
      installClaimMock({ waitToken: "tk_x" });
      installTxMock({ waitToken: "tk_x", decisionPayload: {} });

      await deliverCheckpoint("cp1");

      const claimUpdate = vi.mocked(db.humanCheckpoint.update).mock.calls[0]![0];
      expect(claimUpdate).toEqual({
        where: { id: "cp1" },
        data: {
          attemptCount: { increment: 1 },
          lastDeliveryAttemptAt: expect.any(Date),
        },
        select: { waitToken: true },
      });
    });

    it("persists the attempt bump even when delivery throws inside the tx", async () => {
      // Phase-2A succeeds (the bump commits independently).
      installClaimMock({ waitToken: "tk_x" });
      // Phase-2B's transaction explodes. The thrown error must propagate
      // to the caller (the outbox decides terminality), and the helper
      // must NOT swallow it.
      vi.mocked(db.$transaction).mockRejectedValueOnce(new Error("Trigger 503"));

      await expect(deliverCheckpoint("cp1")).rejects.toThrow("Trigger 503");

      // The attempt-bump update was still called before the tx.
      expect(db.humanCheckpoint.update).toHaveBeenCalledTimes(1);
      const claimCall = vi.mocked(db.humanCheckpoint.update).mock.calls[0]![0];
      expect(claimCall).toMatchObject({
        where: { id: "cp1" },
        data: expect.objectContaining({
          attemptCount: { increment: 1 },
        }),
      });
    });

    it("clears terminalError on successful delivery so a manual UI retry rescues a previously quarantined row", async () => {
      installClaimMock({ waitToken: "tk_x" });
      const { update } = installTxMock({
        waitToken: "tk_x",
        decisionPayload: { approved: true },
      });

      const result = await deliverCheckpoint("cp1");

      expect(result).toEqual({ outcome: "delivered" });
      // The successful update inside the tx must include terminalError:
      // null so a row the outbox previously marked terminal goes back
      // into rotation after a successful manual retry.
      const innerUpdateCall = update.mock.calls.find(
        (c) =>
          (c[0] as { data?: { terminalError?: unknown } }).data?.terminalError === null,
      );
      expect(innerUpdateCall).toBeDefined();
      expect(innerUpdateCall![0]).toEqual({
        where: { id: "cp1" },
        data: { waitToken: null, terminalError: null },
      });
    });
  });
});
