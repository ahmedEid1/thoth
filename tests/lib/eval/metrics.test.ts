import { describe, it, expect } from "vitest";
import {
  citationRecall,
  citationPrecision,
  claimFaithfulness,
  expectedClaimCoverage,
  discoveryRecall,
  screeningPrecision,
} from "@/lib/eval/metrics";

describe("citationRecall", () => {
  it("returns 1.0 when all expected papers are included", () => {
    expect(citationRecall(["a", "b"], ["a", "b", "c"])).toBe(1);
  });
  it("returns 0.0 when no expected papers are included", () => {
    expect(citationRecall(["a", "b"], ["c", "d"])).toBe(0);
  });
  it("returns the correct fraction for partial overlap", () => {
    expect(citationRecall(["a", "b", "c", "d"], ["a", "b", "x"])).toBe(0.5);
  });
  it("returns 1.0 when expected is empty (vacuously true)", () => {
    expect(citationRecall([], ["a"])).toBe(1);
  });
});

describe("citationPrecision", () => {
  it("returns 1.0 when every included paper is expected", () => {
    expect(citationPrecision(["a", "b"], ["a", "b"])).toBe(1);
  });
  it("returns 0.5 when half the included are expected", () => {
    expect(citationPrecision(["a", "b"], ["a", "b", "c", "d"])).toBe(0.5);
  });
  it("returns 1.0 when included is empty (vacuously true)", () => {
    expect(citationPrecision(["a"], [])).toBe(1);
  });
});

describe("claimFaithfulness", () => {
  it("returns 1.0 when all claim checks are SUPPORTED", () => {
    expect(
      claimFaithfulness([
        { verdict: "SUPPORTED" },
        { verdict: "SUPPORTED" },
      ]),
    ).toBe(1);
  });
  it("returns 0.0 when none are supported", () => {
    expect(
      claimFaithfulness([
        { verdict: "UNSUPPORTED" },
        { verdict: "UNCLEAR" },
      ]),
    ).toBe(0);
  });
  it("returns the supported fraction", () => {
    expect(
      claimFaithfulness([
        { verdict: "SUPPORTED" },
        { verdict: "SUPPORTED" },
        { verdict: "UNCLEAR" },
        { verdict: "UNSUPPORTED" },
      ]),
    ).toBe(0.5);
  });
  it("returns 1.0 when no claim checks (vacuously true)", () => {
    expect(claimFaithfulness([])).toBe(1);
  });
});

describe("expectedClaimCoverage", () => {
  it("returns 1.0 when every expected claim's terms appear in draft (case-insensitive)", () => {
    const draft = "The result is X improves Y by 25%. Also CBT outperforms standard care.";
    expect(
      expectedClaimCoverage(["X improves Y", "cbt outperforms"], draft),
    ).toBe(1);
  });
  it("returns 0.5 when half are present", () => {
    const draft = "The result is X improves Y by 25%.";
    expect(
      expectedClaimCoverage(["X improves Y", "CBT outperforms"], draft),
    ).toBe(0.5);
  });
  it("returns 1.0 when expected is empty (vacuously true)", () => {
    expect(expectedClaimCoverage([], "anything")).toBe(1);
  });

  // The headline fix: the old exact-substring check scored ~0 against any
  // paraphrasing LLM draft. Token-overlap + light stemming credits a finding
  // when the draft discusses it with different word order / inflection.
  it("credits a paraphrased finding the old substring check would have missed", () => {
    // "TDD increases test coverage" never appears verbatim, but every key
    // term does (with tense/order variation).
    const draft =
      "Across the studies, test-driven development consistently increased automated " +
      "test coverage relative to test-after teams.";
    expect(expectedClaimCoverage(["TDD increases test coverage"], draft)).toBe(0);
    // ^ "TDD" (acronym) isn't in the prose, so this finding is NOT covered —
    // the metric stays honest: a key term genuinely absent means not covered.

    const draftWithAcronym =
      "TDD consistently increased automated test coverage relative to test-after teams.";
    expect(expectedClaimCoverage(["TDD increases test coverage"], draftWithAcronym)).toBe(1);
  });

  it("matches across inflection (plural / tense) via the light stemmer", () => {
    const draft = "The intervention reduced production defects markedly.";
    // "reduces" → "reduc" matches "reduced"; "defects" → "defect" matches.
    expect(expectedClaimCoverage(["reduces production defects"], draft)).toBe(1);
  });

  it("does not credit a finding whose key term is absent", () => {
    const draft = "Test-driven development increased coverage and slowed initial delivery.";
    expect(expectedClaimCoverage(["TDD reduces production defects"], draft)).toBe(0);
  });

  it("ignores word order and stopwords", () => {
    const draft = "Coverage of tests was higher under the development approach.";
    expect(expectedClaimCoverage(["development coverage of tests"], draft)).toBe(1);
  });
});

describe("discoveryRecall (V2)", () => {
  it("returns 1.0 when expected is empty (vacuously true)", () => {
    expect(discoveryRecall([], ["x", "y"])).toBe(1);
  });
  it("returns 1.0 when every expected DOI was surfaced", () => {
    expect(discoveryRecall(["10.1/a", "10.1/b"], ["10.1/a", "10.1/b", "10.1/c"])).toBe(1);
  });
  it("returns the fraction of expected DOIs found", () => {
    expect(discoveryRecall(["10.1/a", "10.1/b", "10.1/c", "10.1/d"], ["10.1/a", "10.1/c"])).toBe(0.5);
  });
  it("returns 0 when none of the expected DOIs were surfaced", () => {
    expect(discoveryRecall(["10.1/a"], ["10.1/b", "10.1/c"])).toBe(0);
  });
});

describe("screeningPrecision (V2)", () => {
  it("returns 1.0 when the screener admitted zero papers (vacuously true)", () => {
    expect(screeningPrecision(["10.1/a"], [])).toBe(1);
  });
  it("returns 1.0 when every admitted paper was expected", () => {
    expect(screeningPrecision(["10.1/a", "10.1/b"], ["10.1/a"])).toBe(1);
  });
  it("returns the fraction of admitted-and-expected papers", () => {
    expect(screeningPrecision(["10.1/a", "10.1/b"], ["10.1/a", "10.1/c", "10.1/d"])).toBeCloseTo(1 / 3);
  });
  it("returns 0 when none of the admitted papers were on the expected list", () => {
    expect(screeningPrecision(["10.1/a"], ["10.1/c", "10.1/d"])).toBe(0);
  });
});
