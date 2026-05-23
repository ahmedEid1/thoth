# M5 — Authenticated MCP Server — Design Spec

**Status:** Approved for implementation planning
**Date:** 2026-05-24
**Author:** Ahmed Hobeishy (with Claude)
**Target ship:** v0.7.0-m5 (~1–1.5 days of focused work)
**Parent spec:** `2026-05-22-atlas-design.md` §7 (M5 row in §12)

---

## 1. Purpose

Atlas's M5 ships an authenticated, hosted MCP server that lets external AI clients (Claude Desktop, Cursor, MCP Inspector) connect to a user's Atlas reviews over OAuth 2.1 + Streamable HTTP, with every call audit-logged.

This milestone exists to serve two outcomes simultaneously:
1. **Useful artifact** — a researcher can connect Claude Desktop to their own Atlas account and pull review drafts + per-claim citation audits into any conversation.
2. **Portfolio artifact** — a quotable CV bullet. Research at design time showed 8,000+ MCP servers ship with no auth; a secure, audited MCP server with a working OAuth 2.1 flow is the open niche.

The two outcomes share one implementation. The audience priority (locked during brainstorming) is **recruiter-demo first**: a hiring manager can paste one URL into Claude Desktop, complete the OAuth flow in their browser, and call a tool that returns real data — all in under two minutes, with zero local configuration.

---

## 2. Scope

### In scope for M5

- A remote MCP server hosted on Atlas's existing Vercel deploy at `/api/mcp`
- Streamable HTTP transport (the current MCP spec; replaces deprecated SSE)
- OAuth 2.1 with PKCE and Dynamic Client Registration, with Clerk as the OAuth Authorization Server and Atlas's `/api/mcp` as the Resource Server (per RFC 8707 + OAuth 2.0 Protected Resource Metadata)
- Three read-only tools, all scoped to the authenticated user:
  - `list_reviews` — list the user's review runs with status and scores
  - `get_review_draft` — fetch the markdown draft of a completed review
  - `get_citation_audit` — fetch the per-claim cite_check verdict report
- DB-backed audit log of every call (`McpCall` table)
- DB-backed per-user sliding-window rate limits
- Side-effects manifest documented in README and in each tool's `description` field
- MCP registry submission (PR to `modelcontextprotocol/registry`)
- README "Connect via MCP" section with embedded screencast/GIF
- Reference docs at `docs/mcp/tools.md` and `docs/mcp/security.md`
- Pre-tag smoke checklist (`RELEASING.md`)
- Playwright E2E smoke test against the live deploy

### Explicitly out of scope for M5 (deferred to v1.1)

- `search_corpus` tool — requires pgvector; bigger lift, separate work
- `summarize_paper` tool exposed via MCP — would put LLM cost on the call path, exposing free-tier limits to recruiter traffic
- Any write tool (`start_review`, `cancel_run`, `delete_review`)
- Stdio transport / `@atlas/mcp-server` npm package — modern Claude Desktop supports remote MCP, so stdio is duplicate work
- Admin UI for the audit log (data captured, no UI)
- Anomaly-detection cron over McpCall
- Per-IP rate limits (Clerk-authenticated identity is sufficient)
- A "global" rate limit across all users

### Differences from the original spec (`2026-05-22-atlas-design.md` §7)

The original spec called for a separate npm package, stdio + SSE transports, and a wider 6-tool surface. The narrower scope above reflects three updates since the original was written:

1. **MCP spec evolution.** SSE was deprecated in favor of Streamable HTTP. Modern remote MCP clients (Claude Desktop included) speak Streamable HTTP directly; stdio is no longer required for a recruiter to install Atlas.
2. **Clerk's first-class MCP support.** `@clerk/mcp-tools` ships dedicated helpers for the Protected Resource Metadata pattern. The auth piece that originally represented most of M5's risk is now a configuration job, not an engineering job.
3. **Recruiter-demo first audience.** A 3-tool surface ships in ~1.5 days; the original 6 would take ~3–4 days and route LLM cost onto recruiter traffic with no commensurate hiring upside.

---

## 3. Architecture

### 3.1 Component map

