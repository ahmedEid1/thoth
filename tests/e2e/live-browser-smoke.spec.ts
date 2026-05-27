import { test, expect } from "@playwright/test";

/**
 * Real-browser smoke against the deployed app. Loads the public surfaces
 * a first-time visitor would see — no Clerk sign-in needed, no LLM tokens
 * billed, no data written to prod. Complements the API-level mcp-smoke
 * (which exercises the MCP transport) with actual DOM + asset checks.
 *
 * Run against the live deploy:
 *   PLAYWRIGHT_BASE_URL=https://thoth-slr.vercel.app pnpm playwright test \
 *     tests/e2e/live-browser-smoke.spec.ts --project=chromium
 *
 * Or via the alias: `pnpm test:e2e:live` (now runs both this + mcp-smoke).
 *
 * What this NOT-tests (intentionally):
 *  - Authenticated flows (create project, start a run). Those need a real
 *    Clerk session and would write to prod + bill LLM tokens. They live in
 *    RELEASING.md's manual smoke checklist.
 *  - V2 outbound runs end-to-end. Same reason — they'd hit OpenAlex/arXiv
 *    + Mistral OCR + create DB rows. RELEASING.md covers them manually.
 */

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "https://thoth-slr.vercel.app";

test("home page renders the headline + key CTAs", async ({ page }) => {
  const response = await page.goto(BASE);
  expect(response?.status(), `home page returned ${response?.status()}`).toBeLessThan(400);

  // The landing page leads with the product name in Fraunces (font-display).
  await expect(page.getByRole("heading", { name: /thoth/i }).first()).toBeVisible();

  // Primary CTA — "Try the demo" or "Sign in" depending on deploy config.
  // Both are valid surfaces; assert at least one is present.
  const ctaCount = await page
    .getByRole("link", { name: /try the demo|sign in|get started|dashboard/i })
    .count();
  expect(ctaCount, "no primary CTA found on home page").toBeGreaterThan(0);
});

test("health endpoint reports ok + reachable DB", async ({ request }) => {
  const res = await request.get(`${BASE}/api/health`);
  expect(res.status()).toBe(200);
  const body = (await res.json()) as {
    ok: boolean;
    service: string;
    dbReachable: boolean;
    commitSha: string;
  };
  expect(body.ok).toBe(true);
  expect(body.service).toBe("thoth");
  expect(body.dbReachable).toBe(true);
  expect(body.commitSha, "no commit sha in /api/health — build is broken").toMatch(/^[a-f0-9]{7,40}$/);
});

test("public /evals dashboard loads + shows at least one metric tile", async ({ page }) => {
  const response = await page.goto(`${BASE}/evals`);
  expect(response?.status()).toBeLessThan(400);

  // The page is structured with one tile per metric. After V2-M10, the
  // METRICS array contains six entries (4 V1 + 2 V2). At least one of the
  // V1 metric labels must be visible; we don't assert v2 ones because
  // they're hidden until a v2 golden lands.
  await expect(
    page.getByText(/citation recall|claim faithfulness/i).first(),
  ).toBeVisible({ timeout: 15_000 });
});

test("public /showcase renders the seeded exemplar review", async ({ page }) => {
  const response = await page.goto(`${BASE}/showcase`);
  // /showcase 404s if the seed hasn't run on this DB — that's a known
  // deploy-gating limit (documented in RELEASING.md). Skip-or-fail
  // gracefully: a 200 means the showcase IS seeded and we assert the
  // expected content; a 404 means the deployer hasn't run pnpm seed:showcase.
  if (response?.status() === 404) {
    test.skip(true, "/showcase not seeded on this deploy (pnpm seed:showcase pending)");
    return;
  }
  expect(response?.status()).toBeLessThan(400);

  // The seeded review's cite_check output includes UNSUPPORTED claims.
  // That's the value-prop of /showcase — verify the page renders at all.
  // We don't pin specific copy because the seeded content might evolve.
  const bodyText = await page.locator("body").innerText();
  expect(bodyText.length, "/showcase rendered an empty body").toBeGreaterThan(100);
});

test("security.txt is served per RFC 9116", async ({ request }) => {
  const res = await request.get(`${BASE}/.well-known/security.txt`);
  expect(res.status()).toBe(200);
  const body = await res.text();
  expect(body).toMatch(/Contact:/i);
});
