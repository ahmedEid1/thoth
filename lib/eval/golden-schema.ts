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
    metadata: MetadataSchema,
  })
  .refine(
    (g) => {
      const paperIds = new Set(g.papers.map((p) => p.id));
      return g.expectedPapers.every((id) => paperIds.has(id));
    },
    { message: "expectedPapers must all reference ids declared in papers[]" },
  );

export type GoldenQuestion = z.infer<typeof GoldenQuestionSchema>;
