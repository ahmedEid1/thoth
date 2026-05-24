# Thoth build roadmap

Build order from M1 through current, with the load-bearing files for each milestone. The full design lives at `docs/superpowers/specs/thoth-design.md`. Release process is in `RELEASING.md`. Current tag: `v0.7.1` (shipped 2026-05-24). Next: M6.

## M1 — Workspace foundation

**Goal:** End-to-end "signed-in user uploads a PDF, watches it parse" loop on a Next.js 16 monolith.

**What shipped:**
- Clerk auth wired through `proxy.ts` (Next 16 middleware location) + webhook-synced `User` rows
- Prisma v7 over Postgres with `Project` + `CorpusItem` models, S3-compatible blob storage (MinIO local, R2 in prod) via a single `lib/object-store.ts` adapter
- Trigger.dev v4 `parse-pdf` task with the Python extension running marker-pdf (later replaced — see v0.5.1)
- docker-compose orchestrating Postgres + MinIO for local dev

**Key files:** `prisma/schema.prisma`, `proxy.ts`, `lib/auth.ts`, `lib/object-store.ts`, `trigger/parse-pdf.ts`, `app/api/corpus/upload/route.ts`

**Tag:** `v0.1.0-m1`

## M2 — Summarisation + Langfuse observability

**Goal:** First AI integration — structured-output paper summaries with a Langfuse trace per call.

**What shipped:**
- The `runLLM` wrapper in `lib/llm.ts` becomes the single LLM call surface — every later agent node goes through it
- Self-hosted Langfuse stack (Postgres + ClickHouse + Redis + MinIO bucket) in docker-compose, with init-env-var bootstrap so dev keys are deterministic
- `summarize-paper` Trigger.dev task + corpus-card UI that subscribes via `useRealtimeRun`

**Key files:** `lib/llm.ts`, `lib/langfuse.ts`, `lib/prompts/summarize-paper.ts`, `trigger/summarize-paper.ts`, `app/api/corpus/[id]/summarize/route.ts`

**Tag:** `v0.2.0-m2`

## M3 — Full agent loop + HITL

**Goal:** Four-node LangGraph agent (planner → retriever → assessor → drafter) with two blocking human approval gates, durable across server restarts.

**What shipped:**
- LangGraph state machine with PostgresSaver checkpointer for resumability; Run / RunStep / HumanCheckpoint / IncludedPaper / ExtractedClaim Prisma models for the UI to query
- `trigger/run-review.ts` durability wrapper: invokes the graph in a loop, detects `interrupt()`, calls `wait.forToken()` to pause, resumes with `Command.resume()` when the UI approves
- `approve_plan` and `approve_papers` HITL gates with rejection-with-reason
- Run workspace page with live status, plan/papers approval cards, and final draft view with inline `[paper_id]` citations

**Key files:** `lib/agent/graph.ts`, `lib/agent/state.ts`, `lib/agent/checkpointer.ts`, `lib/agent/nodes/*.ts`, `trigger/run-review.ts`, `app/projects/[id]/runs/[runId]/page.tsx`

**Tag:** `v0.3.0-m3`

## M3.5a — LLM provider abstraction

**Goal:** Replace the Anthropic-direct LLM layer with a Vercel AI SDK dispatcher so the default provider is free.

**What shipped:**
- `runLLM` becomes a dispatcher that resolves `(provider, tier)` to a concrete AI-SDK model and calls `generateObject` with the existing Zod schemas
- Per-provider adapters under `lib/llm/providers/` (Gemini, Anthropic, OpenAI, Groq at launch); tier mapping in `lib/llm/tiers.ts`
- Prompt builders refactored to provider-neutral `{system, messages}` shape
- Langfuse tracing migrated from the direct JS SDK to the OpenTelemetry exporter (`langfuse-vercel` + `@vercel/otel`)

