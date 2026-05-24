import { defineConfig } from "@playwright/test";
import dotenv from "dotenv";

// Load .env for CLERK_SECRET_KEY / NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY used by clerkSetup
dotenv.config({ path: ".env" });
// Load .env.test for E2E_EMAIL / E2E_PASSWORD (overrides nothing from .env)
dotenv.config({ path: ".env.test" });

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3001";
// "Live" = anything that isn't the local dev server. When live, we don't spin
// up the Next.js dev server and we only run the mcp-smoke test (the other e2e
// tests need a real Clerk session against a local Atlas instance and aren't
// safe to run against production anyway).
const IS_LIVE = !BASE_URL.includes("localhost") && !BASE_URL.includes("127.0.0.1");

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: BASE_URL,
    headless: true,
    trace: "retain-on-failure",
  },
  projects: IS_LIVE
    ? [
        {
          name: "chromium",
          use: { browserName: "chromium" },
          // Live mode: only the MCP smoke runs. No Clerk-session setup —
          // mcp-smoke exercises the live OAuth flow itself.
          testMatch: /mcp-smoke\.spec\.ts/,
        },
      ]
    : [
        {
          name: "global setup",
          testMatch: /global\.setup\.ts/,
        },
        {
          name: "chromium",
          use: { browserName: "chromium" },
          dependencies: ["global setup"],
        },
      ],
  // Only spin up a local dev server when targeting localhost.
  webServer: IS_LIVE
    ? undefined
    : {
        command: "pnpm dev --port 3001",
        url: "http://localhost:3001",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
