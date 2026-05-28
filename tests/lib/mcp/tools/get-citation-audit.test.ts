import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    run: { findFirst: vi.fn() },
    claimCheck: { findMany: vi.fn() },
    corpusItem: { findMany: vi.fn() },
  },
}));

import { db } from "@/lib/db";
import { getCitationAudit } from "@/lib/mcp/tools/get-citation-audit";
import { NotFoundError } from "@/lib/mcp/handler";

beforeEach(() => vi.clearAllMocks());

describe("getCitationAudit", () => {
  it("returns per-claim verdicts and aggregates for an owned review", async () => {
    vi.mocked(db.run.findFirst).mockResolvedValue({
      id: "r1",
      faithfulnessScore: 0.83,
      createdAt: new Date("2026-05-28T14:00:00Z"),
      completedAt: new Date("2026-05-28T14:15:30Z"),
      question: "How does archaeal hibernation work?",
      project: { title: "GAT Review" },
    } as never);
    vi.mocked(db.claimCheck.findMany).mockResolvedValue([
      { paperId: "p1", claim: "A claim", verdict: "SUPPORTED", reason: "found in page 3", paperExcerpt: "supporting span" },
      { paperId: "p2", claim: "Another", verdict: "UNSUPPORTED", reason: "not found", paperExcerpt: null },
      { paperId: "p3", claim: "Unclear", verdict: "UNCLEAR", reason: "ambiguous", paperExcerpt: null },
    ] as never);
    // M100: corpus lookup for citedPaperTitle. p3 has no row → null.
    vi.mocked(db.corpusItem.findMany).mockResolvedValue([
      { id: "p1", parsedMarkdown: "# First Paper\n\nbody" },
      { id: "p2", parsedMarkdown: "# Second Paper\n\nbody" },
    ] as never);

    const res = await getCitationAudit(
      { reviewId: "r1" },
      { userId: "u1", clerkId: "c1" },
    );

    expect(res).toEqual({
      reviewId: "r1",
      // M77: MCP response now mirrors the HTTP audit.json shape with
      // project context fields so an AI assistant has enough info to
      // discuss the review without a second lookup.
      projectTitle: "GAT Review",
      reviewQuestion: "How does archaeal hibernation work?",
      runStartedAt: "2026-05-28T14:00:00.000Z",
      runCompletedAt: "2026-05-28T14:15:30.000Z",
      faithfulnessScore: 0.83,
      totalClaims: 3,
      supportedCount: 1,
      unsupportedCount: 1,
      unclearCount: 1,
      claims: [
        { claimText: "A claim", citedPaperId: "p1", citedPaperTitle: "First Paper", verdict: "supported", reason: "found in page 3", supportingSpan: "supporting span" },
        { claimText: "Another", citedPaperId: "p2", citedPaperTitle: "Second Paper", verdict: "unsupported", reason: "not found", supportingSpan: null },
        { claimText: "Unclear", citedPaperId: "p3", citedPaperTitle: null, verdict: "unclear", reason: "ambiguous", supportingSpan: null },
      ],
    });
  });

  it("returns empty claims array when cite_check has not run yet", async () => {
    vi.mocked(db.run.findFirst).mockResolvedValue({
      id: "r1",
      faithfulnessScore: null,
      createdAt: new Date("2026-05-28T14:00:00Z"),
      completedAt: null,
      question: "Empty test",
      project: { title: "Empty Review" },
    } as never);
    vi.mocked(db.claimCheck.findMany).mockResolvedValue([] as never);

    const res = await getCitationAudit({ reviewId: "r1" }, { userId: "u1", clerkId: "c1" });

    expect(res).toEqual({
      reviewId: "r1",
      projectTitle: "Empty Review",
      reviewQuestion: "Empty test",
      runStartedAt: "2026-05-28T14:00:00.000Z",
      runCompletedAt: null,
      faithfulnessScore: null,
      totalClaims: 0, supportedCount: 0, unsupportedCount: 0, unclearCount: 0,
      claims: [],
    });
  });

  it("throws NotFoundError when review is unowned", async () => {
    vi.mocked(db.run.findFirst).mockResolvedValue(null as never);
    await expect(getCitationAudit(
      { reviewId: "r_other" },
      { userId: "u1", clerkId: "c1" },
    )).rejects.toBeInstanceOf(NotFoundError);
  });
});
