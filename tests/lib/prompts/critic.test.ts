import { describe, it, expect } from "vitest";
import { CritiqueSchema, buildCriticRequest } from "@/lib/prompts/critic";

const examplePlan = {
  picoc: { population: "p", intervention: "i", comparison: "c", outcome: "o", context: "ctx" },
  subQuestions: ["Q1", "Q2"],
  inclusionCriteria: ["IC1"],
  exclusionCriteria: ["EC1"],
};

const examplePapers = [
  { corpusItemId: "c1", relevanceScore: 0.9, inclusionReason: "directly relevant" },
];

describe("CritiqueSchema", () => {
  it("accepts a valid approve critique", () => {
    const ok = CritiqueSchema.safeParse({
      rubric: { faithfulness: 5, completeness: 4, citationQuality: 5, clarity: 4 },
      overallScore: 4.5,
      actionableFeedback: "No changes needed; draft is faithful and complete.",
      decision: "approve",
    });
    expect(ok.success).toBe(true);
  });

  it("accepts a valid revise critique", () => {
    const ok = CritiqueSchema.safeParse({
      rubric: { faithfulness: 3, completeness: 2, citationQuality: 4, clarity: 4 },
      overallScore: 3.0,
      actionableFeedback: "Add discussion of sub-question Q2; expand citation [c1] with the effect size.",
      decision: "revise",
    });
    expect(ok.success).toBe(true);
  });

  it("rejects rubric scores outside 1-5", () => {
    const r = CritiqueSchema.safeParse({
      rubric: { faithfulness: 6, completeness: 4, citationQuality: 5, clarity: 4 },
      overallScore: 4.5,
      actionableFeedback: "x".repeat(50),
      decision: "approve",
    });
    expect(r.success).toBe(false);
  });

  it("rejects unknown decision values", () => {
    const r = CritiqueSchema.safeParse({
      rubric: { faithfulness: 5, completeness: 4, citationQuality: 5, clarity: 4 },
      overallScore: 4.5,
      actionableFeedback: "x".repeat(50),
      decision: "maybe",
    });
    expect(r.success).toBe(false);
  });
});

describe("buildCriticRequest", () => {
  it("returns a string system and a single user message with all inputs", () => {
    const req = buildCriticRequest({
      question: "Does X improve Y?",
      plan: examplePlan,
      includedPapers: examplePapers,
      draft: "## Introduction\n\nResult [c1].",
      iteration: 0,
    });
    expect(typeof req.system).toBe("string");
    expect(req.messages).toHaveLength(1);
    const userText = JSON.stringify(req.messages[0]?.content);
    expect(userText).toContain("Does X improve Y?");
    expect(userText).toContain("c1");
    expect(userText).toContain("Result [c1]");
  });

  it("includes the iteration index in the user message so the model knows this is a re-evaluation", () => {
    const req = buildCriticRequest({
      question: "?",
      plan: examplePlan,
      includedPapers: examplePapers,
      draft: "x [c1].",
      iteration: 1,
    });
    const userText = JSON.stringify(req.messages[0]?.content);
    expect(userText.toLowerCase()).toContain("iteration");
  });
});
