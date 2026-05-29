import { describe, it, expect } from "vitest";
import {
  citationRecall,
  citationPrecision,
  claimFaithfulness,
  expectedClaimCoverage,
  discoveryRecall,
  screeningPrecision,
  paperMatchesExpected,
  discoveryRecallTolerant,
  screeningPrecisionTolerant,
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

// V2 identity-agnostic matching: the same work is indexed under its DOI by
// OpenAlex and its arXiv id by arXiv, so a paper found via either id (or an
// exact title) must count as discovered. These functions back a public
// dashboard metric, so their subtleties (arxiv: prefix, DOI case-insensitivity,
// title specificity guard) are pinned here. All pure — no DB/network.
describe("paperMatchesExpected", () => {
  it("matches on exact DOI", () => {
    expect(
      paperMatchesExpected({ externalId: "10.18653/v1/2024.acl-long.585" }, { doi: "10.18653/v1/2024.acl-long.585" }),
    ).toBe(true);
  });
  it("matches DOI case-insensitively", () => {
    expect(
      paperMatchesExpected({ externalId: "10.1109/ABC.2024" }, { doi: "10.1109/abc.2024" }),
    ).toBe(true);
  });
  it("matches the arxiv:<id> form", () => {
    expect(paperMatchesExpected({ externalId: "arxiv:2401.00396" }, { arxivId: "2401.00396" })).toBe(true);
  });
  it("matches a bare arxiv id", () => {
    expect(paperMatchesExpected({ externalId: "2401.00396" }, { arxivId: "2401.00396" })).toBe(true);
  });
  it("matches a sufficiently specific normalized title", () => {
    expect(
      paperMatchesExpected(
        { externalId: "openalex:W123", title: "RAGAs: Automated Evaluation of Retrieval Augmented Generation" },
        { title: "ragas  automated   evaluation of retrieval augmented generation" },
      ),
    ).toBe(true);
  });
  it("does NOT match a different DOI", () => {
    expect(paperMatchesExpected({ externalId: "10.1/a" }, { doi: "10.1/b" })).toBe(false);
  });
  it("does NOT match a short generic title even when normalized-equal", () => {
    // Both normalize to "active retrieval" (16 chars < 20) — too generic to
    // trust as same-work evidence, so the title path must refuse it.
    expect(
      paperMatchesExpected({ externalId: "openalex:W999", title: "Active Retrieval" }, { title: "active retrieval" }),
    ).toBe(false);
  });
  it("still matches a short-title work when its DOI/arXiv id matches", () => {
    // Title too short to match alone, but the id check carries it.
    expect(
      paperMatchesExpected({ externalId: "arxiv:2305.06983", title: "Active Retrieval" }, { arxivId: "2305.06983", title: "Active Retrieval" }),
    ).toBe(true);
  });
});

describe("discoveryRecallTolerant", () => {
  it("returns 1 when expected is empty (vacuously true)", () => {
    expect(discoveryRecallTolerant([], [{ externalId: "x" }])).toBe(1);
  });
  it("counts a paper found via arXiv even when the golden lists its DOI", () => {
    expect(
      discoveryRecallTolerant([{ doi: "10.1/a", arxivId: "2401.00396" }], [{ externalId: "arxiv:2401.00396" }]),
    ).toBe(1);
  });
  it("returns the fraction of expected works surfaced", () => {
    expect(
      discoveryRecallTolerant(
        [{ doi: "10.1/a" }, { doi: "10.1/b" }],
        [{ externalId: "10.1/a" }, { externalId: "10.1/zzz" }],
      ),
    ).toBe(0.5);
  });
});

describe("screeningPrecisionTolerant", () => {
  it("returns 1 when nothing was admitted (vacuously true)", () => {
    expect(screeningPrecisionTolerant([{ doi: "10.1/a" }], [])).toBe(1);
  });
  it("returns the fraction of admitted papers that were expected", () => {
    expect(
      screeningPrecisionTolerant(
        [{ doi: "10.1/a" }],
        [{ externalId: "10.1/a" }, { externalId: "10.1/unexpected" }],
      ),
    ).toBe(0.5);
  });
});
