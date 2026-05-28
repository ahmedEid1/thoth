import { describe, it, expect } from "vitest";
import { resolveSearchMaxHits } from "@/lib/eval/search-max-hits";

describe("resolveSearchMaxHits", () => {
  it("returns the golden's searchMaxHits when there is no env override", () => {
    expect(resolveSearchMaxHits({ searchMaxHits: 4 }, undefined)).toBe(4);
  });

  it("lets the env override take precedence over the golden (paid-provider bigger set)", () => {
    expect(resolveSearchMaxHits({ searchMaxHits: 4 }, "50")).toBe(50);
  });

  it("applies the env override even when the golden declares no cap", () => {
    expect(resolveSearchMaxHits({}, "30")).toBe(30);
  });

  it("falls back to the golden when the env value is not a positive integer", () => {
    expect(resolveSearchMaxHits({ searchMaxHits: 4 }, "0")).toBe(4);
    expect(resolveSearchMaxHits({ searchMaxHits: 4 }, "-5")).toBe(4);
    expect(resolveSearchMaxHits({ searchMaxHits: 4 }, "abc")).toBe(4);
    expect(resolveSearchMaxHits({ searchMaxHits: 4 }, "3.5")).toBe(4);
  });

  it("returns undefined when neither env nor golden sets a cap (discoverer default applies)", () => {
    expect(resolveSearchMaxHits({}, undefined)).toBeUndefined();
  });

  it("trims surrounding whitespace in the env value", () => {
    expect(resolveSearchMaxHits({ searchMaxHits: 4 }, "  20  ")).toBe(20);
  });
});
