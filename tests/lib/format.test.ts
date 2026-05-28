import { describe, it, expect } from "vitest";
import { compactCount } from "@/lib/format";

describe("compactCount", () => {
  it("renders <10k with locale grouping", () => {
    expect(compactCount(0)).toBe("0");
    expect(compactCount(1)).toBe("1");
    expect(compactCount(1_234)).toBe("1,234");
    expect(compactCount(9_999)).toBe("9,999");
  });

  it("renders 10k..1M as integer-k", () => {
    expect(compactCount(10_000)).toBe("10k");
    expect(compactCount(121_463)).toBe("121k");
    expect(compactCount(999_499)).toBe("999k");
  });

  it("escalates to M-tier when k-rounding would produce '1000k'", () => {
    // 999_500 rounds to 1000k under toFixed(0). Escalate to "1.0M"
    // instead — no surface in the app should ever render "1000k".
    expect(compactCount(999_500)).toBe("1.0M");
    expect(compactCount(999_999)).toBe("1.0M");
  });

  it("renders >=1M as 1-decimal M", () => {
    expect(compactCount(1_000_000)).toBe("1.0M");
    expect(compactCount(1_234_567)).toBe("1.2M");
    expect(compactCount(23_400_000)).toBe("23.4M");
  });

  it("preserves sign on negatives", () => {
    expect(compactCount(-1_234)).toBe("-1,234");
    expect(compactCount(-50_000)).toBe("-50k");
    expect(compactCount(-1_500_000)).toBe("-1.5M");
  });

  it("renders non-finite as '0' (defensive)", () => {
    expect(compactCount(NaN)).toBe("0");
    expect(compactCount(Infinity)).toBe("0");
    expect(compactCount(-Infinity)).toBe("0");
  });
});