**Key files:** `lib/llm.ts`, `lib/llm/providers/index.ts`, `lib/llm/tiers.ts`, `lib/prompts/*.ts`, `instrumentation.ts`

**Tag:** `v0.3.5-m3.5a`

## M3.5b — Cloud deploy ($0)

**Goal:** Stand up a public live deploy at zero recurring cost.

**What shipped:**
- Vercel (Next.js host) + Neon (Postgres) + Cloudflare R2 (object store) + Langfuse Cloud (traces) + Trigger.dev Cloud (jobs) + Clerk Cloud (auth)
- Prisma driver adapter `@prisma/adapter-neon` for the serverless runtime
- All five free tiers selected so the monthly bill is `$0`

**Key files:** `lib/db.ts`, `lib/object-store.ts`, `next.config.ts`, `.env.example`

**Tag:** `v0.3.6-m3.5b`

## M4a — Critic + cite_check

**Goal:** Add a quality loop on top of the agent — LLM-as-judge critic + per-citation verification.

**What shipped:**
- LangGraph critic node with a 4-axis rubric (faithfulness, completeness, citation quality, clarity); if `decision === "revise"` and iterations < 2, the graph loops back to drafter with the critique injected into the prompt
- cite_check post-pass that parses every `[paper_id]` reference from the draft and runs one LLM verification call per citation against the cited paper's summary
- `ClaimCheck` table + `Run.faithfulnessScore` + `Run.critiqueScore` feeding the M4b eval harness and the M5 MCP `get_citation_audit` tool

**Key files:** `lib/agent/cite-extract.ts`, `lib/agent/nodes/critic.ts`, `lib/agent/nodes/cite-check.ts`, `lib/prompts/critic.ts`, `lib/prompts/cite-check.ts`, `components/runs/CitationFaithfulnessWidget.tsx`

**Tag:** `v0.4.0-m4a`

## M4b — Eval harness + public `/evals`

**Goal:** A self-contained eval harness with a public dashboard tied to main.

**What shipped:**
- Headless graph runner (`lib/eval/headless-runner.ts`) that drives the M3+M4a agent in-process with auto-approved HITL gates
- 4 metrics (citation recall, citation precision, claim faithfulness, expected-claim coverage) computed against a versioned golden set of YAML questions in `evals/golden/`
- `scripts/run-evals.ts` orchestrator + `scripts/check-eval-regression.ts` CI gate (>10% drop fails)
- Public server-rendered dashboard at `/evals` reading the `EvalRun` table

**Key files:** `lib/eval/headless-runner.ts`, `lib/eval/metrics.ts`, `lib/eval/golden-schema.ts`, `scripts/run-evals.ts`, `scripts/check-eval-regression.ts`, `app/evals/page.tsx`, `evals/golden/*.yaml`

**Tag:** `v0.4.1-m4b`

## v0.4.2 — Claude Agent SDK provider

**Goal:** Free programmatic Claude access for local eval baselines.

**What shipped:**
- Sixth provider via `@anthropic-ai/claude-agent-sdk` that piggybacks on a logged-in Claude Code CLI session (Claude Max subscription) — no API key, no per-token cost
- Strict-output adapter that uses `z.toJSONSchema` to bridge the SDK's text-only output to the dispatcher's structured contract

**Key files:** `lib/llm/providers/claude-agent.ts`, `lib/llm/providers/index.ts`

**Tag:** `v0.4.2-claude-agent-provider`

## v0.5.0 — Trigger.dev Cloud production deploy

**Goal:** Move all background tasks off self-hosted to managed infra.

**What shipped:**
- All three Trigger.dev tasks (`parse-pdf`, `summarize-paper`, `run-review`) on Trigger.dev Cloud
- `syncEnvVars` build extension auto-pushes `.env` to the Trigger.dev prod environment on every deploy
- Lazy-init env / db / object-store + path workarounds to satisfy the managed runtime; Neon WebSocket constructor wired for the worker

