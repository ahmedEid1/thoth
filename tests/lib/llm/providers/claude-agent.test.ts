import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({ query: mocks.query }));

beforeEach(() => {
  mocks.query.mockReset();
});

function makeAsyncIterable<T>(items: T[]): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator]() {
      let i = 0;
      return {
        next(): Promise<IteratorResult<T>> {
          if (i < items.length) {
            const value = items[i++] as T;
            return Promise.resolve({ value, done: false });
          }
          return Promise.resolve({ value: undefined, done: true });
        },
      };
    },
  };
}

describe("callClaudeAgent", () => {
  it("parses a strict-JSON response into the Zod schema", async () => {
    mocks.query.mockReturnValue(makeAsyncIterable([{ result: '{"answer":42}' }]));
    const { callClaudeAgent } = await import("@/lib/llm/providers/claude-agent");
    const out = await callClaudeAgent({
      system: "Be a math bot.",
      userMessage: "Return the answer.",
      schema: z.object({ answer: z.number() }),
      schemaName: "AnswerSchema",
    });
    expect(out).toEqual({ answer: 42 });
  });

  it("strips markdown code fences from the response", async () => {
    mocks.query.mockReturnValue(
      makeAsyncIterable([{ result: '```json\n{"answer":7}\n```' }]),
    );
    const { callClaudeAgent } = await import("@/lib/llm/providers/claude-agent");
    const out = await callClaudeAgent({
      system: "s",
      userMessage: "u",
      schema: z.object({ answer: z.number() }),
      schemaName: "x",
    });
    expect(out).toEqual({ answer: 7 });
  });

  it("throws if no result message arrives", async () => {
    mocks.query.mockReturnValue(makeAsyncIterable([{ other: "noop" }]));
    const { callClaudeAgent } = await import("@/lib/llm/providers/claude-agent");
    await expect(
      callClaudeAgent({
        system: "s",
        userMessage: "u",
        schema: z.object({ answer: z.number() }),
        schemaName: "x",
      }),
    ).rejects.toThrow(/no result text/);
  });

  it("throws if response isn't parseable JSON", async () => {
    mocks.query.mockReturnValue(makeAsyncIterable([{ result: "I don't know" }]));
    const { callClaudeAgent } = await import("@/lib/llm/providers/claude-agent");
    await expect(
      callClaudeAgent({
        system: "s",
        userMessage: "u",
        schema: z.object({ answer: z.number() }),
        schemaName: "x",
      }),
    ).rejects.toThrow(/not valid JSON/);
  });

  it("calls query() with allowedTools=[] and maxTurns=1 (single-shot)", async () => {
    mocks.query.mockReturnValue(makeAsyncIterable([{ result: '{"answer":1}' }]));
    const { callClaudeAgent } = await import("@/lib/llm/providers/claude-agent");
    await callClaudeAgent({
      system: "s",
      userMessage: "u",
      schema: z.object({ answer: z.number() }),
      schemaName: "x",
    });
    expect(mocks.query).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({ allowedTools: [], maxTurns: 1 }),
      }),
    );
  });
});
