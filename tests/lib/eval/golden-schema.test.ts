import { describe, it, expect } from "vitest";
import { GoldenQuestionSchema } from "@/lib/eval/golden-schema";

const validGolden = {
  id: "000-test",
  question: "Does X improve Y?",
  picoc: {
    population: "Adults",
    intervention: "X",
    comparison: "Standard care",
    outcome: "Y",
    context: "Clinical trials",
  },
  papers: [
    {
      id: "paper_001",
      title: "Effect of X on Y",
      summary: "RCT of X vs control. Found 25% improvement in Y at 6 months.",
      markdown: "# Effect of X on Y\n\nFull paper text here...",
    },
  ],
  expectedPapers: ["paper_001"],
  expectedClaims: ["X improves Y by ~25%"],
  metadata: {
    source: "Cochrane Review CDxxxxxx",
    difficulty: "medium",
  },
};

describe("GoldenQuestionSchema", () => {
  it("accepts a valid golden question", () => {
    const r = GoldenQuestionSchema.safeParse(validGolden);
    expect(r.success).toBe(true);
  });

  it("requires id, question, picoc, papers, expectedPapers, expectedClaims", () => {
    const missing = { ...validGolden };
    delete (missing as Record<string, unknown>).question;
    expect(GoldenQuestionSchema.safeParse(missing).success).toBe(false);
  });

  it("rejects empty papers array (a question needs evaluable corpus)", () => {
    expect(GoldenQuestionSchema.safeParse({ ...validGolden, papers: [] }).success).toBe(false);
  });

  it("rejects expectedPapers that reference unknown paper ids", () => {
    const r = GoldenQuestionSchema.safeParse({
      ...validGolden,
      expectedPapers: ["paper_999"],
    });
    expect(r.success).toBe(false);
  });

  it("accepts difficulty as easy/medium/hard", () => {
    for (const d of ["easy", "medium", "hard"] as const) {
      const r = GoldenQuestionSchema.safeParse({
        ...validGolden,
        metadata: { ...validGolden.metadata, difficulty: d },
      });
      expect(r.success).toBe(true);
    }
  });

  it("rejects unknown difficulty values", () => {
    const r = GoldenQuestionSchema.safeParse({
      ...validGolden,
      metadata: { ...validGolden.metadata, difficulty: "trivial" },
    });
    expect(r.success).toBe(false);
  });
});