**Key files:** `trigger.config.ts`, `lib/db.ts`, `trigger/run-review.ts`

**Tag:** `v0.5.0-trigger-cloud-deploy`

## v0.5.1 — First live end-to-end review

**Goal:** Prove the full pipeline against a real paper on production.

**What shipped:**
- Mistral added as the sixth provider and switched in as the default (most reliable free option for Thoth's per-call Zod schemas)
- Mistral OCR API replaces marker-pdf — eliminates the Python extension and its cold-start timeout
- cite_check made serial + per-citation error tolerant so a single rate-limit hit doesn't fail the whole audit
- First completed real-world run: ReAct paper PDF → planner → retriever → assessor → drafter → critic → cite_check → draft

**Key files:** `lib/pdf-parse.ts`, `lib/llm/providers/mistral.ts`, `lib/agent/nodes/cite-check.ts`, `trigger/parse-pdf.ts`

**Tag:** `v0.5.1-first-live-review`

## M3.5c — Self-host fallback

**Goal:** A one-VM alternative for anyone who doesn't want the cloud-tier dependency chain.

**What shipped:**
- Step-by-step walkthrough deploying Thoth on Oracle Cloud Always Free (4-core ARM Ampere A1 + 24 GB RAM, free forever)
- One VM runs Thoth + Postgres + MinIO + Langfuse behind Caddy with auto-TLS; LLM stays hosted (Mistral free tier or any of the six providers)
- Total recurring cost: $0/month + ~€10/yr domain

**Key files:** `docs/self-host/oracle-cloud-quickstart.md`, `infra/self-host/docker-compose.prod.yml`, `infra/self-host/Caddyfile`, `infra/self-host/Dockerfile`, `infra/self-host/backup-postgres.sh`

**Tag:** `v0.6.0-m3.5c`

## M5 — Authenticated MCP server + Thoth identity + demo flow

**Goal:** Ship a Streamable-HTTP MCP server on the live deploy so claude.ai / Claude Desktop / Cursor / Inspector can connect to a user's reviews, ship the full Thoth visual identity, and add an anonymous demo flow.

**What shipped:**
- MCP endpoint at `/api/mcp/mcp` authenticated via Clerk OAuth 2.1 + PKCE + Dynamic Client Registration (resource-server pattern, RFC 8707) — no manual token paste
- Three read-only, tenant-scoped tools: `list_reviews`, `get_review_draft`, `get_citation_audit`
- `McpCall` audit table with SHA-256 input hash (raw input never stored) + DB-backed sliding-window rate limit per `(userId, toolName)`
- Published to the official MCP Registry as `io.github.ahmedEid1/thoth` via `mcp-publisher` (`server.json` manifest); verified via the public registry API
- Thoth visual identity: Delapouite ibis (CC BY 3.0, game-icons.net) across favicon / header / decorative hero / OG mark; Fraunces + Geist type pairing; OKLCH papyrus + lapis-lazuli palette
- Anonymous demo flow: `/api/demo/start` provisions a Clerk guest user with an `@example.com` email, hands off a one-time ticket via `/demo/handoff`, and signs the visitor into an empty dashboard so they can build their own review
- `RELEASING.md` checklist with the manual MCP smoke (Inspector full OAuth flow + Claude Desktop install + audit log spot-check)

**Key files:** `app/api/mcp/[transport]/route.ts`, `lib/mcp/auth.ts`, `lib/mcp/audit.ts`, `lib/mcp/rate-limit.ts`, `lib/mcp/tools/*.ts`, `app/.well-known/oauth-protected-resource/mcp/route.ts`, `app/api/demo/start/route.ts`, `app/demo/handoff/page.tsx`, `components/home/demo-cta-button.tsx`, `server.json`, `tests/e2e/mcp-smoke.spec.ts`

**Tag:** `v0.7.0-m5`

## v0.7.1 — Post-M5 hardening + correctness

**Goal:** Close every finding from a 10-reviewer adversarial pass (9 specialised Claude reviewers + 2 Codex runs) and harden the agent + HITL surfaces for production.

**What shipped:**
- Per-run token budget enforced before every node (planner / retriever / assessor / drafter / critic / cite-check) and inside the per-item loops in assessor / retriever / cite-check — runaway agent runs can't spike the bill
- Two-phase commit-then-deliver for HITL gates: Phase 1 atomically transitions the checkpoint inside a Postgres advisory lock; Phase 2 reads the persisted `decisionPayload` and calls Trigger.dev's idempotent `wait.completeToken`. Decisions can't diverge from what the agent saw even under transaction rollback
- Cron outbox (`trigger/checkpoint-delivery-outbox.ts`, every minute) plus a UI "retry now" affordance recover any checkpoint where Phase 2 failed mid-delivery
- Hardened anonymous demo: per-IP sliding-window rate limit (5/hour, salted-hash storage), production same-origin guard via `new URL().origin` exact match, reverse-order compensation on partial failure, sanitised `x-forwarded-proto`. Cleanup cron deletes guests older than 24h
- MCP spec-2025-11-25 `ToolAnnotations` + `serverInfo` icons / title / description / websiteUrl on every tool
- Security headers on every non-API route (X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy, HSTS in production)
- Accessibility pass: skip-to-content link, `id="main"` on every page, stone-on-papyrus contrast bumped to 6.8:1, full-opacity focus rings on the gold CTA
- `trigger.config.ts` env-sync replaced with an armed switch (`TRIGGER_DEPLOY_CONFIRM=1`) + 16-key explicit allowlist so a developer's local `.env` can't silently overwrite production worker env
- Build script extended to `prisma generate && prisma migrate deploy && next build` so the schema on Neon stays in lockstep with the deployed client

**Key files:** `lib/agent/cost-cap.ts`, `lib/agent/checkpoint-delivery.ts`, `trigger/checkpoint-delivery-outbox.ts`, `app/api/runs/[id]/checkpoints/[cpId]/retry-delivery/route.ts`, `components/runs/stranded-checkpoint-card.tsx`, `lib/demo/rate-limit.ts`, `trigger/guest-cleanup.ts`, `app/demo/handoff/page.tsx`, `next.config.ts`, `trigger.config.ts`

**Tag:** `v0.7.1`

## M6 — Public launch (next)

**Goal:** Make Thoth's quality story legible to non-builders so the public launch lands.

**What will ship:**
- 30-question golden eval set drawn from real published SLRs (replacing the 10-question synthetic v1)
- Recruiter 1-pager: single-page artefact pointing at the live app, public evals, MCP demo, and registry listing
- Public launch surface: HN / LinkedIn / Twitter posts timed to the recruiter pager going live

## Standards across the build

- TDD throughout: Vitest for unit + integration, Playwright for the e2e smoke against the live deploy. `pnpm vitest run` ran green before every tag; `tests/e2e/mcp-smoke.spec.ts` runs against `https://thoth-slr.vercel.app`.
- `pnpm tsc --noEmit` and `pnpm lint` clean on every commit. CI green is a tag prerequisite (`RELEASING.md`).
- `$0/month` deploy budget enforced through free-tier selection on every infra layer — Vercel + Neon + R2 + Langfuse Cloud + Trigger.dev Cloud + Clerk Cloud, with Mistral free-tier LLM as the default provider.
- Cost cap on every agent run via `lib/agent/cost-cap.ts` (default 250k tokens per run) so a runaway loop can't spike the bill.
- Every LLM call goes through `lib/llm.ts` → Vercel AI SDK → Zod-validated structured output → Langfuse OTel span. No code path bypasses the wrapper.
- Specs first: every milestone has a design doc in `docs/superpowers/specs/` before any code. This file is the only surviving plan; the per-milestone TDD plans were consumed once the work shipped.
