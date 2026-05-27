import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

beforeEach(() => {
  vi.restoreAllMocks();
});
afterEach(() => {
  vi.restoreAllMocks();
});

// Helper: stub global fetch with a single canned response.
function stubFetch(
  body: unknown,
  init: { status?: number; ok?: boolean } = {},
): void {
  const status = init.status ?? 200;
  const ok = init.ok ?? (status >= 200 && status < 300);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(typeof body === "string" ? body : JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
        // @ts-expect-error — Response.ok is computed from status, we override for the negative test
        ok,
      }),
    ),
  );
}

import { openalexSearch, reconstructAbstract } from "@/lib/search/providers/openalex";
import { SearchProviderError } from "@/lib/search/types";

describe("reconstructAbstract", () => {
  it("returns null for missing or empty input", () => {
    expect(reconstructAbstract(null)).toBeNull();
    expect(reconstructAbstract({})).toBeNull();
  });

  it("rebuilds prose from the inverted index, sorted by position", () => {
    const inv = { we: [0], study: [1], "foo,": [2], find: [3], bar: [4] };
    expect(reconstructAbstract(inv)).toBe("we study foo, find bar");
  });

  it("handles a word appearing in multiple positions", () => {
    const inv = { the: [0, 3], cat: [1], on: [2], mat: [4] };
    expect(reconstructAbstract(inv)).toBe("the cat on the mat");
  });
});

describe("openalexSearch", () => {
  it("maps OpenAlex results into DiscoveredPaperSpec", async () => {
    stubFetch({
      results: [
        {
          id: "https://openalex.org/W123",
          doi: "https://doi.org/10.1145/3641289.3641290",
          title: "On graph attention",
          authorships: [
            { author: { display_name: "A. Author" } },
            { author: { display_name: "B. Author" } },
          ],
          publication_year: 2024,
          host_venue: { display_name: "ICSE" },
          cited_by_count: 42,
          open_access: { is_oa: true, oa_url: "https://example.org/foo.pdf" },
          abstract_inverted_index: { we: [0], study: [1], graphs: [2] },
          relevance_score: 18.5,
        },
      ],
    });

    const hits = await openalexSearch({ query: "graph attention" });
    expect(hits).toHaveLength(1);
    const h = hits[0]!;
    expect(h.provider).toBe("openalex");
    expect(h.externalId).toBe("10.1145/3641289.3641290"); // DOI prefix stripped
    expect(h.title).toBe("On graph attention");
    expect(h.authors).toEqual(["A. Author", "B. Author"]);
    expect(h.publicationYear).toBe(2024);
    expect(h.venue).toBe("ICSE");
    expect(h.citationCount).toBe(42);
    expect(h.oaUrl).toBe("https://example.org/foo.pdf");
    expect(h.accessStatus).toBe("open");
    expect(h.abstract).toBe("we study graphs");
    expect(h.initialScore).toBeCloseTo(1.0); // normalised against itself
  });

  it("falls back to the OpenAlex W-id when DOI is missing", async () => {
    stubFetch({
      results: [
        {
          id: "https://openalex.org/W999",
          doi: null,
          title: "Paper without a DOI",
          publication_year: 2024,
          open_access: { is_oa: false },
          relevance_score: 1,
        },
      ],
    });

    const hits = await openalexSearch({ query: "x" });
    expect(hits[0]!.externalId).toBe("openalex:W999");
    expect(hits[0]!.accessStatus).toBe("paywalled");
  });

  it("classifies unknown is_oa as accessStatus=unknown", async () => {
    stubFetch({
      results: [
        {
          id: "https://openalex.org/W1",
          title: "Mystery paper",
          open_access: null,
          relevance_score: 1,
        },
      ],
    });

    const hits = await openalexSearch({ query: "x" });
    expect(hits[0]!.accessStatus).toBe("unknown");
  });

  it("skips results missing required fields (title or id)", async () => {
    stubFetch({
      results: [
        { id: "https://openalex.org/W1", title: null },
        { title: "No id", id: undefined },
        { id: "https://openalex.org/W2", title: "Valid", open_access: { is_oa: true, oa_url: "https://x.org/a.pdf" }, relevance_score: 1 },
      ],
    });

    const hits = await openalexSearch({ query: "x" });
    expect(hits).toHaveLength(1);
    expect(hits[0]!.title).toBe("Valid");
  });

  it("normalises relevance_score against the max in the response", async () => {
    stubFetch({
      results: [
        { id: "https://openalex.org/W1", title: "Top", relevance_score: 10, open_access: null },
        { id: "https://openalex.org/W2", title: "Mid", relevance_score: 5, open_access: null },
      ],
    });

    const hits = await openalexSearch({ query: "x" });
    const byId = Object.fromEntries(hits.map((h) => [h.externalId, h.initialScore]));
    expect(byId["openalex:W1"]).toBeCloseTo(1.0);
    expect(byId["openalex:W2"]).toBeCloseTo(0.5);
  });

  it("throws SearchProviderError on HTTP error", async () => {
    stubFetch("Service Unavailable", { status: 503 });
    await expect(openalexSearch({ query: "x" })).rejects.toBeInstanceOf(SearchProviderError);
    await expect(openalexSearch({ query: "x" })).rejects.toMatchObject({
      provider: "openalex",
      message: expect.stringContaining("503"),
    });
  });

  it("throws SearchProviderError on network failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("fetch failed");
    }));
    await expect(openalexSearch({ query: "x" })).rejects.toBeInstanceOf(SearchProviderError);
    await expect(openalexSearch({ query: "x" })).rejects.toMatchObject({
      provider: "openalex",
      message: expect.stringContaining("network error"),
    });
  });

  it("applies the yearStart/yearEnd filter when both provided", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ results: [] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await openalexSearch({ query: "x", yearStart: 2020, yearEnd: 2024 });
    const called = String((fetchMock.mock.calls as unknown[][])[0]![0]);
    expect(called).toContain("from_publication_date%3A2020-01-01");
    expect(called).toContain("to_publication_date%3A2024-12-31");
  });
});
