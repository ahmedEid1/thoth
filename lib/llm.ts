import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { env } from "@/lib/env";
import { getLangfuse } from "@/lib/langfuse";

let _client: Anthropic | null = null;

function getAnthropic(): Anthropic {
  if (_client) return _client;
  if (!env.ANTHROPIC_API_KEY || env.ANTHROPIC_API_KEY === "sk-ant-...") {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add a real key to .env to run live LLM calls. " +
        "Tests should mock @anthropic-ai/sdk to avoid this path.",
    );
  }
  _client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return _client;
}

export type RunLLMArgs<T> = {
  /** Span name shown in Langfuse — used to group traces ("summarize-paper", "planner", etc.) */
  name: string;
  model: "claude-opus-4-7" | "claude-sonnet-4-6" | "claude-haiku-4-5";
  maxTokens: number;
  /** System blocks. Mark long stable content with `cache_control: { type: "ephemeral" }`. */
  system: Anthropic.TextBlockParam[];
  messages: Anthropic.MessageParam[];
  /** Zod schema. SDK validates the response against this; `parsed_output` is typed. */
  schema: z.ZodType<T>;
  /** Optional Langfuse trace metadata (e.g. corpusItemId, projectId). */
  metadata?: Record<string, unknown>;
  /** Adaptive thinking. Defaults to on for Opus 4.7 / 4.6. */
  thinking?: Anthropic.ThinkingConfigParam;
};

export type RunLLMResult<T> = {
  output: T;
  traceUrl: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
    cacheCreationInputTokens: number;
  };
};

/**
 * The single wrapper for every LLM call in the codebase.
 *
 * Responsibilities:
 *   - Construct one Anthropic client (lazy)
 *   - Open a Langfuse trace + generation span around the call
 *   - Pass the schema through `output_config.format` for SDK-side Zod validation
 *   - Capture token usage and cost
 *   - Emit the Langfuse trace URL so the UI can link to it
 *   - Flush Langfuse on success AND failure (Trigger.dev workers exit fast)
 */
export async function runLLM<T>(args: RunLLMArgs<T>): Promise<RunLLMResult<T>> {
  const anthropic = getAnthropic();
  const lf = getLangfuse();

  const trace = lf.trace({
    name: args.name,
    metadata: args.metadata,
    input: { system: args.system, messages: args.messages },
  });

  const generation = trace.generation({
    name: `${args.name}:claude`,
    model: args.model,
    modelParameters: { max_tokens: args.maxTokens },
    input: args.messages,
    metadata: args.metadata,
  });

  try {
    const response = await anthropic.messages.parse({
      model: args.model,
      max_tokens: args.maxTokens,
      thinking: args.thinking ?? { type: "adaptive" },
      system: args.system,
      messages: args.messages,
      output_config: { format: zodOutputFormat(args.schema) },
    });

    if (response.parsed_output == null) {
      throw new Error("LLM returned null parsed_output — schema validation failed inside SDK");
    }

    const usage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadInputTokens: response.usage.cache_read_input_tokens ?? 0,
      cacheCreationInputTokens: response.usage.cache_creation_input_tokens ?? 0,
    };

    generation.end({
      output: response.parsed_output,
      usage: {
        input: usage.inputTokens,
        output: usage.outputTokens,
        unit: "TOKENS",
      },
    });

    trace.update({ output: response.parsed_output });

    return {
      output: response.parsed_output as T,
      traceUrl: trace.getTraceUrl(),
      usage,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    generation.end({
      level: "ERROR",
      statusMessage: message.slice(0, 500),
    });
    trace.update({ output: { error: message.slice(0, 500) } });
    throw err;
  } finally {
    await lf.flushAsync();
  }
}
