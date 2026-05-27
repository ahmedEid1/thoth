import { describe, it, expect } from "vitest";
import { externalPaperLink } from "@/lib/search/external-link";

describe("externalPaperLink", () => {
  it("returns null for the uploaded synthetic provider (no external link)", () => {
    expect(externalPaperLink({ provider: "uploaded", externalId: "uploaded:ci_a" })).toBeNull();
  });

  it("rewrites arxiv:<id> to the abs page", () => {
    expect(externalPaperLink({ provider: "arxiv", externalId: "arxiv:2310.06770" })).toBe(
      "https://arxiv.org/abs/2310.06770",
    );
  });

  it("rewrites a DOI to doi.org", () => {
    expect(externalPaperLink({ provider: "openalex", externalId: "10.1038/s41586-021-03819-2" })).toBe(
      "https://doi.org/10.1038/s41586-021-03819-2",
    );
  });

  it("rewrites openalex:<W-id> to openalex.org", () => {
    expect(externalPaperLink({ provider: "openalex", externalId: "openalex:W2123456789" })).toBe(
      "https://openalex.org/W2123456789",
    );
  });

  it("falls back to oaUrl when externalId shape isn't recognised", () => {
    expect(externalPaperLink({
      provider: "exa",
      externalId: "exa-9d8f7",
      oaUrl: "https://semantic-scholar.org/paper/...",
    })).toBe("https://semantic-scholar.org/paper/...");
  });

  it("returns null when no fallback URL is available and the shape is unknown", () => {
    expect(externalPaperLink({
      provider: "exa", externalId: "exa-9d8f7",
    })).toBeNull();
  });

  it("does NOT mistake an arxiv-style id without the prefix for a DOI", () => {
    // "2310.06770" alone shouldn't match the 10.NNNN/ DOI regex (no slash).
    expect(externalPaperLink({ provider: "arxiv", externalId: "2310.06770" })).toBeNull();
  });
});
