# Changelog

All notable changes to Thoth. Versions follow the milestone build order;
the deep per-milestone shipping logs live in
[`docs/superpowers/plans/`](docs/superpowers/plans/).

## v2.0.0 — Outbound web search

Multi-agent SLR: a `discoverer → fetcher → screener` chain finds papers across
**OpenAlex**, **arXiv**, and **Exa** (opt-in), acquires the open-access PDFs,
OCRs them, and applies plan-derived inclusion criteria — before V1's
assessor → drafter → critic → cite_check pipeline ever runs.

- Three search modes: `uploaded_only` (V1, default), `outbound` (no uploads
  needed), `hybrid` (uploads + outbound merged via DOI-aware dedup).
- New HITL gate (`APPROVE_DISCOVERY`) + status enum (`DISCOVERING` / `FETCHING`
  / `SCREENING`); per-project tuning (year range, max hits, skip-discovery-gate).
- New MCP tools: `list_discovered_papers`, `get_search_queries`.
- Eval framework gains `discovery_recall` + `screening_precision`.
- Hardening pass: per-call `SearchQuery` audit table; `runLLM` retries transient
  schema-mismatches; assessor per-paper soft-fail; `MAX_INCLUDED_PAPERS` cap;
  bounded OCR retry. Full log:
  [`docs/superpowers/plans/thoth-v2-roadmap.md`](docs/superpowers/plans/thoth-v2-roadmap.md).

## v1.0.1 — Post-release polish

Public `/evals` gains metric explanations + a "How this works" section; eval CI
bounded to a 6-golden smoke set with a per-golden walltime cap; regression
threshold widened to tolerate per-claim LLM-judge variance.

## v1.0.0 — Engineering complete

14 real-paper goldens (`/evals` covers LLM / ML / SE literature), weekly CI eval
workflow with a regression gate, a pinned exemplar review at `/showcase` (no LLM
required — shows cite_check catching fabricated citations), a `DEMO_DISABLED`
kill switch + `/admin/guests` observability, and
[`docs/security-and-privacy.md`](docs/security-and-privacy.md).

## v0.7.x — Authenticated MCP server + brand

Streamable-HTTP MCP at `/api/mcp/mcp`, OAuth 2.1 + PKCE + DCR via Clerk, read-only
tools, SHA-256 audit log + rate limits — published to the
[official MCP Registry](https://registry.modelcontextprotocol.io/v0.1/servers?search=thoth)
as `io.github.ahmedEid1/thoth`. Cost cap on every agent node, 2-phase
commit-then-deliver for HITL gates, the Delapouite ibis identity + papyrus design
tokens, and one-click anonymous demo.

## v0.1 – v0.6 — Foundations

- **M1** workspace foundation (Clerk, Prisma, S3, PDF upload + Trigger.dev parse).
- **M2** summarisation + Langfuse observability.
- **M3** full LangGraph agent loop + HITL gates + Trigger.dev durability.
- **M3.5** LLM-provider abstraction (Vercel AI SDK), $0 cloud deploy, Oracle Cloud
  self-host fallback.
- **M4** critic + `cite_check` post-pass + the eval harness and public `/evals`.
- Claude Agent SDK provider (free programmatic Claude via the Code CLI session),
  Trigger.dev Cloud production deploy, first live end-to-end review on prod.
