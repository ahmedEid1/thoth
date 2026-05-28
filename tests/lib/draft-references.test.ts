import { describe, it, expect } from "vitest";
import { toDraftReferences } from "@/lib/draft-references";

describe("toDraftReferences", () => {
  it("maps a V2 discovered paper, preferring the provider title over the OCR heading", () => {
    const out = toDraftReferences([
      {
        corpusItemId: "cm_a",
        corpusItem: {
          // OCR heading is garbled; the clean provider title must win.
          parsedMarkdown: "# Gr4ph Att3nt10n Netw0rks (ocr noise)\n\nbody",
          externalDoi: "10.1/gat",
          externalArxivId: null,
          discoveredAs: {
            title: "Graph Attention Networks",
            authors: ["P. Veličković", "G. Cucurull"],
            publicationYear: 2018,
            venue: "ICLR",
          },
        },
      },
    ]);
    expect(out).toEqual([
      {
        paperId: "cm_a",
        title: "Graph Attention Networks",
        authors: ["P. Veličković", "G. Cucurull"],
        year: 2018,
        venue: "ICLR",
        externalDoi: "10.1/gat",
        externalArxivId: null,
      },
    ]);
  });

  it("uses the provider title even when the OCR markdown has no heading (no more 'Untitled')", () => {
    const out = toDraftReferences([
      {
        corpusItemId: "cm_d",
        corpusItem: {
          parsedMarkdown: "no usable heading here, just OCR prose",
          externalDoi: null,
          externalArxivId: "2310.06770",
          discoveredAs: {
            title: "ReAct: Synergizing Reasoning and Acting in Language Models",
            authors: ["S. Yao"],
            publicationYear: 2022,
            venue: "ICLR",
          },
        },
      },
    ]);
    expect(out[0]!.title).toBe("ReAct: Synergizing Reasoning and Acting in Language Models");
  });

  it("maps an uploaded PDF (no discoveredAs) to title-only nulls", () => {
    const out = toDraftReferences([
      {
        corpusItemId: "cm_b",
        corpusItem: {
          parsedMarkdown: "# Uploaded Paper\n\nbody",
          externalDoi: null,
          externalArxivId: null,
          discoveredAs: null,
        },
      },
    ]);
    expect(out).toEqual([
      {
        paperId: "cm_b",
        title: "Uploaded Paper",
        authors: null,
        year: null,
        venue: null,
        externalDoi: null,
        externalArxivId: null,
      },
    ]);
  });

  it("yields a null title when the markdown has no heading", () => {
    const out = toDraftReferences([
      {
        corpusItemId: "cm_c",
        corpusItem: {
          parsedMarkdown: "no heading, just prose",
          externalDoi: null,
          externalArxivId: "2201.11903",
          discoveredAs: null,
        },
      },
    ]);
    expect(out[0]!.title).toBeNull();
    expect(out[0]!.externalArxivId).toBe("2201.11903");
  });

  it("returns an empty array for no included papers", () => {
    expect(toDraftReferences([])).toEqual([]);
  });
});
