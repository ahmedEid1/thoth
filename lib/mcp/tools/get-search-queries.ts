import { z } from "zod";
import { db } from "@/lib/db";
import { mcpTool, NotFoundError } from "@/lib/mcp/handler";
import type { McpUserCtx } from "@/lib/mcp/auth";

export const getSearchQueriesInput = z.object({
  reviewId: z.string().min(1),
});

export const getSearchQueriesOutput = z.object({
  reviewId: z.string(),
  // M79: project context so an AI assistant has the human-readable name
  // + research question without a second lookup. Mirrors M77 / M78.
  projectTitle: z.string(),
  reviewQuestion: z.string(),
  searchScope: z.enum(["uploaded_only", "outbound", "hybrid"]),
  searchProviders: z.array(z.string()),
  queries: z.array(z.string()),
  providerErrors: z.array(z.object({
    nodeName: z.string(),
    failureReason: z.string(),
  })),
  // Per-(query, provider) call audit — the dedicated SearchQuery table the
  // V2 spec §10 asked for. One entry per provider call the discoverer made,
  // in chronological order (re-discovery runs append, so a re-run shows both
  // sweeps). Empty for uploaded_only runs and for runs that predate the
  // audit table.
  callAudit: z.array(z.object({
    provider: z.string(),
    query: z.string(),
    resultCount: z.number(),
    success: z.boolean(),
    error: z.string().nullable(),
  })),
});

/**
 * Returns the search queries the discoverer generated for an outbound run.
 * Queries are sourced from the APPROVE_DISCOVERY checkpoint's proposal — that
 * row exists for every outbound/hybrid run because the discoverer always
 * emits a discovery_gate interrupt. Returns an empty queries list for
 * uploaded_only runs (with searchScope='uploaded_only' so the caller can
 * tell the difference from "discoverer hasn't run yet").
 *
 * `callAudit` adds the finer-grained SearchQuery audit: every individual
 * provider call (query × provider) with its pre-dedup result count + any
 * error — exactly what was sent to whom, per the V2 spec §10.
 */
export async function getSearchQueries(
  input: z.infer<typeof getSearchQueriesInput>,
  ctx: McpUserCtx,
): Promise<z.infer<typeof getSearchQueriesOutput>> {
  const run = await db.run.findFirst({
    where: { id: input.reviewId, project: { ownerId: ctx.userId } },
    select: {
      id: true,
      question: true,
      project: { select: { title: true, searchScope: true, searchProviders: true } },
    },
  });
  if (!run) throw new NotFoundError("review_not_found");

  const checkpoint = await db.humanCheckpoint.findFirst({
    where: { runId: input.reviewId, kind: "APPROVE_DISCOVERY" },
    orderBy: { createdAt: "desc" },
    select: { proposal: true },
  });

  const proposalQueries = checkpoint?.proposal as { queries?: unknown } | null;
  const queries = Array.isArray(proposalQueries?.queries)
    ? (proposalQueries.queries as unknown[]).filter((q): q is string => typeof q === "string")
    : [];

  const errSteps = await db.runStep.findMany({
    where: {
      runId: input.reviewId,
      nodeName: "discoverer",
      failureReason: { not: null },
    },
    select: { nodeName: true, failureReason: true },
    orderBy: { startedAt: "asc" },
  });

  const auditRows = await db.searchQuery.findMany({
    where: { runId: input.reviewId },
    orderBy: { createdAt: "asc" },
    select: { provider: true, query: true, resultCount: true, success: true, error: true },
  });

  return {
    reviewId: run.id,
    projectTitle: run.project.title,
    reviewQuestion: run.question,
    searchScope: run.project.searchScope as "uploaded_only" | "outbound" | "hybrid",
    searchProviders: run.project.searchProviders,
    queries,
    providerErrors: errSteps.map((s) => ({
      nodeName: s.nodeName,
      failureReason: s.failureReason as string,
    })),
    callAudit: auditRows.map((a) => ({
      provider: a.provider,
      query: a.query,
      resultCount: a.resultCount,
      success: a.success,
      error: a.error,
    })),
  };
}

export const getSearchQueriesTool = mcpTool({
  name: "get_search_queries",
  inputSchema: getSearchQueriesInput,
  outputSchema: getSearchQueriesOutput,
  handler: getSearchQueries,
});
