# LLM providers

Thoth dispatches every model call through the [Vercel AI SDK](https://ai-sdk.dev),
so you can swap providers with a single env var — `LLM_PROVIDER=<name>` in `.env`.
Each prompt picks a tier (`smart` / `fast`); the dispatcher maps the tier to the
equivalent model per provider (see [`lib/llm/tiers.ts`](../lib/llm/tiers.ts)).

| Provider | Free? | Setup | Env var |
|---|---|---|---|
| **Mistral** (default) | ✅ Free Experiment tier | https://console.mistral.ai (30s) | `MISTRAL_API_KEY` |
| Groq | ✅ Free | https://console.groq.com | `GROQ_API_KEY` |
| Gemini | ✅ Free | https://aistudio.google.com | `GOOGLE_GENERATIVE_AI_API_KEY` |
| Anthropic | Paid | https://console.anthropic.com | `ANTHROPIC_API_KEY` |
| OpenAI | Paid | https://platform.openai.com | `OPENAI_API_KEY` |
| Claude Agent SDK | ✅ Free with Claude Max | `claude login` (Claude Code CLI) | (CLI session — no key) |

**Why Mistral is the default:** the Free Experiment tier covers Thoth's workload,
the data stays in EU jurisdiction, and `mistral-large-latest` produces reliable
Zod-validated structured output across every node in the agent pipeline.

**Resilience knobs:**
- `LLM_FALLBACK_PROVIDER` — one-shot fallback to a second provider when the primary
  throws (e.g. Mistral 5xx → Groq).
- `runLLM` retries a transient `NoObjectGeneratedError` (schema mismatch) on the
  same provider before falling back — important on free tiers.

**`claude-agent` (Claude Max) for evals:** set `LLM_PROVIDER=claude-agent` to route
calls through the local Claude Code CLI session via
[`@anthropic-ai/claude-agent-sdk`](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk)
— no API key, no per-token cost, no rate limits. Handy for running the eval golden
set locally when the free-tier API quota is exhausted. Token usage is estimated
from string length so the per-run cost cap still engages.

The free-tier API providers (Mistral/Groq/Gemini) are rate-limited, so the heavy
outbound eval goldens are kept out of the weekly cron smoke set and run manually;
set `EVAL_SEARCH_MAX_HITS` to scale the discovered-paper set up on a paid/higher-RPS
provider.
