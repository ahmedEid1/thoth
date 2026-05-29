import { z } from "zod";

const PaperSchema = z.object({
  id: z.string().min(1).describe("Unique paper id within this question (e.g., 'paper_001')"),
  title: z.string().min(1),
  summary: z.string().min(1).describe("M2-style structured summary text used by cite_check and assessor"),
  markdown: z.string().min(1).describe("Full paper text used by retriever"),
});

const PicocSchema = z.object({
  population: z.string().min(1),
  intervention: z.string().min(1),
  comparison: z.string().min(1),
  outcome: z.string().min(1),
  context: z.string().min(1),
});

const MetadataSchema = z.object({
  source: z.string().min(1).describe("Reference review / DOI / URL"),
  difficulty: z.enum(["easy", "medium", "hard"]),
});

export const GoldenQuestionSchema = z
  .object({
    id: z.string().regex(/^[0-9]{3}-[a-z0-9-]+$/, "id must look like '000-slug'"),
    question: z.string().min(10),
    picoc: PicocSchema,
    papers: z.array(PaperSchema).min(1, "at least one paper is required"),
    expectedPapers: z.array(z.string().min(1)).min(1),
    expectedClaims: z.array(z.string().min(1)).min(1),
    // V2 — optional list of expected external ids (DOIs / arXiv ids /
    // OpenAlex W-ids) for outbound goldens. When set, the eval CLI
    // computes discovery_recall + screening_precision against this list;
    // when undefined (every existing V1 golden), those metrics are
    // skipped so the dashboard doesn't fill with vacuous 1.00 rows.
    expectedDois: z.array(z.string().min(3)).optional(),
    // V2 — richer per-paper discovery expectation. Each entry identifies ONE
    // expected work by any of: DOI, arXiv id, or title. Matching against the
    // discovered set is identity-agnostic (see lib/eval/metrics.ts): the same
    // paper is indexed under its DOI by OpenAlex and its arXiv id by arXiv, so
    // a paper that WAS discovered (just via a different provider/id) must not
    // score as a miss. Preferred over `expectedDois` for outbound goldens;
    // when both are set, `expectedDiscovery` wins.
    expectedDiscovery: z
      .array(
        z
          .object({
            doi: z.string().min(3).optional(),
            arxivId: z.string().min(3).optional(),
            title: z.string().min(3).optional(),
          })
          .refine((e) => !!(e.doi || e.arxivId || e.title), {
            message: "each expectedDiscovery entry needs at least one of doi / arxivId / title",
          }),
      )
      .optional(),
    // V2 — opt the golden into the outbound search pipeline. When
    // `searchScope` is "outbound"/"hybrid", run-evals.ts passes it (and
    // `searchProviders`) to the headless runner so the discoverer actually
    // fires against real provider APIs and `discovery_recall` is meaningful.
    // Omitted (the default) on every V1 golden → uploaded_only, unchanged.
    searchScope: z.enum(["uploaded_only", "outbound", "hybrid"]).optional(),
    searchProviders: z.array(z.enum(["openalex", "arxiv", "exa"])).optional(),
    // V2 — per-golden cap on discovered papers (the discoverer's `searchMaxHits`
    // knob). Kept small on free-tier outbound goldens so the per-paper screener
    // + assessor fan-out completes inside Mistral's free budget; the
    // `EVAL_SEARCH_MAX_HITS` env overrides it for a paid/higher-RPS provider
    // (see lib/eval/search-max-hits.ts). Omitted → discoverer default (50).
    searchMaxHits: z.number().int().positive().optional(),
    metadata: MetadataSchema,
  })
  // `papers[].id` must be unique within the question — `lib/eval/seed-corpus.ts`
  // builds a Map<paper.id, corpusItem.id> and a duplicate paper id would
  // silently overwrite the earlier entry, dropping a paper from the seeded
  // corpus. None of the existing 18 goldens have duplicates today; the
  // refine keeps that invariant intact going forward.
  .refine(
    (g) => new Set(g.papers.map((p) => p.id)).size === g.papers.length,
    { message: "papers[].id must be unique within the question" },
  )
  .refine(
    (g) => {
      const paperIds = new Set(g.papers.map((p) => p.id));
      return g.expectedPapers.every((id) => paperIds.has(id));
    },
    { message: "expectedPapers must all reference ids declared in papers[]" },
  );

export type GoldenQuestion = z.infer<typeof GoldenQuestionSchema>;
