import type { SearchProvider, DiscoveredPaperSpec } from "@/lib/search/types";
import { SearchProviderError } from "@/lib/search/types";

/**
 * OpenAlex adapter — primary metadata + open-access URL resolution.
 *
 * Free, no auth required. Polite-tier ramps quotas higher if you add a
 * mailto query param, but we deliberately don't — keeps the visitor's
 * research-question off OpenAlex's correlation surface.
 *
 * Docs: https://docs.openalex.org/api-entities/works
 *
 * Abstract handling: OpenAlex stores abstracts as `abstract_inverted_index`
 * — `{ word: [positions] }` — to comply with publishers' redistribution
 * rules. We reconstruct on the client. When the field is null or empty,
 * the adapter returns `abstract: null` and the screener falls back to
 * title-only scoring.
 */
export const openalexSearch: SearchProvider = async (q) => {
  const params = new URLSearchParams();
  params.set("search", q.query);
  params.set("per_page", String(Math.min(q.limit ?? 25, 50)));
  // Sort by relevance (default for search=) — the API combines BM25 with
  // citation weighting. Explicit for clarity.
  params.set("sort", "relevance_score:desc");

  // Filter syntax: comma-joined list of `key:value` pairs. Year range
  // becomes from_publication_date:YYYY-01-01,to_publication_date:YYYY-12-31.
  const filters: string[] = ["type:article"];
  if (q.yearStart !== undefined) {
    filters.push(`from_publication_date:${q.yearStart}-01-01`);
  }
  if (q.yearEnd !== undefined) {
    filters.push(`to_publication_date:${q.yearEnd}-12-31`);
  }
  params.set("filter", filters.join(","));

  const url = `https://api.openalex.org/works?${params.toString()}`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    throw new SearchProviderError(
      "openalex",
      `network error: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  }

  if (!response.ok) {
    throw new SearchProviderError(
      "openalex",
      `HTTP ${response.status} ${response.statusText}`,
    );
  }

  const body = (await response.json()) as {
    results?: Array<{
      id?: string;
      doi?: string | null;
      title?: string | null;
      authorships?: Array<{ author?: { display_name?: string } }>;
      publication_year?: number | null;
      host_venue?: { display_name?: string | null } | null;
      primary_location?: { source?: { display_name?: string | null } | null } | null;
      cited_by_count?: number;
      open_access?: { is_oa?: boolean; oa_url?: string | null } | null;
      abstract_inverted_index?: Record<string, number[]> | null;
      relevance_score?: number;
    }>;
    meta?: { count?: number };
  };

  const results = body.results ?? [];
  const maxRelevance = results.reduce(
    (m, r) => Math.max(m, r.relevance_score ?? 0),
    0,
  );

  return results
    .map((r): DiscoveredPaperSpec | null => {
      if (!r.title || !r.id) return null;
      // Prefer DOI as the canonical id; fall back to the OpenAlex W-id.
      // Both forms can collide-dedup against arXiv hits because we store
      // the DOI when arXiv knows one.
      const externalId =
        typeof r.doi === "string" && r.doi.length > 0
          ? r.doi.replace(/^https?:\/\/doi\.org\//i, "")
          : r.id.replace(/^https?:\/\/openalex\.org\//i, "openalex:");
      const venue =
        r.host_venue?.display_name ??
        r.primary_location?.source?.display_name ??
        null;
      const oaUrl = r.open_access?.oa_url ?? null;
      const accessStatus: DiscoveredPaperSpec["accessStatus"] =
        r.open_access?.is_oa === true && oaUrl
          ? "open"
          : r.open_access?.is_oa === false
            ? "paywalled"
            : "unknown";
      // Normalise OpenAlex's relevance_score (~0..50) into [0, 1].
      const initialScore =
        maxRelevance > 0 ? Math.min((r.relevance_score ?? 0) / maxRelevance, 1) : 0;
      return {
        provider: "openalex",
        externalId,
        title: r.title,
        authors: (r.authorships ?? [])
          .map((a) => a.author?.display_name)
          .filter((n): n is string => typeof n === "string"),
        abstract: reconstructAbstract(r.abstract_inverted_index ?? null),
        publicationYear: r.publication_year ?? null,
        venue,
        citationCount: r.cited_by_count ?? null,
        oaUrl: oaUrl !== null && oaUrl !== "" ? oaUrl : null,
        accessStatus,
        initialScore,
      };
    })
    .filter((x): x is DiscoveredPaperSpec => x !== null);
};

/**
 * Rebuild an OpenAlex inverted-index abstract back into prose. Returns null
 * if the field is missing or empty (caller treats that as abstract-not-available).
 */
export function reconstructAbstract(
  index: Record<string, number[]> | null,
): string | null {
  if (!index || Object.keys(index).length === 0) return null;
  const positioned: Array<[number, string]> = [];
  for (const [word, positions] of Object.entries(index)) {
    for (const p of positions) positioned.push([p, word]);
  }
  positioned.sort((a, b) => a[0] - b[0]);
  return positioned.map(([, w]) => w).join(" ");
}
