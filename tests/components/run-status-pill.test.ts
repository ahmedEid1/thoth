import { describe, it, expect } from "vitest";
import { statusLabel, type RunStatus } from "@/components/runs/run-status-pill";

describe("statusLabel", () => {
  it("renders simple statuses as lowercased + de-underscored", () => {
    expect(statusLabel("COMPLETED")).toBe("completed");
    expect(statusLabel("PENDING")).toBe("pending");
    expect(statusLabel("DRAFTING")).toBe("drafting");
    expect(statusLabel("FETCHING")).toBe("fetching");
    expect(statusLabel("SCREENING")).toBe("screening");
    expect(statusLabel("DISCOVERING")).toBe("discovering");
  });

  it("uses friendlier copy for AWAITING_* gates", () => {
    expect(statusLabel("AWAITING_PLAN_APPROVAL")).toBe("awaiting plan review");
    expect(statusLabel("AWAITING_PAPERS_APPROVAL")).toBe("awaiting paper review");
    expect(statusLabel("AWAITING_DISCOVERY_APPROVAL")).toBe("awaiting discovery review");
  });

  it("covers every RunStatus in the union (compile-time + runtime check)", () => {
    const all: RunStatus[] = [
      "PENDING",
      "PLANNING",
      "AWAITING_PLAN_APPROVAL",
      "RETRIEVING",
      "AWAITING_PAPERS_APPROVAL",
      "ASSESSING",
      "DRAFTING",
      "COMPLETED",
      "REJECTED",
      "FAILED",
      "DISCOVERING",
      "AWAITING_DISCOVERY_APPROVAL",
      "FETCHING",
      "SCREENING",
    ];
    for (const s of all) {
      expect(statusLabel(s).length).toBeGreaterThan(0);
    }
  });
});
