import { z } from "zod";
import { db } from "@/lib/db";
import { mcpTool, NotFoundError } from "@/lib/mcp/handler";
import type { McpUserCtx } from "@/lib/mcp/auth";
import { loadCitedPaperTitles } from "@/lib/cited-paper-titles";

export const getCitationAuditInput = z.object({
  reviewId: z.string().min(1),
});

export const getCitationAuditOutput = z.object({
  reviewId: z.string(),
  // M77: project context so an AI assistant calling the tool has enough
  // info to talk about the review without a second look_up. Mirrors the
  // M75 enrichment of the HTTP audit.json route.
  projectTitle: z.string(),
  reviewQuestion: z.string(),
  runStartedAt: z.string(),
  runCompletedAt: z.string().nullable(),
  faithfulnessScore: z.number().nullable(),
  totalClaims: z.number().int(),
  supportedCount: z.number().int(),
  unsupportedCount: z.number().int(),
  unclearCount: z.number().int(),
  claims: z.array(z.object({
    claimText: z.string(),
    citedPaperId: z.string(),
    // M100: human-readable title for the cited paper so an AI assistant
    // can talk about "the GAT paper" not "paper cm123abc". Null when the
    // corpus item has no usable heading / was deleted.
    citedPaperTitle: z.string().nullable(),
    verdict: z.enum(["supported", "unsupported", "unclear"]),
    reason: z.string(),
    supportingSpan: z.string().nullable(),
  })),
});

const VERDICT_MAP: Record<string, "supported" | "unsupported" | "unclear"> = {
  SUPPORTED: "supported",
  UNSUPPORTED: "unsupported",
  UNCLEAR: "unclear",
};

export async function getCitationAudit(
  input: z.infer<typeof getCitationAuditInput>,
  ctx: McpUserCtx,
): Promise<z.infer<typeof getCitationAuditOutput>> {
  const run = await db.run.findFirst({
    where: { id: input.reviewId, project: { ownerId: ctx.userId } },
    select: {
      id: true,
      faithfulnessScore: true,
      createdAt: true,
      completedAt: true,
      question: true,
      project: { select: { title: true } },
    },
  });
  if (!run) throw new NotFoundError("review_not_found");

  const rows = await db.claimCheck.findMany({
    where: { runId: input.reviewId },
    select: { paperId: true, claim: true, verdict: true, reason: true, paperExcerpt: true },
    orderBy: { createdAt: "asc" },
  });

  const titleById = await loadCitedPaperTitles(rows.map((r) => r.paperId));

  const claims = rows.map(r => ({
    claimText: r.claim,
    citedPaperId: r.paperId,
    citedPaperTitle: titleById.get(r.paperId) ?? null,
    verdict: VERDICT_MAP[r.verdict] ?? "unclear",
    reason: r.reason,
    supportingSpan: r.paperExcerpt,
  }));

  return {
    reviewId: run.id,
    projectTitle: run.project.title,
    reviewQuestion: run.question,
    runStartedAt: run.createdAt.toISOString(),
    runCompletedAt: run.completedAt ? run.completedAt.toISOString() : null,
    faithfulnessScore: run.faithfulnessScore,
    totalClaims: claims.length,
    supportedCount: claims.filter(c => c.verdict === "supported").length,
    unsupportedCount: claims.filter(c => c.verdict === "unsupported").length,
    unclearCount: claims.filter(c => c.verdict === "unclear").length,
    claims,
  };
}

export const getCitationAuditTool = mcpTool({
  name: "get_citation_audit",
  inputSchema: getCitationAuditInput,
  outputSchema: getCitationAuditOutput,
  handler: getCitationAudit,
});
