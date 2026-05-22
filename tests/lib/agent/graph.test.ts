import { describe, it, expect, beforeEach, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  planner: vi.fn(),
  retriever: vi.fn(),
  assessor: vi.fn(),
  drafter: vi.fn(),
}));

vi.mock("@/lib/agent/nodes/planner", () => ({ plannerNode: mocks.planner }));
vi.mock("@/lib/agent/nodes/retriever", () => ({ retrieverNode: mocks.retriever }));
vi.mock("@/lib/agent/nodes/assessor", () => ({ assessorNode: mocks.assessor }));
vi.mock("@/lib/agent/nodes/drafter", () => ({ drafterNode: mocks.drafter }));

// Avoid touching real postgres in tests — use an in-memory checkpointer.
vi.mock("@/lib/agent/checkpointer", async () => {
  const { MemorySaver } = await import("@langchain/langgraph");
  const saver = new MemorySaver();
  return { getCheckpointer: async () => saver, _resetCheckpointerForTest: () => {} };
});

beforeEach(() => {
  mocks.planner.mockReset();
  mocks.retriever.mockReset();
  mocks.assessor.mockReset();
  mocks.drafter.mockReset();
});

const initialState = {
  runId: "r1",
  projectId: "p1",
  question: "Q?",
  candidateCorpusItems: [{ id: "c1", title: "P1", summary: null }],
  plan: null,
  planApproved: null,
  includedPapers: [],
  papersApproved: null,
  claims: [],
  draft: null,
};

describe("agent graph", () => {
  it("pauses after planner with the plan ready for HITL approval", async () => {
    mocks.planner.mockResolvedValue({
      plan: {
        picoc: { population: "p", intervention: "i", comparison: "c", outcome: "o", context: "ctx" },
        subQuestions: [],
        inclusionCriteria: [],
        exclusionCriteria: [],
      },
    });

    const { buildGraph } = await import("@/lib/agent/graph");
    const graph = await buildGraph();

    const config = { configurable: { thread_id: "r1" } };
    await graph.invoke(initialState, config);

    // Expect graph to have run planner then hit an interrupt
    expect(mocks.planner).toHaveBeenCalledTimes(1);
    expect(mocks.retriever).not.toHaveBeenCalled();

    const snapshot = await graph.getState(config);
    expect(snapshot.values.plan).toBeTruthy();
    expect(snapshot.values.planApproved).toBeNull();
    expect(snapshot.tasks.length).toBeGreaterThan(0);
  });

  it("runs to completion when both HITL gates are auto-approved via Command.resume", async () => {
    mocks.planner.mockResolvedValue({
      plan: {
        picoc: { population: "p", intervention: "i", comparison: "c", outcome: "o", context: "ctx" },
        subQuestions: ["q1"],
        inclusionCriteria: [],
        exclusionCriteria: [],
      },
    });
    mocks.retriever.mockResolvedValue({
      includedPapers: [{ corpusItemId: "c1", relevanceScore: 0.9, inclusionReason: "r" }],
    });
    mocks.assessor.mockResolvedValue({
      claims: [{ includedPaperId: "c1", text: "Finding", category: "finding" }],
    });
    mocks.drafter.mockResolvedValue({ draft: "# Review\n\nFinding [c1]." });

    const { buildGraph } = await import("@/lib/agent/graph");
    const { Command } = await import("@langchain/langgraph");
    const graph = await buildGraph();

    const config = { configurable: { thread_id: "r2" } };
    await graph.invoke({ ...initialState, runId: "r2" }, config);
    await graph.invoke(new Command({ resume: { approved: true } }), config);
    await graph.invoke(new Command({ resume: { approved: true, corpusItemIds: ["c1"] } }), config);

    const final = await graph.getState(config);
    expect(final.values.draft).toContain("[c1]");
    expect(mocks.drafter).toHaveBeenCalledTimes(1);
  });

  it("skips retriever/assessor/drafter when plan is rejected", async () => {
    mocks.planner.mockResolvedValue({
      plan: {
        picoc: { population: "p", intervention: "i", comparison: "c", outcome: "o", context: "ctx" },
        subQuestions: [],
        inclusionCriteria: [],
        exclusionCriteria: [],
      },
    });

    const { buildGraph } = await import("@/lib/agent/graph");
    const { Command } = await import("@langchain/langgraph");
    const graph = await buildGraph();

    const config = { configurable: { thread_id: "r3" } };
    await graph.invoke({ ...initialState, runId: "r3" }, config);
    await graph.invoke(
      new Command({ resume: { approved: false, rejectionReason: "Out of scope" } }),
      config,
    );

    const final = await graph.getState(config);
    expect(mocks.retriever).not.toHaveBeenCalled();
    expect(mocks.assessor).not.toHaveBeenCalled();
    expect(mocks.drafter).not.toHaveBeenCalled();
    expect(final.values.planApproved?.approved).toBe(false);
  });
});
