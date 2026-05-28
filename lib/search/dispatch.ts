import type {
  DiscoveredPaperSpec,
  SearchProvider,
  SearchProviderName,
  SearchQuery,
} from "@/lib/search/types";
import { SearchProviderError } from "@/lib/search/types";
import { openalexSearch } from "@/lib/search/providers/openalex";
import { arxivSearch } from "@/lib/search/providers/arxiv";
import { exaSearch } from "@/lib/search/providers/exa";

/**
 * Provider registry. The `provider` field on `DiscoveredPaperSpec` maps 1:1
 * to a key here, so a row in `DiscoveredPaper` can always be regenerated
 * (no hidden provider state).
 */
const REGISTRY: Record<SearchProviderName, SearchProvider> = {
  openalex: openalexSearch,
  arxiv: arxivSearch,
  exa: exaSearch,
};

/**
 * Per-provider outcome for a single dispatched query. `resultCount` is the
 * PRE-dedup hit count this provider returned — the merged `hits` below can't
 * be used to recover it (cross-provider dedup collapses duplicates onto a
 * single winning provider). The discoverer persists these as SearchQuery
 * audit rows.
 */
export type ProviderCallStat = {
  provider: SearchProviderName;
  resultCount: number;
  success: boolean;
  /** Provider error message when success is false. */
  error?: string;
};

export type DispatchResult = {
  hits: DiscoveredPaperSpec[];
  /** Per-provider error messages (empty array if every provider succeeded). */
  errors: Array<{ provider: SearchProviderName; message: string }>;
  /** Per-provider call outcome (one entry per provider dispatched). */
  providerStats: ProviderCallStat[];
};

/**
 * Fan out a query to every enabled provider, deduplicate by canonical id,
 * and return both the merged hit list and the per-provider error log.
 *
 * Provider failure is **non-fatal**: a 5xx from one provider records an
 * error entry and the run continues with whatever the other providers
 * returned. The discoverer node decides whether the survivor set is
 * enough to proceed.
 *
 * Dedup precedence: when the same paper is returned by multiple providers,
 * keep the highest `initialScore`. (Tie → first encountered.) OpenAlex
 * tends to have the richest metadata, but Exa's semantic scores are often
 * better; the score-max keeps whichever signal was strongest.
 *
 * Spec: docs/superpowers/specs/thoth-v2-design.md §2
 */
export async function dispatchSearch(args: {
  query: SearchQuery;
  providers: SearchProviderName[];
}): Promise<DispatchResult> {
  if (args.providers.length === 0) {
    return { hits: [], errors: [], providerStats: [] };
  }

  const settled = await Promise.allSettled(
    args.providers.map(async (name) => {
      const fn = REGISTRY[name];
      if (!fn) {
        throw new SearchProviderError(name, `unknown provider: ${name}`);
      }
      return { name, hits: await fn(args.query) };
    }),
  );

  const errors: DispatchResult["errors"] = [];
  const providerStats: ProviderCallStat[] = [];
  const byId = new Map<string, DiscoveredPaperSpec>();
  // settled[i] corresponds to args.providers[i] (Promise.allSettled preserves
  // order) — use that to attribute a rejection to the right provider even when
  // the thrown error isn't a SearchProviderError.
  settled.forEach((result, i) => {
    const name = args.providers[i]!;
    if (result.status === "rejected") {
      const reason = result.reason;
      const provider =
        reason instanceof SearchProviderError ? reason.provider : name;
      const message = reason instanceof Error ? reason.message : String(reason);
      errors.push({ provider, message });
      providerStats.push({ provider, resultCount: 0, success: false, error: message });
      return;
    }
    providerStats.push({
      provider: name,
      resultCount: result.value.hits.length,
      success: true,
    });
    for (const hit of result.value.hits) {
      const existing = byId.get(hit.externalId);
      if (!existing || hit.initialScore > existing.initialScore) {
        byId.set(hit.externalId, hit);
      }
    }
  });

  const hits = Array.from(byId.values()).sort(
    (a, b) => b.initialScore - a.initialScore,
  );
  return { hits, errors, providerStats };
}
