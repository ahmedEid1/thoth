import { db } from "@/lib/db";
import { extractPaperTitle } from "@/lib/paper-title";

/**
 * Resolve a set of cited paper ids (which are CorpusItem ids — see
 * M98) to their human-readable titles. Used by the citation-audit
 * surfaces (HTTP audit.json + MCP get_citation_audit) so each claim
 * can carry `citedPaperTitle` alongside the opaque `citedPaperId`.
 *
 * De-dups the input ids before querying. Returns a Map keyed by
 * CorpusItem id; the value is the authoritative provider title
 * (DiscoveredPaper.title) for outbound papers, else the title extracted
 * from the OCR'd markdown, else null (no usable heading, or the item
 * doesn't exist — defensive against a claim referencing a since-deleted
 * corpus item).
 */
export async function loadCitedPaperTitles(
  paperIds: string[],
): Promise<Map<string, string | null>> {
  const ids = [...new Set(paperIds)];
  if (ids.length === 0) return new Map();
  const items = await db.corpusItem.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      parsedMarkdown: true,
      // Prefer the authoritative provider title for outbound papers (M118);
      // fall back to OCR-heading extraction for uploaded PDFs (no join).
      discoveredAs: { select: { title: true } },
    },
  });
  return new Map(
    items.map((i) => [i.id, i.discoveredAs?.title ?? extractPaperTitle(i.parsedMarkdown)]),
  );
}
