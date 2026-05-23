import type { ModelMessage } from "ai";
import { z } from "zod";
import type { Plan } from "@/lib/prompts/plan-review";
import type { IncludedPaperSpec } from "@/lib/agent/state";

export const CritiqueSchema = z.object({
  rubric: z.object({
    faithfulness: z.number().int().min(1).max(5).describe("Are claims in the draft supported by cited papers?"),
    completeness: z.number().int().min(1).max(5).describe("Does the draft address all sub-questions from the plan?"),
    citationQuality: z.number().int().min(1).max(5).describe("Are citations specific and well-placed?"),
    clarity: z.number().int().min(1).max(5).describe("Is the draft readable and well-structured?"),
  }),
  overallScore: z.number().min(1).max(5).describe("Weighted average; faithfulness counts double"),
  actionableFeedback: z
    .string()
    .min(20)
    .max(2000)
    .describe("2-5 specific changes the drafter should make. Required even when approving (state why it's solid)."),
  decision: z.enum(["approve", "revise"]),
});

export type Critique = z.infer<typeof CritiqueSchema>;

const SYSTEM = `You are a critical reviewer of systematic literature reviews. You score a draft against a 4-axis rubric and decide whether the drafter should revise it.

Rubric (each 1-5):
- faithfulness: Are claims in the draft actually supported by the cited papers? Hallucinated or unsupported claims drop this score.
- completeness: Does the draft address every sub-question from the plan? Missing sub-questions drop this score.
- citationQuality: Are citations specific (per-sentence), well-placed, and avoid clustering at the end of paragraphs?
- clarity: Is the draft readable, well-structured, free of jargon overload?

Compute overallScore as: (2 * faithfulness + completeness + citationQuality + clarity) / 5

Decide:
- decision = "revise" ONLY when overallScore < 4.0 AND your actionableFeedback would meaningfully improve the draft on the next pass.
- decision = "approve" otherwise. (A score of 3.5-3.9 with minor cosmetic issues is still "approve" — don't loop for cosmetics.)

Always write actionableFeedback (2-5 specific changes). When approving, briefly say what works well — the drafter still benefits from positive reinforcement and you may approve at the threshold.

You will see the original research question, the SLR plan, the list of included papers (with relevance scores), and the current draft. Use them to judge.`;

export function buildCriticRequest(args: {
  question: string;
  plan: Plan;
  includedPapers: IncludedPaperSpec[];
  draft: string;
  iteration: number;
}): {
  system: string;
  messages: ModelMessage[];
} {
  const papersList = args.includedPapers
    .map((p) => `- [${p.corpusItemId}] (relevance ${p.relevanceScore.toFixed(2)}) ${p.inclusionReason}`)
    .join("\n");

  const userContent = `Iteration: ${args.iteration} (0 = first pass; >0 = re-evaluating after drafter revised based on prior feedback)

Research question:
> ${args.question}

Plan:
${JSON.stringify(args.plan, null, 2)}

Included papers:
${papersList}

Current draft:
${args.draft}

Score the draft against the rubric. Be honest. Output structured JSON matching the schema.`;

  return {
    system: SYSTEM,
    messages: [{ role: "user", content: userContent }],
  };
}
