import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: { corpusItem: { findMany: vi.fn() } },
}));

import { db } from "@/lib/db";
import { loadCitedPaperTitles } from "@/lib/cited-paper-titles";

beforeEach(() => vi.clearAllMocks());

describe("loadCitedPaperTitles", () => {
  it("returns an empty map (no query) for an empty id list", async () => {
    const map = await loadCitedPaperTitles([]);
    expect(map.size).toBe(0);
    expect(db.corpusItem.findMany).not.toHaveBeenCalled();
  });

  it("maps each corpus id to its extracted title", async () => {
    vi.mocked(db.corpusItem.findMany).mockResolvedValue([
      { id: "p1", parsedMarkdown: "# First Paper\n\nbody" },
      { id: "p2", parsedMarkdown: "## Second Paper\n\nbody" },
    ] as never);

    const map = await loadCitedPaperTitles(["p1", "p2"]);
    expect(map.get("p1")).toBe("First Paper");
    expect(map.get("p2")).toBe("Second Paper");
  });

  it("de-dups ids before querying", async () => {
    vi.mocked(db.corpusItem.findMany).mockResolvedValue([
      { id: "p1", parsedMarkdown: "# Only Paper\n\nbody" },
    ] as never);

    await loadCitedPaperTitles(["p1", "p1", "p1"]);
    expect(db.corpusItem.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["p1"] } },
      select: { id: true, parsedMarkdown: true },
    });
  });

  it("yields null for an id with no row (deleted corpus item)", async () => {
    vi.mocked(db.corpusItem.findMany).mockResolvedValue([
      { id: "p1", parsedMarkdown: "# Present\n\nbody" },
    ] as never);

    const map = await loadCitedPaperTitles(["p1", "p_missing"]);
    expect(map.get("p1")).toBe("Present");
    // p_missing isn't in the map at all → .get returns undefined; callers
    // coalesce to null. Assert the absence explicitly.
    expect(map.has("p_missing")).toBe(false);
  });

  it("yields null for an item whose markdown has no usable heading", async () => {
    vi.mocked(db.corpusItem.findMany).mockResolvedValue([
      { id: "p1", parsedMarkdown: "no heading here, just prose" },
      { id: "p2", parsedMarkdown: null },
    ] as never);

    const map = await loadCitedPaperTitles(["p1", "p2"]);
    expect(map.get("p1")).toBeNull();
    expect(map.get("p2")).toBeNull();
  });
});
