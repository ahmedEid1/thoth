import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

// vi.hoisted() lifts mock objects above vi.mock()'s automatic hoist.
// Without this, the factories below run before `trace`/`generation` exist (TDZ).
const mocks = vi.hoisted(() => {
  const generation = { end: vi.fn() };
  const trace = {
    generation: vi.fn(() => generation),
    update: vi.fn(),
    getTraceUrl: vi.fn(() => "http://localhost:3030/project/atlas-dev/traces/trace_abc"),
  };
  const langfuse = {
    trace: vi.fn(() => trace),
    flushAsync: vi.fn(async () => undefined),
  };
  const parse = vi.fn();
  return { generation, trace, langfuse, parse };
});

vi.mock("@/lib/env", () => ({
  env: {
    ANTHROPIC_API_KEY: "sk-ant-test-fake-key-for-mocked-tests",
    LANGFUSE_PUBLIC_KEY: "pk-lf-test",
    LANGFUSE_SECRET_KEY: "sk-lf-test",
    LANGFUSE_HOST: "http://localhost:3030",
  },
}));

vi.mock("@/lib/langfuse", () => ({
  getLangfuse: () => mocks.langfuse,
  _resetLangfuseForTest: () => {},
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { parse: mocks.parse };
  },
}));

vi.mock("@anthropic-ai/sdk/helpers/zod", () => ({
  zodOutputFormat: (schema: unknown) => ({ type: "json_schema", schema }),
}));

beforeEach(() => {
  mocks.parse.mockReset();
  mocks.langfuse.trace.mockClear();
  mocks.langfuse.flushAsync.mockClear();
  mocks.trace.generation.mockClear();
  mocks.trace.update.mockClear();
  mocks.trace.getTraceUrl.mockClear();
  mocks.generation.end.mockClear();
});

describe("runLLM", () => {
  it("returns parsed output and trace URL on success", async () => {
    mocks.parse.mockResolvedValue({
      parsed_output: { answer: "42" },
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_read_input_tokens: 80,
        cache_creation_input_tokens: 0,
      },
    });

    const { runLLM } = await import("@/lib/llm");
    const result = await runLLM({
      name: "test-call",
      model: "claude-opus-4-7",
      maxTokens: 1024,
      system: [{ type: "text", text: "system" }],
      messages: [{ role: "user", content: "ask" }],
      schema: z.object({ answer: z.string() }),
    });

    expect(result.output).toEqual({ answer: "42" });
    expect(result.traceUrl).toBe("http://localhost:3030/project/atlas-dev/traces/trace_abc");
    expect(result.usage.inputTokens).toBe(100);
    expect(result.usage.outputTokens).toBe(50);
    expect(result.usage.cacheReadInputTokens).toBe(80);

    expect(mocks.langfuse.trace).toHaveBeenCalledWith(
      expect.objectContaining({ name: "test-call" }),
    );
    expect(mocks.trace.generation).toHaveBeenCalled();
    expect(mocks.generation.end).toHaveBeenCalledWith(
      expect.objectContaining({ output: { answer: "42" } }),
    );
    expect(mocks.langfuse.flushAsync).toHaveBeenCalled();
  });

  it("marks generation with error and rethrows on Anthropic failure", async () => {
    mocks.parse.mockRejectedValue(new Error("anthropic down"));

    const { runLLM } = await import("@/lib/llm");
    await expect(
      runLLM({
        name: "test-call",
        model: "claude-opus-4-7",
        maxTokens: 1024,
        system: [{ type: "text", text: "system" }],
        messages: [{ role: "user", content: "ask" }],
        schema: z.object({ answer: z.string() }),
      }),
    ).rejects.toThrow(/anthropic down/);

    expect(mocks.generation.end).toHaveBeenCalledWith(
      expect.objectContaining({
        level: "ERROR",
        statusMessage: expect.stringContaining("anthropic down"),
      }),
    );
    expect(mocks.langfuse.flushAsync).toHaveBeenCalled();
  });

  it("throws when parsed_output is null (Zod validation failed inside SDK)", async () => {
    mocks.parse.mockResolvedValue({
      parsed_output: null,
      usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    });

    const { runLLM } = await import("@/lib/llm");
    await expect(
      runLLM({
        name: "test-call",
        model: "claude-opus-4-7",
        maxTokens: 1024,
        system: [{ type: "text", text: "system" }],
        messages: [{ role: "user", content: "ask" }],
        schema: z.object({ answer: z.string() }),
      }),
    ).rejects.toThrow(/parsed_output/);
  });
});
