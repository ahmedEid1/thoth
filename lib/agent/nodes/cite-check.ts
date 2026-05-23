import { runLLM } from "@/lib/llm";
import { extractCitations } from "@/lib/agent/cite-extract";
import { CiteCheckPerCitationSchema, buildCiteCheckRequest } from "@/lib/prompts/cite-check";
import { addStep, finishStep, findCorpusSummary, persistCiteCheck } from "@/lib/agent/runs";
import type { AgentState } from "@/lib/agent/state";

// Sequential by default. Originally batched at 5 in parallel, but Mistral's
// free Experiment tier rate-limits at ~1 RPS and the parallel batches were
// tripping rate limits + failing the whole run. Sequential is slower (5-15s
// per citation × N citations) but stays under free-tier limits everywhere.
// If/when we move to a paid LLM tier, bump this back up.
const PARALLEL = 1;

async function checkOneCitation(
  c: { paperId: string; claim: string },
  state: AgentState,
): Promise<{
  paperId: string;
  claim: string;
  verdict: "supported" | "unsupported" | "unclear";
  reason: string;
  paperExcerpt?: string;
}> {
  const summary = await findCorpusSummary(c.paperId);
  if (summary == null) {
    return {
      paperId: c.paperId,
      claim: c.claim,
      verdict: "unclear",
      reason: "Paper summary unavailable in the corpus; cannot verify the claim.",
    };
  }
  const { system, messages } = buildCiteCheckRequest({
    claim: c.claim,
    paperId: c.paperId,
    paperSummary: summary,
  });
  try {
    const { output } = await runLLM({
      name: "cite-check",
      tier: "smart",
      maxTokens: 600,
      system,
      messages,
      schema: CiteCheckPerCitationSchema,
      metadata: {
        runId: state.runId,
        projectId: state.projectId,
        node: "cite_check",
        paperId: c.paperId,
      },
    });
    return {
      paperId: c.paperId,
      claim: c.claim,
      verdict: output.verdict,
      reason: output.reason,
      paperExcerpt: output.paperExcerpt,
    };
  } catch (err) {
    // Per-citation error: don't fail the whole run. Record as unclear with the
    // error reason so the dashboard still shows what could be checked.
    const reason = err instanceof Error ? err.message : String(err);
    return {
      paperId: c.paperId,
      claim: c.claim,
      verdict: "unclear",
      reason: `Citation check failed transiently: ${reason.slice(0, 400)}`,
    };
  }
}

export async function citeCheckNode(state: AgentState): Promise<Partial<AgentState>> {
  if (state.draft == null) throw new Error("cite_check: state.draft is null");

  const step = await addStep({ runId: state.runId, nodeName: "cite_check" });
  try {
    const citations = extractCitations(state.draft);

    const perCitation: Array<{
      paperId: string;
      claim: string;
      verdict: "supported" | "unsupported" | "unclear";
      reason: string;
      paperExcerpt?: string;
    }> = [];

    // Process in batches of PARALLEL to respect provider rate limits.
    for (let i = 0; i < citations.length; i += PARALLEL) {
      const batch = citations.slice(i, i + PARALLEL);
      const results = await Promise.all(batch.map((c) => checkOneCitation(c, state)));
      perCitation.push(...results);
    }

    const supported = perCitation.filter((r) => r.verdict === "supported").length;
    const unsupported = perCitation.filter((r) => r.verdict === "unsupported").length;
    const unclear = perCitation.filter((r) => r.verdict === "unclear").length;
    const total = perCitation.length;
    const faithfulnessScore = total === 0 ? 1 : supported / total;

    await persistCiteCheck({
      runId: state.runId,
      perCitation,
      aggregate: {
        totalCitations: total,
        supported,
        unsupported,
        unclear,
        faithfulnessScore,
      },
    });

    await finishStep({ stepId: step.id });
    return {};
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    await finishStep({ stepId: step.id, failureReason: reason.slice(0, 1000) });
    throw err;
  }
}
