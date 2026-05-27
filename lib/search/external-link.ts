/**
 * Map a DiscoveredPaper's externalId + provider to a click-through URL.
 *
 *   arxiv:2310.06770   → https://arxiv.org/abs/2310.06770
 *   10.1234/foo        → https://doi.org/10.1234/foo
 *   openalex:W12345    → https://openalex.org/W12345
 *   exa hits           → fall back to oaUrl when present
 *
 * Returns null for the "uploaded" synthetic provider (no external link)
 * and for unknown shapes without an oaUrl fallback. UI callers render
 * the title as a plain <p> when this returns null.
 */
export function externalPaperLink(p: {
  provider: string;
  externalId: string;
  oaUrl?: string | null;
}): string | null {
  if (p.provider === "uploaded") return null;
  if (p.externalId.startsWith("arxiv:")) {
    return `https://arxiv.org/abs/${p.externalId.slice("arxiv:".length)}`;
  }
  if (p.externalId.startsWith("openalex:")) {
    return `https://openalex.org/${p.externalId.slice("openalex:".length)}`;
  }
  // DOI shape: starts with "10." and has a slash. Browsers + doi.org are
  // forgiving about the exact prefix shape, so a permissive regex is fine.
  if (/^10\.\d{4,9}\//.test(p.externalId)) {
    return `https://doi.org/${p.externalId}`;
  }
  if (p.oaUrl && p.oaUrl.length > 0) return p.oaUrl;
  return null;
}
