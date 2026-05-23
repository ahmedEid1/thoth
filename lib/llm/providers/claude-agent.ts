import { query } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

/**
 * Calls Claude Agent SDK with a single-shot non-interactive prompt that asks
 * for strict JSON matching the given Zod schema. Used by lib/llm.ts's bypass
 * branch when env.LLM_PROVIDER === "claude-agent".
 *
 * Authentication: the SDK reads ANTHROPIC_API_KEY env var if set. If unset,
 * it falls back to the Claude Code CLI session auth on the same machine
 * (auto-detected). This lets users with a Claude Max subscription run evals
 * without paying for API tokens.
 */
export async function callClaudeAgent<T>(args: {
  system: string;
  userMessage: string;
  schema: z.ZodType<T>;
  schemaName: string;
}): Promise<T> {
  // Build a strict-JSON prompt. We tell the model to return ONLY JSON, no prose.
  const prompt = `${args.system}

${args.userMessage}

You MUST respond with ONLY valid JSON (no prose before or after, no markdown code fences) matching this schema named "${args.schemaName}":

${JSON.stringify(schemaToHint(args.schema), null, 2)}`;

  // No tools, single-turn, just text generation
  const session = query({
    prompt,
    options: { allowedTools: [], maxTurns: 1 },
  });

  let lastText = "";
  for await (const message of session) {
    if ("result" in message && typeof message.result === "string") {
      lastText = message.result;
    }
  }

  if (!lastText) {
    throw new Error("claude-agent: no result text returned from query()");
  }

  // Strip code fences if Agent SDK wraps in markdown (defensive — prompt says not to)
  const cleaned = lastText
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(
      `claude-agent: response was not valid JSON. First 200 chars: ${cleaned.slice(0, 200)}`,
    );
  }

  return args.schema.parse(parsed);
}

/**
 * Best-effort hint of the Zod schema's shape for the prompt. Not strict
 * (Zod doesn't have a built-in JSON-Schema exporter without an extra dep);
 * for our purposes a stringified hint is enough — the model has the actual
 * Zod schema enforced at parse time anyway.
 */
function schemaToHint(schema: z.ZodType<unknown>): unknown {
  // For prompt purposes we just expose the schema's _def at a shallow level.
  // The model will see field names + types via Zod's internal description.
  // If this turns out too opaque for the model, we can swap in zod-to-json-schema later.
  return {
    _zodSchemaName: schema.constructor.name,
    _description:
      "See the function name for expected fields. Output strict JSON matching that schema.",
  };
}
