import { describe, it, expect } from "vitest";
import { countsLine } from "@/components/projects/project-list";

describe("countsLine", () => {
  it("singularises both labels when each is 1", () => {
    expect(countsLine({ corpus: 1, runs: 1 })).toBe("1 paper · 1 review");
  });

  it("pluralises both labels when neither is 1", () => {
    expect(countsLine({ corpus: 3, runs: 2 })).toBe("3 papers · 2 reviews");
    expect(countsLine({ corpus: 0, runs: 0 })).toBe("0 papers · 0 reviews");
  });

  it("mixes singular + plural correctly", () => {
    expect(countsLine({ corpus: 1, runs: 5 })).toBe("1 paper · 5 reviews");
    expect(countsLine({ corpus: 7, runs: 1 })).toBe("7 papers · 1 review");
  });
});