```
┌─────────────────────────────────────────────────────────────────┐
│           Claude Desktop / Cursor / MCP Inspector               │
│   (user pastes one URL: https://atlas-...vercel.app/api/mcp)    │
└────┬────────────────────────────────────────────────────────────┘
     │ 1. POST /api/mcp (no token) → 401 + WWW-Authenticate
     │ 2. GET /.well-known/oauth-protected-resource → auth server URL
     │ 3. Redirect to Clerk → user signs in + consents
     │ 4. Clerk issues JWT
     │ 5. POST /api/mcp (Bearer JWT) → JSON-RPC over Streamable HTTP
     ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Atlas Next.js app                          │
│                                                                  │
│  app/.well-known/oauth-protected-resource/route.ts  (PRM)       │
│  app/.well-known/oauth-authorization-server/route.ts (proxy)    │
│  app/api/mcp/[transport]/route.ts                               │
│    └── mcp-handler from Vercel (Streamable HTTP)                │
│        ├── auth: verify Clerk JWT, extract user_id              │
│        ├── tools: list_reviews / get_review_draft /             │
│        │          get_citation_audit                             │
│        └── audit: write McpCall row per invocation              │
│                                                                  │
│  lib/mcp/                                                        │
│    ├── tools/index.ts    ← tool registry (Zod schemas)          │
│    │   ├── list-reviews.ts                                       │
│    │   ├── get-review-draft.ts                                   │
│    │   └── get-citation-audit.ts                                 │
│    ├── auth.ts           ← Clerk JWT verification               │
│    ├── audit.ts          ← McpCall logger                       │
│    ├── handler.ts        ← mcpTool wrapper (rate + audit)       │
│    └── rate-limit.ts     ← DB-backed sliding window             │
│                                                                  │
│  prisma/schema.prisma                                            │
│    └── + model McpCall (user_id, tool, input_hash, ...)         │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Key architectural choices

- **In-app, not a separate package.** New route handlers inside the existing Next.js app. Zero new deploy units, zero new infra.
- **Streamable HTTP only.** No stdio. Recruiter pastes one URL into Claude Desktop and is done.
- **Clerk as Authorization Server, Atlas as Resource Server.** Per the post-June-2025 MCP auth spec. Atlas validates JWTs; Clerk owns login + DCR + consent screens.
- **DB-backed rate limiting and audit.** No Redis, no Upstash, no new dependencies. The `McpCall` table indexes support both with cheap queries.
- **Read-only tools that hit no LLM at call time.** Every tool is a DB read of already-computed data. Recruiter spam cannot exhaust Atlas's free-tier LLM budgets.
- **Authz by construction.** No tool ever accepts `userId` as input — it always comes from the validated JWT. Cross-user data leakage is impossible at the type level.

### 3.3 Architecture invariants (extends `2026-05-22-atlas-design.md` §4.3)

In addition to the global Atlas invariants:

1. **No raw user input is logged.** `McpCall.inputHash` stores a SHA-256 of canonical-JSON; the input payload is never persisted.
2. **404, not 403, for unowned resources.** Prevents existence-probing of other users' data.
3. **Audit write failure is non-fatal.** If `logMcpCall` throws, the request still succeeds; the failure is emitted as a Langfuse span for later investigation.
4. **Every tool's `description` field declares its side-effect class.** Read-only, writes, external-network, costs-money — visible to the LLM that decides whether to call it.

---

## 4. Auth flow

The full OAuth 2.1 dance, with Clerk doing the heavy lifting.

```
Claude Desktop                Atlas /api/mcp           Clerk
     │                              │                    │
     │ 1. POST /api/mcp (no token)  │                    │
     ├─────────────────────────────►│                    │
     │ 401 + WWW-Authenticate:      │                    │
     │   Bearer resource_metadata=  │                    │
     │   "/.well-known/oauth-       │                    │
     │    protected-resource"       │                    │
     │◄─────────────────────────────┤                    │
     │                              │                    │
     │ 2. GET /.well-known/         │                    │
     │    oauth-protected-resource  │                    │
     ├─────────────────────────────►│                    │
     │ { authorization_servers: [   │                    │
     │     "https://atlas.../       │                    │
     │     .well-known/oauth-       │                    │
     │     authorization-server" ]} │                    │
     │◄─────────────────────────────┤                    │
     │                              │                    │
     │ 3. GET /.well-known/         │                    │
     │    oauth-authorization-      │                    │
     │    server                    │                    │
     ├─────────────────────────────►│                    │
     │  (handler proxies Clerk's    │ GET clerk.com/     │
     │   metadata + advertises      ├───────────────────►│
     │   registration_endpoint,     │ { auth, token,     │
     │   authorization_endpoint)    │   registration,    │
     │                              │   jwks_uri, ... }  │
     │ {discovery doc}              │◄───────────────────┤
     │◄─────────────────────────────┤                    │
     │                              │                    │
     │ 4. POST registration_        │                    │
     │    endpoint (DCR per RFC     │                    │
     │    7591) — Claude self-      │                    │
     │    registers as a client     │                    │
     ├──────────────────────────────────────────────────►│
     │ { client_id }                │                    │
     │◄──────────────────────────────────────────────────┤
     │                              │                    │
     │ 5. Browser opens Clerk       │                    │
     │    consent screen, user      │                    │
     │    signs in, approves        │                    │
     ├══════════════════════════════════════════════════►│
     │ authorization_code (PKCE)    │                    │
     │◄══════════════════════════════════════════════════┤
     │                              │                    │
     │ 6. Exchange code → JWT       │                    │
     ├──────────────────────────────────────────────────►│
     │ { access_token: JWT }        │                    │
     │◄──────────────────────────────────────────────────┤
     │                              │                    │
     │ 7. POST /api/mcp             │                    │
     │    Authorization: Bearer JWT │                    │
     │    {"jsonrpc": "2.0",        │                    │
     │     "method": "tools/list"}  │                    │
     ├─────────────────────────────►│                    │
     │                              │ verify JWT via     │
     │                              │ Clerk JWKS         │
     │                              │ → user.id          │
     │ tool list                    │                    │
     │◄─────────────────────────────┤                    │
```

### Concrete pieces Atlas owns

| File | Lines | Purpose |
|---|---|---|
| `app/.well-known/oauth-protected-resource/route.ts` | ~15 | `protectedResourceHandlerClerk()` from `@clerk/mcp-tools/next` |
| `app/.well-known/oauth-authorization-server/route.ts` | ~15 | `authServerMetadataHandlerClerk()` from same |
| `lib/mcp/auth.ts` | ~40 | Wraps Clerk's `verifyToken`, returns `{ userId }` or 401 with the correct `WWW-Authenticate` header |
| Clerk Dashboard toggle | n/a | Enable **Dynamic Client Registration** in OAuth Applications (one-time) |

### Risk: forgetting the Clerk DCR toggle

Clerk's DCR feature requires the Dashboard toggle. If it's off, Claude Desktop install fails with a confusing error. Mitigation: the pre-tag smoke checklist (`RELEASING.md`) includes a "verify DCR is on" step and a fresh-install Claude Desktop test.

---

## 5. Tool surface

Three tools. All read-only. All scoped to the JWT's `userId`. All return in <500ms (no LLM calls on the call path).

### 5.1 `list_reviews`

```ts
input: z.object({})

output: z.object({
  reviews: z.array(z.object({
    id: z.string(),                    // Run.id
    projectId: z.string(),
    projectName: z.string(),
    researchQuestion: z.string(),
    status: z.enum(["RUNNING","AWAITING_HUMAN","COMPLETED","FAILED","REJECTED"]),
    createdAt: z.string().datetime(),
    completedAt: z.string().datetime().nullable(),
    critiqueScore: z.number().nullable(),       // 0..1, from M4a critic
    faithfulnessScore: z.number().nullable(),   // 0..1, from cite_check
    claimCount: z.number().int(),
    citationCount: z.number().int(),
  })),
})
```

The entry tool. Returns rows for the authenticated user only. Demoable on its own.

### 5.2 `get_review_draft`

```ts
input: z.object({
  reviewId: z.string(),
})

output: z.object({
  reviewId: z.string(),
  researchQuestion: z.string(),
  status: z.string(),
  draftMarkdown: z.string(),                    // the full review.md
  critiqueScore: z.number().nullable(),
  faithfulnessScore: z.number().nullable(),
  criticIterations: z.number().int(),
  generatedAt: z.string().datetime(),
})
```

Returns the actual SLR output. Recruiter sees the Atlas-produced markdown rendered inside Claude Desktop. 404 (not 403) if the `reviewId` isn't owned by the authenticated user. 404 if the run hasn't produced a draft yet (status != COMPLETED).

### 5.3 `get_citation_audit`

```ts
input: z.object({
  reviewId: z.string(),
})

output: z.object({
  reviewId: z.string(),
  faithfulnessScore: z.number().nullable(),     // aggregate
  totalClaims: z.number().int(),
  supportedCount: z.number().int(),
  unsupportedCount: z.number().int(),
  unclearCount: z.number().int(),
  claims: z.array(z.object({
    claimText: z.string(),                      // ExtractedClaim.text
    citedPaperId: z.string(),
    verdict: z.enum(["supported","unsupported","unclear"]),
    reason: z.string(),                         // from ClaimCheck
    supportingSpan: z.string().nullable(),      // quoted text from the paper
  })),
})
```

The differentiator tool. Surfaces Atlas's cite_check audit as a structured MCP response. Same authz rules as `get_review_draft`.

### 5.4 Side-effects manifest

Goes in README and in each tool's `description` field (the field the LLM reads to decide whether to call it).

| Tool | Side effect | Cost | LLM call at call time |
|---|---|---|---|
| `list_reviews` | read-only | $0 | no |
| `get_review_draft` | read-only | $0 | no |
| `get_citation_audit` | read-only | $0 | no |

---

## 6. Data model

One new Prisma model. No changes to existing models.

```prisma
// prisma/schema.prisma — append

model McpCall {
  id          String        @id @default(cuid())
  userId      String                          // Clerk user id (no FK — Clerk owns it)
  toolName    String                          // "list_reviews" | "get_review_draft" | "get_citation_audit"
  inputHash   String                          // SHA-256 of canonical-JSON(input) — never raw input
  reviewId    String?                         // when input contains a reviewId, copied for query convenience
  status      McpCallStatus
  errorCode   String?                         // "invalid_input" | "unauthorized" | "not_found" | "rate_limited" | "internal" | null
  latencyMs   Int
  createdAt   DateTime      @default(now())

  @@index([userId, createdAt])
  @@index([userId, toolName, createdAt])      // for per-user-per-tool rate-limit lookups
}

enum McpCallStatus {
  OK
  ERROR
}
```

### Design choices

- **`inputHash`, not raw input.** Inputs may contain user content; we don't log it in plaintext. SHA-256 of canonical JSON gives per-(user, tool, input) frequency analysis without storing payloads.
- **`reviewId` materialised separately.** When input has one, copied to a top-level column so queries don't have to parse JSON.
- **No FK to `User`/`Run`.** Clerk owns users (no local User row guaranteed). Preserving call history when a review is deleted is correct audit-log behavior.
- **`status` + `errorCode`, not `success: boolean`.** Discriminates 401 / 404 / 429 / 500 for abuse detection.
- **No output stored.** Reconstructable from input + DB state; logging doubles storage for zero forensic value.

### Audit-log write path

`lib/mcp/audit.ts` exports `logMcpCall({ userId, toolName, input, status, errorCode, latencyMs })`. Called from the `mcpTool` wrapper after every invocation, success or failure. Audit-write failure is wrapped in try/catch, emitted as a Langfuse span, and never fails the request.

---

## 7. Error handling, rate limiting, abuse protection

Defense in depth, because the endpoint is publicly callable once a user signs up.

### 7.1 Error handling

Every tool handler is wrapped in `lib/mcp/handler.ts → mcpTool(...)`:

```ts
export function mcpTool<I, O>(opts: {
  name: string;
  inputSchema: ZodSchema<I>;
  outputSchema: ZodSchema<O>;
  handler: (input: I, ctx: { userId: string }) => Promise<O>;
}) {
  return async (rawInput: unknown, ctx) => {
    const start = Date.now();
    let status: "OK" | "ERROR" = "OK";
    let errorCode: string | undefined;
    try {
      const input = opts.inputSchema.parse(rawInput);
      const output = await opts.handler(input, ctx);
      return opts.outputSchema.parse(output);
    } catch (err) {
      status = "ERROR";
      errorCode = classifyError(err);
      throw toMcpError(err, errorCode);
    } finally {
      await logMcpCall({ userId: ctx.userId, toolName: opts.name, input: rawInput,
                        status, errorCode, latencyMs: Date.now() - start });
    }
  };
}
```

Error-message hygiene: internal errors return a generic "internal error, see request id <id>" — never the raw exception. The request id is the `McpCall.id`.

### 7.2 Authorization

- **404 instead of 403** when a user requests a `reviewId` they don't own.
- **Tool-level authz is implicit**: every DB query has `WHERE userId = ctx.userId` baked into helpers. No handler ever accepts `userId` as input.

### 7.3 Rate limiting

DB-backed sliding window. No Redis. The `McpCall(userId, toolName, createdAt)` index makes this cheap.

| Scope | Limit | Window | Response at limit |
|---|---|---|---|
| Per user, all tools | 60 calls | 60s | 429 + `Retry-After: 60` |
| Per user, per tool | 30 calls | 60s | 429 + `Retry-After: 60` |
| Per user, daily | 1000 calls | 24h | 429 + `Retry-After: <seconds-to-midnight-UTC>` |

Rate-limited responses are themselves written to `McpCall` (with `status=ERROR`, `errorCode=rate_limited`), so they count toward the user's window — preventing a spam-the-limit loophole. Limits are deliberately conservative for v1; raise if real users hit them.

### 7.4 Abuse protection beyond rate limits

1. **Clerk DCR client registrations are logged** by Clerk — Atlas can review the Dashboard if traffic looks odd.
2. **`McpCall.errorCode` analytics** — captured in v1, nightly cron over them deferred to v1.1.
3. **Neon free-tier ceiling** — 191 compute hours/month + 0.5 GB storage. DB-only reads at <500ms cannot reach either limit at any realistic abuse rate.

### 7.5 What's deliberately not done

- No per-IP limit (Clerk identity already binds calls; IP adds noise).
- No CAPTCHA (Clerk sign-up flow handles bot signups).
- No request-body size limit (inputs are bounded by their Zod schemas).
- No global rate limit across all users (no evidence of need; adds latency for no benefit).

---

## 8. Testing strategy

Three tiers, mirroring Atlas's existing M3/M4 testing pattern.

### 8.1 Tier 1 — Vitest unit (mocked Clerk + Prisma)

Fast, run on every push. No real network.

| Test file | Coverage |
|---|---|
| `lib/mcp/auth.test.ts` | Valid JWT → userId · expired → 401 · wrong issuer → 401 · malformed → 401 · missing → 401 with correct `WWW-Authenticate` |
| `lib/mcp/audit.test.ts` | `logMcpCall` writes correct row · `inputHash` is SHA-256 of canonical JSON · `reviewId` extracted · log failure does NOT throw |
| `lib/mcp/tools/list-reviews.test.ts` | Only caller's runs · empty for new user · COMPLETED runs include scores · output matches schema |
| `lib/mcp/tools/get-review-draft.test.ts` | Draft returned for owned reviewId · 404 for someone-else's · 404 for nonexistent · 404 for in-progress |
| `lib/mcp/tools/get-citation-audit.test.ts` | Claims returned with verdicts · aggregates match per-claim counts · 404 for unowned · empty array when cite_check hasn't run |
| `lib/mcp/handler.test.ts` | Wrapper logs OK on success · logs ERROR on throw · error classification correct |
| `lib/mcp/rate-limit.test.ts` | Per-minute cap triggers · daily cap triggers · errors count toward limit · `Retry-After` correct |

Target: ~30 new test cases across Tier 1 + Tier 2 combined. Current suite: 161. New total: ~191.

### 8.2 Tier 2 — Route-handler integration

In-process Next.js route handler tests:

| Test file | Coverage |
|---|---|
| `app/.well-known/oauth-protected-resource/route.test.ts` | Valid PRM document · CORS headers · cacheable |
| `app/.well-known/oauth-authorization-server/route.test.ts` | Proxies Clerk metadata correctly · `registration_endpoint` present |
| `app/api/mcp/[transport]/route.test.ts` | No auth → 401 with correct header · valid JWT + `tools/list` returns 3 tools · `tools/call list_reviews` returns rows · invalid tool name → JSON-RPC -32601 |

### 8.3 Tier 3 — Playwright E2E smoke

One test (`e2e/mcp-smoke.spec.ts`) against the live deploy. Uses existing Clerk test-user pattern from `@clerk/testing`. Asserts: POST `/api/mcp` with valid JWT, `tools/list` returns the 3 tool names.

### 8.4 Manual pre-tag smoke (`RELEASING.md`)

Run once before tagging `v0.7.0-m5`:

- MCP Inspector → paste prod URL → walk full OAuth flow → call each tool → verify response shape
- Claude Desktop → add remote MCP → sign in via Clerk → ask "list my Atlas reviews" → see real data
- Confirm `McpCall` rows appear in Neon
- Verify DCR toggle is on in Clerk Dashboard

### 8.5 What's not tested

- **No load testing.** Rate limits are conservative; abuse risk is bounded by Neon's free tier.
- **No JSON-RPC parser fuzzing.** `mcp-handler` is the source of truth; trusted as official.
- **No real-Clerk CI tests.** Clerk's test-mode JWT is sufficient; the Playwright smoke covers the prod path.
- **No PII redaction tests.** Raw inputs never leave memory; nothing to redact.

### 8.6 CI integration

- Vitest tiers 1+2 on every push (already wired)
- Playwright smoke on the nightly `evals` cron + on-demand via `gh workflow run` (already wired)
- Manual smoke is in `RELEASING.md` (new file in M5)

---

## 9. Deliverables

### Code (new files in `master`)

1. `prisma/schema.prisma` — `McpCall` model + `McpCallStatus` enum
2. Prisma migration for the above
3. `app/.well-known/oauth-protected-resource/route.ts`
4. `app/.well-known/oauth-authorization-server/route.ts`
5. `app/api/mcp/[transport]/route.ts`
6. `lib/mcp/auth.ts`
7. `lib/mcp/audit.ts`
8. `lib/mcp/handler.ts`
9. `lib/mcp/rate-limit.ts`
10. `lib/mcp/tools/list-reviews.ts`
11. `lib/mcp/tools/get-review-draft.ts`
12. `lib/mcp/tools/get-citation-audit.ts`
13. `lib/mcp/tools/index.ts` — registry
14. ~7 vitest test files (Tier 1)
15. ~3 vitest test files (Tier 2)
16. `e2e/mcp-smoke.spec.ts`
17. `RELEASING.md` — pre-tag smoke checklist
18. `package.json` — `+ @clerk/mcp-tools`, `+ mcp-handler`. Version bump 0.6.0 → 0.7.0.

### Docs

19. `README.md` — new "Connect via MCP" section with copy-paste URL and embedded GIF
20. `docs/mcp/tools.md` — per-tool reference (inputs, outputs, side-effects, example calls)
21. `docs/mcp/security.md` — auth model, rate limits, audit log story
22. README changelog — v0.7.0-m5 entry
23. Memory update — `atlas_execution_state.md` marks M5 shipped with release URL

### External surfaces

24. **MCP registry submission** — PR to `modelcontextprotocol/registry` with `atlas-research` entry
25. **Clerk Dashboard config** — enable Dynamic Client Registration on OAuth Applications (one-time)
26. **GitHub release** — `v0.7.0-m5` tag with release notes
27. **30–60s screencast/GIF** — install flow → OAuth → first tool call — embedded in README

---

## 10. Success criteria (M5 = done)

Every item below must be true before tagging `v0.7.0-m5`:

- [ ] All ~30 new vitest tests passing; full suite stays green
- [ ] `pnpm tsc --noEmit` clean, `pnpm lint` clean
- [ ] Playwright MCP smoke passes against the live deploy
- [ ] Manual smoke verified on a fresh Claude Desktop install (per `RELEASING.md`)
- [ ] `McpCall` rows visible in Neon after manual smoke
- [ ] DCR enabled on the Clerk OAuth Applications page (verified)
- [ ] README has the "Connect via MCP" section with GIF embedded and the prod URL
- [ ] `docs/mcp/tools.md` + `docs/mcp/security.md` written
- [ ] Registry PR opened (merge timing depends on maintainers; opening counts as shipped)
- [ ] Release `v0.7.0-m5` tagged
- [ ] `atlas_execution_state.md` memory updated

---

## 11. CV bullet (draft v0 — refined as part of Track A later)

> **Authenticated MCP server for an agentic research workspace.** Built a remote MCP server (Streamable HTTP, OAuth 2.1 + PKCE via Clerk's resource-server pattern, Dynamic Client Registration) exposing 3 read-only tools over a tenant-scoped corpus. DB-backed audit log of every call; per-user sliding-window rate limits; per-claim citation audit via tool surface. Published to the MCP registry. Stack: Next.js 16 / Clerk / `@clerk/mcp-tools` / `mcp-handler` / Prisma / Neon / Vercel.

---

## 12. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Clerk DCR toggle forgotten → Claude Desktop install breaks with confusing error | `RELEASING.md` checklist item; fresh-install smoke before tagging |
| MCP spec evolves between design and ship | Pin `@modelcontextprotocol/sdk` and `mcp-handler` versions; spec changes have been stable since June 2025 |
| Recruiter clicks "Connect" and bounces because Clerk sign-up has friction | Sign-up is one form on Clerk's hosted UI; if it shows friction in user testing, add a "no sign-up needed for demo data" sample-data button (out of M5 scope, into Track A) |
| Audit log table grows large | Indexes are narrow; size is bounded by per-user rate limits. Pruning policy deferred to v1.1 (year-old rows). Neon free tier is 0.5 GB. |
| Registry PR review is slow | Opening the PR counts as "shipped" for milestone purposes. Acceptance is independent. |
| `mcp-handler` or `@clerk/mcp-tools` has a bug we hit | Both are official, actively maintained, and used by other production MCP servers as of 2025-11; risk is low. If hit, file an issue and ship around. |

---

## 13. Resolved decisions (formerly open questions)

1. **Audience priority**: recruiter-demo first (over real-researcher first or "atlas consumes external MCPs"). The first-impression matters more than the long-tail feature set for the hiring goal. (Decision 2026-05-24.)
2. **Hosting**: in-app `/api/mcp` route on the existing Vercel deploy (over a separate npm package). Zero new infra; modern remote MCP makes stdio redundant. (Decision 2026-05-24.)
3. **Tool surface**: 3 read-only tools (over the original-spec 6, or 3+1). Optimizes for fast demo + zero LLM cost on the call path. (Decision 2026-05-24.)
4. **Auth model**: Clerk-as-Authorization-Server, Atlas-as-Resource-Server with DCR (over rolling our own OAuth server, or bearer-token fallback). `@clerk/mcp-tools` makes this nearly free. (Decision 2026-05-24.)
5. **Transport**: Streamable HTTP only (over stdio + SSE). Current MCP spec; SSE is deprecated. (Decision 2026-05-24.)
6. **Rate-limit backend**: DB-backed sliding window over `McpCall` indexes (over Redis/Upstash). No new infra dep; cheap with the existing index. (Decision 2026-05-24.)
7. **Authz response code**: 404 for unowned resources (over 403). Prevents existence-probing. (Decision 2026-05-24.)
8. **Audit input storage**: SHA-256 hash only (over raw input). GDPR-clean, sufficient for forensics. (Decision 2026-05-24.)

---

## 14. Hand-off to implementation planning

This spec is the WHAT and WHY. The HOW (file-by-file plan, dependency order, TDD steps) goes to the `superpowers:writing-plans` skill — output to `docs/superpowers/plans/2026-05-24-m5-mcp-server.md`.
