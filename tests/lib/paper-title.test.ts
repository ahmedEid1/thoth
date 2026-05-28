import { describe, it, expect } from "vitest";
import { extractPaperTitle, sanitiseTitle } from "@/lib/paper-title";

describe("extractPaperTitle", () => {
  it("returns the first H1 heading, sanitised", () => {
    expect(extractPaperTitle("# **Bold Title**\n\nbody")).toBe("Bold Title");
  });

  it("returns the first H2 heading when there's no H1", () => {
    expect(extractPaperTitle("## Subsection Title\n\nbody")).toBe("Subsection Title");
  });

  it("skips blank lines before the heading", () => {
    expect(extractPaperTitle("\n\n   \n# After Blanks")).toBe("After Blanks");
  });

  it("unwraps LaTeX + emphasis (shared sanitiser)", () => {
    expect(extractPaperTitle("# $\\mathrm{GAT}$ networks")).toBe("GAT networks");
  });

  it("returns null for empty / null / undefined markdown", () => {
    expect(extractPaperTitle(null)).toBeNull();
    expect(extractPaperTitle(undefined)).toBeNull();
    expect(extractPaperTitle("")).toBeNull();
  });

  it("returns null when no H1/H2 heading exists", () => {
    expect(extractPaperTitle("### Only an H3\n\nbody")).toBeNull();
    expect(extractPaperTitle("just prose, no headings")).toBeNull();
  });

  it("returns null when the heading is empty after sanitising", () => {
    expect(extractPaperTitle("#   \n\nbody")).toBeNull();
  });
});

describe("sanitiseTitle (shared with corpus list)", () => {
  it("is the same implementation the corpus list imports", () => {
    // Smoke check — the corpus-item-label.test.ts covers the full matrix;
    // this asserts the export is reachable from the new lib path.
    expect(sanitiseTitle("**x**")).toBe("x");
  });
});
