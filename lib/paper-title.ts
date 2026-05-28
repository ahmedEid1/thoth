/**
 * Shared paper-title helpers used by:
 *   - the corpus list UI (display label)
 *   - the citations.bib download route (BibTeX `title` field)
 *
 * Both need to turn Mistral-OCR'd markdown into a clean human title,
 * so the logic lives here once rather than diverging (the .bib route
 * previously did its own bare `# `-heading extraction with no
 * sanitisation, leaking literal `**asterisks**` into BibTeX).
 */

/**
 * Strip common Mistral-OCR title artefacts: markdown emphasis
 * (`**bold**`, `*italic*`, `_emph_`, `` `code` ``), inline LaTeX
 * commands (`$\mathrm{Foo}$` → `Foo`), surrounding quotes, and
 * collapsed whitespace. Defensive — every transform is a no-op when
 * its pattern doesn't match, so a clean title passes through unchanged.
 */
export function sanitiseTitle(raw: string): string {
  let s = raw.trim();
  // LaTeX inline math wrappers: `$\mathrm{Foo}$`, `${Foo}$` → keep the
  // argument. Iterate so nested wrappers unwrap. Cap iterations to
  // avoid a pathological infinite-loop input.
  for (let i = 0; i < 5; i++) {
    const before = s;
    s = s.replace(/\$\\?[a-zA-Z]+\{([^${}]*)\}\$/g, "$1");
    s = s.replace(/\$\{([^${}]*)\}\$/g, "$1");
    s = s.replace(/\$([^$]+)\$/g, "$1");
    if (s === before) break;
  }
  // Markdown emphasis runs: keep the wrapped text, drop the markers.
  s = s
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/(?<!\w)_(.+?)_(?!\w)/g, "$1")
    .replace(/`([^`]+)`/g, "$1");
  // Strip surrounding quotes (straight + curly).
  s = s.replace(/^["“'‘](.*)["”'’]$/, "$1");
  // Collapse internal whitespace runs.
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

/**
 * Extract a clean paper title from OCR'd markdown: the first non-empty
 * H1/H2 heading line, sanitised via `sanitiseTitle`. Returns null when
 * the markdown is empty/null or has no usable heading — callers decide
 * the fallback (corpus list → humanised source; .bib → "Untitled
 * paper" via the BibTeX builder).
 */
export function extractPaperTitle(markdown: string | null | undefined): string | null {
  if (!markdown) return null;
  for (const line of markdown.split(/\r?\n/)) {
    const match = line.match(/^#{1,2}\s+(.+)$/);
    const heading = match?.[1] ? sanitiseTitle(match[1]) : "";
    if (heading.length > 0) return heading;
  }
  return null;
}
