/**
 * Thoth eval metrics. All return a score in [0, 1].
 * Vacuous-true convention: returns 1.0 when the "expected" set is empty so an
 * eval question that doesn't assert on this metric doesn't drag the average down.
 */

export function citationRecall(expected: string[], included: string[]): number {
  if (expected.length === 0) return 1;
  const inc = new Set(included);
  const hits = expected.filter((id) => inc.has(id)).length;
  return hits / expected.length;
}

/**
 * V2 — `discovery_recall`. How many of the expected DOIs/arxiv ids did the
 * outbound discoverer surface? Matched against the union of every search
 * provider's hit list (after dedup), BEFORE the screener decides which to
 * include. This isolates the discoverer's job from screening + assessment
 * so a regression in either node localises here vs. downstream.
 */
export function discoveryRecall(
  expectedExternalIds: string[],
  discoveredExternalIds: string[],
): number {
  if (expectedExternalIds.length === 0) return 1;
  const found = new Set(discoveredExternalIds);
  const hits = expectedExternalIds.filter((id) => found.has(id)).length;
  return hits / expectedExternalIds.length;
}

/**
 * V2 — `screening_precision`. Of the papers the screener marked include=true,
 * how many were on the expected list? Penalises a too-loose screener that
 * waves marginally-relevant hits through.
 *
 * Returns 1 (vacuously true) when the screener admitted zero papers — same
 * convention as `citationPrecision`.
 */
export function screeningPrecision(
  expectedExternalIds: string[],
  screenedIncludeExternalIds: string[],
): number {
  if (screenedIncludeExternalIds.length === 0) return 1;
  const exp = new Set(expectedExternalIds);
  const hits = screenedIncludeExternalIds.filter((id) => exp.has(id)).length;
  return hits / screenedIncludeExternalIds.length;
}

// ── V2 identity-agnostic matching ──────────────────────────────────────────
// A discovered/admitted paper is the SAME work as an expected one if ANY of its
// identifiers matches — DOI, arXiv id, or normalized title. Exact-DOI-only
// matching under-counts: the same paper is routinely returned under its arXiv
// id by one provider and its DOI by another, so a paper that WAS discovered
// (just via arXiv) used to score as a miss. This makes the metric reflect
// "did we find the work?" rather than "did we find this exact identifier?".
export type ExpectedPaper = { doi?: string; arxivId?: string; title?: string };
export type DiscoveredRef = { externalId: string; title?: string | null };

function normalizeTitle(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** True when discovered paper `d` is the same work as expected entry `e`. */
export function paperMatchesExpected(d: DiscoveredRef, e: ExpectedPaper): boolean {
  if (e.doi && d.externalId === e.doi) return true;
  if (e.arxivId && (d.externalId === `arxiv:${e.arxivId}` || d.externalId === e.arxivId)) return true;
  if (e.title && d.title && normalizeTitle(d.title) === normalizeTitle(e.title)) return true;
  return false;
}

/**
 * V2 — `discovery_recall`, identity-agnostic. Fraction of expected works the
 * discoverer surfaced (matched by DOI OR arXiv id OR exact title), BEFORE the
 * screener decides which to include.
 */
export function discoveryRecallTolerant(expected: ExpectedPaper[], discovered: DiscoveredRef[]): number {
  if (expected.length === 0) return 1;
  const hits = expected.filter((e) => discovered.some((d) => paperMatchesExpected(d, e))).length;
  return hits / expected.length;
}

/**
 * V2 — `screening_precision`, identity-agnostic. Of the papers the screener
 * admitted, the fraction that are on the expected list. Vacuously 1.0 when the
 * screener admitted nothing (same convention as `citationPrecision`).
 */
export function screeningPrecisionTolerant(expected: ExpectedPaper[], admitted: DiscoveredRef[]): number {
  if (admitted.length === 0) return 1;
  const hits = admitted.filter((d) => expected.some((e) => paperMatchesExpected(d, e))).length;
  return hits / admitted.length;
}

export function citationPrecision(expected: string[], included: string[]): number {
  if (included.length === 0) return 1;
  const exp = new Set(expected);
  const hits = included.filter((id) => exp.has(id)).length;
  return hits / included.length;
}

export function claimFaithfulness(
  claimChecks: Array<{ verdict: "SUPPORTED" | "UNSUPPORTED" | "UNCLEAR" }>,
): number {
  if (claimChecks.length === 0) return 1;
  const supported = claimChecks.filter((c) => c.verdict === "SUPPORTED").length;
  return supported / claimChecks.length;
}

// Small, conservative English stopword set — function words that carry no
// topical signal. Kept deliberately short so we never strip a word that's
// actually load-bearing in a finding.
const COVERAGE_STOPWORDS = new Set([
  "a", "an", "the", "of", "in", "on", "at", "to", "for", "and", "or", "but",
  "with", "is", "are", "was", "were", "be", "been", "being", "by", "as",
  "that", "this", "than", "then", "from", "it", "its", "into", "over",
  "under", "vs", "versus", "a's",
]);

/**
 * Light suffix stemmer — collapses common English inflections so a claim's
 * "increases" matches a draft's "increased" / "increasing". A min-stem-length
 * guard avoids mangling short words ("used" stays "used", not "us"), and the
 * `ss` guard protects words like "process" / "address". This is NOT a full
 * Porter stemmer — the goal is tense/plural tolerance, not linguistic
 * completeness.
 */
function coverageStem(word: string): string {
  if (word.endsWith("ss")) return word;
  const strip = (suffix: string, repl = ""): string | null =>
    word.endsWith(suffix) && word.length - suffix.length + repl.length >= 3
      ? word.slice(0, -suffix.length) + repl
      : null;
  return strip("ies", "y") ?? strip("ing") ?? strip("ed") ?? strip("es") ?? strip("s") ?? word;
}

/** Lowercase → strip punctuation → split → drop stopwords → stem. */
function contentStems(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((t) => t.length > 0 && !COVERAGE_STOPWORDS.has(t))
    .map(coverageStem);
}

/**
 * Fraction of expected canonical findings the draft covers. A finding counts
 * as covered when EVERY content word of the claim (stopwords removed, light
 * stemming applied) appears somewhere in the draft.
 *
 * This measures the stated intent — "does the draft *mention* this finding?"
 * The previous implementation did an exact case-insensitive substring match
 * (`draft.includes("tdd increases test coverage")`), which required the
 * claim's verbatim phrasing and so scored ~0 against any paraphrasing LLM
 * draft — the metric read 0% across every golden on the public dashboard
 * despite the drafts plainly discussing the findings. Token-overlap with
 * stemming is a strict superset of the old check (a verbatim match still has
 * all its terms present), so scores can only rise, never regress.
 *
 * "All content terms present (stemmed)" has no leniency threshold to tune;
 * a future caller wanting partial credit can switch `.every` to a ratio.
 */
export function expectedClaimCoverage(expectedClaims: string[], draft: string): number {
  if (expectedClaims.length === 0) return 1;
  const draftStems = new Set(contentStems(draft));
  const hits = expectedClaims.filter((c) => {
    const claimStems = contentStems(c);
    if (claimStems.length === 0) return false;
    return claimStems.every((s) => draftStems.has(s));
  }).length;
  return hits / expectedClaims.length;
}
