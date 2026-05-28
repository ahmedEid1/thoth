# Architecture

How Thoth is built — the agent pipeline, the stack, and the local/test workflow.
For the public-facing overview, see the [README](../README.md); for the full
design rationale see
[`docs/superpowers/specs/thoth-design.md`](superpowers/specs/thoth-design.md).

## The agent pipeline

Thoth is a [LangGraph](https://langchain-ai.github.io/langgraphjs/) `StateGraph`
driven by a [Trigger.dev](https://trigger.dev) v4 worker, with human-in-the-loop
(HITL) gates that pause the graph (`interrupt()`) and resume on approval
(`Command({ resume })`), durable across worker restarts.

```
planner → plan_gate ─┬─ (uploaded_only) ───────────────→ retriever ─┐
                     │                                               │
                     └─ (outbound / hybrid) → discoverer →           │
                          discovery_gate → fetcher → screener →      │
                          papers_gate ───────────────────────────────┤
                                                                      ↓
                              assessor → drafter → critic ⇄ (≤2 loops)
                                                      ↓
                                                  cite_check → COMPLETED
```

- **planner** — turns the research question into a PICOC plan + inclusion criteria.
- **discoverer** *(v2)* — LLM-generates search queries, fans out across OpenAlex /
  arXiv / Exa, dedups by DOI/arXiv id, persists a per-call `SearchQuery` audit row.
- **fetcher** *(v2)* — downloads open-access PDFs (SSRF-guarded, size-capped) +
  OCRs them (Mistral OCR, bounded retry on transient errors).
- **screener** *(v2)* — votes include/exclude per discovered paper against the plan.
- **assessor** — extracts structured claims from each included paper (per-paper
  soft-fail; capped at `MAX_INCLUDED_PAPERS`).
- **drafter / critic** — drafts the review, then an LLM-as-judge critic loop
  (≤2 iterations) tightens it.
- **cite_check** — the differentiator: every `[paper_id]` citation in the draft is
  verified against the cited paper; each claim gets a supported / unsupported /
  unclear verdict, written to the `ClaimCheck` table and surfaced in the UI + the
  `get_citation_audit` MCP tool.

Reliability: a per-run token **cost cap** gates every node; HITL gates use a
2-phase commit-then-deliver (Postgres advisory lock + Trigger.dev idempotent
`wait.completeToken`) for exactly-once semantics; `MAX_SEGMENTS` bounds resumes.

## Stack

| Layer | Choice |
|---|---|
| App | Next.js 16 + TypeScript (strict) |
| UI | Tailwind v4 + shadcn/ui (`@base-ui/react`) + Lucide |
| Auth | Clerk (web sessions + OAuth 2.1 + DCR for MCP) |
| DB | Postgres 17 + Prisma v7 (driver adapter `@prisma/adapter-neon`) |
| Object store | S3-compatible (Cloudflare R2 in prod, MinIO local) |
| Background jobs | Trigger.dev v4 |
| Agent framework | LangGraph (TypeScript) |
| LLM dispatch | Vercel AI SDK over 6 providers — see [llm-providers.md](llm-providers.md) |
| PDF parsing | Mistral OCR API |
| Observability | Langfuse Cloud (OpenTelemetry via `langfuse-vercel` + `@vercel/otel`) |
| MCP server | `mcp-handler` + `@clerk/mcp-tools` + `@modelcontextprotocol/sdk` |
| Tests | Vitest (unit/integration) + Playwright (live e2e) |
| Deploy | Vercel + Neon (Frankfurt) + Cloudflare R2 + Langfuse + Trigger.dev — all free tiers |
| Self-host | docker-compose on Oracle Cloud Always Free — [self-host/](self-host/oracle-cloud-quickstart.md) |

## The v2 outbound flow (end to end)

1. **New project → Outbound search.** Default providers OpenAlex + arXiv (free, no
   key); add Exa if `EXA_API_KEY` is set. Optionally set a year range + max hits
   per run (default 50, ceiling 100).
2. **Start review** — no uploads needed; the discoverer builds the corpus.
3. **Approve the plan**, then the **Discovery approval card**: the generated query
   list + per-row checkboxes over discovered papers. Uncheck off-topic, approve.
4. The fetcher OCRs the kept PDFs; the screener votes include/exclude; the
   **Papers approval card** shows the include set. Uncheck false positives, approve.
5. assessor → drafter → critic → cite_check run (as in v1). The draft renders as
   Markdown with a resolved **References** section, and three downloads: **`.md`**
   (draft + provenance header + references), **`.bib`** (BibTeX keyed by the same
   `[paper_id]` the draft cites), and **`.json`** (the structured cite_check audit).

Power users can tick **Skip discovery approval** at create time (cost-cap + max-hits
ceiling still apply). MCP clients can inspect any run after the fact with
`list_discovered_papers` + `get_search_queries`.

## Tests & verification

```bash
pnpm verify              # typecheck + lint + test — the pre-tag check (RELEASING.md)
pnpm test                # unit/integration (Vitest)
pnpm test:e2e:live       # 16 e2e vs the live deploy: MCP-transport + real-browser + authed walkthroughs
pnpm test:e2e:live:full  # 6 full agent-run pipeline tests (slow — exercises the free tier end to end)
pnpm tsx scripts/verify-mcp-audit.ts   # spot-check the McpCall audit log
```

Authenticated e2e specs need `E2E_EMAIL` + `CLERK_SECRET_KEY` in `.env` / `.env.test`;
they auto-skip cleanly when absent. The eval CI workflow
(`.github/workflows/evals.yml`) runs weekly with an advisory regression check.
