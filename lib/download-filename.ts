/**
 * Build a human-readable download filename for a run artefact.
 *
 * Example:
 *   buildRunFilename({
 *     projectTitle: "Archaeal Hibernation: A Systematic Review",
 *     runId: "cm123abc",
 *     startedAt: new Date("2026-05-28T14:00:00Z"),
 *     suffix: "audit.json",
 *   })
 *   → "thoth-archaeal-hibernation-a-systematic-review-2026-05-28-audit.json"
 *
 * Slug rules (mirrors common GitHub / NPM slugification):
 *   - lowercased
 *   - non-alphanumeric runs collapsed to a single `-`
 *   - leading + trailing `-` stripped
 *   - capped at 60 chars (truncated at the last `-` boundary so we don't
 *     cut mid-word)
 *   - empty title falls back to the run id (so `thoth--audit.json`
 *     never happens)
 *
 * Date is included as YYYY-MM-DD so directory sort puts older drafts
 * first. The run id is *not* in the default filename — collision risk
 * within a single project's date is low + the run id is opaque to
 * users.
 */
export function buildRunFilename(args: {
  projectTitle: string;
  runId: string;
  startedAt: Date;
  /** Suffix WITHOUT a leading dot. Examples: "md", "audit.json", "citations.bib". */
  suffix: string;
}): string {
  const slug = slugify(args.projectTitle) || args.runId;
  const date = formatDate(args.startedAt);
  return `thoth-${slug}-${date}.${args.suffix}`;
}

function slugify(s: string): string {
  const lowered = s.toLowerCase();
  const collapsed = lowered.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (collapsed.length <= 60) return collapsed;
  // Truncate at the last `-` boundary before 60 to avoid mid-word cuts.
  const truncated = collapsed.slice(0, 60);
  const lastDash = truncated.lastIndexOf("-");
  return lastDash > 30 ? truncated.slice(0, lastDash) : truncated;
}

function formatDate(d: Date): string {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "unknown-date";
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
