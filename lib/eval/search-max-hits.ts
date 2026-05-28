/**
 * Resolves the discoverer's per-run paper cap (`searchMaxHits`) for an eval run.
 *
 * Precedence:
 *   1. `EVAL_SEARCH_MAX_HITS` env — an operator override. Point `LLM_PROVIDER`
 *      at a paid / higher-RPS provider and set this (e.g. `50`) to exercise a
 *      golden's FULL discovery set; the per-paper screener fan-out that
 *      rate-limits Mistral's free tier is fine on a paid tier.
 *   2. the golden's own `searchMaxHits` — kept small (e.g. 4) so the full
 *      outbound pipeline completes within the free tier's budget.
 *   3. `undefined` → `runHeadless` leaves `state.searchMaxHits` null and the
 *      discoverer falls back to `env.MAX_DISCOVERED_PAPERS_PER_RUN` (default 50).
 *
 * The env value is ignored unless it parses to a positive integer.
 */
export function resolveSearchMaxHits(
  golden: { searchMaxHits?: number },
  envValue: string | undefined = process.env.EVAL_SEARCH_MAX_HITS,
): number | undefined {
  const raw = envValue?.trim();
  if (raw) {
    const n = Number(raw);
    if (Number.isInteger(n) && n > 0) return n;
  }
  return golden.searchMaxHits;
}
