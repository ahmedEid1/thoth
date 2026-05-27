import type { ModelMessage } from "ai";
import { z } from "zod";
import type { Plan } from "@/lib/prompts/plan-review";

/**
 * Output of the discoverer LLM call.
 *
 * `queries` is the natural-language phrasing fed to every provider's
 * adapter. Per the V2 spec (§13.1) we use ONE universal prompt and let each
 * adapter translate the phrasing into its own syntax (`filter:`, `cat:`,
 * Exa's natural-language input). 4-8 queries per run.
 */
export const DiscoveryQueriesSchema = z.object({
  queries: z
    .array(
      z
        .string()
        .min(8, "query must be at least 8 characters")
        .max(200, "query must be at most 200 characters"),
    )
    .min(4)
    .max(8),
  rationale: z.string().min(20).max(1500),
});

export type DiscoveryQueries = z.infer<typeof DiscoveryQueriesSchema>;

const SYSTEM = `You are a search-query designer for a systematic literature review system.

You will receive the user's research question + a PICOC decomposition (Population, Intervention, Comparison, Outcome, Context) + 2-5 sub-questions.

Produce 4-8 short search queries (each 8-200 chars) that together would surface every paper relevant to the question across academic indices like OpenAlex, arXiv, and Semantic-Scholar-like engines. The queries are processed by per-provider adapters — keep them as natural-language phrases, NOT provider-specific syntax. No \`filter:\`, no \`cat:\`, no \`au:\` prefixes.

Guidelines:

- COVER different angles of the question. A query exclusively rephrasing the original question wastes a slot.
- USE the PICOC vocabulary. If the intervention is "test-driven development", at least one query should contain that exact phrase; another might pivot to "TDD".
- USE the sub-questions to vary the framing.
- VARY phrasing so semantic and lexical engines both surface useful hits — one query keyword-heavy ("TDD defect rate empirical"), one in natural sentence form ("how test-driven development affects code quality"), one targeting a specific outcome ("TDD coverage measurement").
- AVOID overly broad queries ("software engineering") — they bury the relevant papers in noise.
- AVOID overly narrow queries (specific author names, journal titles, dates) — narrow them via filters in the user's project config, not the query text.

Also produce a short \`rationale\` (1-3 sentences) explaining the query strategy so the user can sanity-check before the discovery_gate runs.

Output strict JSON matching the schema.`;

export function buildDiscoverQueriesRequest(args: {
  question: string;
  plan: Plan;
}): { system: string; messages: ModelMessage[] } {
  return {
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Research question:\n\n> ${args.question}\n\nPlan:\n${JSON.stringify(args.plan, null, 2)}\n\nProduce 4-8 search queries + a short rationale.`,
      },
    ],
  };
}
