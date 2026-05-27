import type { MetadataRoute } from "next";

/**
 * Robots policy for crawlers. Next.js Metadata Files: this file becomes
 * /robots.txt at build time.
 *
 * Allow the public pages (home, showcase, evals dashboard, MCP discovery
 * endpoints) and explicitly disallow everything that requires a Clerk
 * session — /dashboard, /projects/*, /admin/*, /demo/handoff, the
 * mutating /api routes — to keep them out of search indexes even on
 * theoretical accidental exposure.
 */
export default function robots(): MetadataRoute.Robots {
  const base = "https://thoth-slr.vercel.app";
  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/showcase",
          "/evals",
          "/sign-in",
          "/sign-up",
          // OAuth / MCP discovery endpoints — public by spec.
          "/.well-known/",
          "/api/mcp/",
        ],
        disallow: [
          "/dashboard",
          "/projects/",
          "/admin/",
          "/demo/handoff",
          "/api/",  // /api/mcp re-allowed above takes precedence
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
