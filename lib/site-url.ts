/**
 * Public origin of this deployment, used for metadata, robots, the sitemap
 * and the MCP server icon. Set NEXT_PUBLIC_SITE_URL when you host Thoth;
 * Vercel preview deploys fall back to VERCEL_URL, and local dev to localhost.
 * (The hosted app at the original Vercel address was retired on 2026-11-01.)
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
).replace(/\/$/, "");
