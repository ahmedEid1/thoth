import { describe, it, expect } from "vitest";
import { perProviderCounts } from "@/components/runs/discovery-summary";

describe("perProviderCounts", () => {
  it("counts papers by provider", () => {
    const out = perProviderCounts([
      { provider: "openalex" },
      { provider: "openalex" },
      { provider: "arxiv" },
    ]);
    expect(out).toEqual([
      { provider: "openalex", label: "OpenAlex", count: 2 },
      { provider: "arxiv", label: "arXiv", count: 1 },
    ]);
  });

  it("sorts by descending count, ties broken alphabetically by label", () => {
    const out = perProviderCounts([
      { provider: "arxiv" },
      { provider: "openalex" },
      { provider: "exa" },
    ]);
    // All count=1, ties: "arXiv", "Exa", "OpenAlex" alphabetically.
    expect(out.map((o) => o.label)).toEqual(["arXiv", "Exa", "OpenAlex"]);
  });

  it("falls through to the raw provider string for unknown providers — forward-compat", () => {
    const out = perProviderCounts([{ provider: "semantic_scholar" }]);
    expect(out).toEqual([
      { provider: "semantic_scholar", label: "semantic_scholar", count: 1 },
    ]);
  });

  it("returns an empty array on an empty list", () => {
    expect(perProviderCounts([])).toEqual([]);
  });
});
