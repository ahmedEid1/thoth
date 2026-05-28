/**
 * Compact human-readable rendering of large integer counts (token
 * counts, paper counts, etc). Used by the token-spend badges and any
 * other compact-stat surfaces.
 *
 * Scales:
 *   <10k       → exact with locale grouping ("1,234")
 *   10k..1M    → 1-decimal-stripped k ("121k", "999k")
 *   >=1M       → 1-decimal M ("1.2M", "23.4M")
 *
 * Boundary handling: a value that ROUNDS to 1000k (e.g. 999,500) is
 * escalated to the M-tier so we never render "1000k". Negative numbers
 * preserve the sign ("-121k"). Non-finite / NaN inputs render as "0"
 * to defend against arithmetic upstream surprises (e.g., subtracting a
 * stale cache).
 *
 * Exported separately from any component so it can be reused on
 * server pages without dragging React imports.
 */
export function compactCount(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) {
    // Escalate to M-tier if k-rounding would produce "1000k". The
    // closed-form check `>= 999_500` matches what Math.round(abs/1000)
    // would do without a redundant divide-then-round-then-compare.
    if (abs >= 999_500) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
    return `${sign}${(abs / 1000).toFixed(0)}k`;
  }
  return n.toLocaleString();
}
