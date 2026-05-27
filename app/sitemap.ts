import type { MetadataRoute } from "next";

/**
 * Sitemap for the public surface. Next.js Metadata Files: this file becomes
 * /sitemap.xml at build time.
 *
 * Only the no-auth pages live here. /dashboard, /projects/*, and /admin/*
 * require a Clerk session and are explicitly disallowed in robots.ts.
 *
 * `priority` is a hint to crawlers about which page is the most central:
 * home (1.0) > showcase (0.8) > evals (0.7) > sign-in/up (0.3). `changeFrequency`
 * is similarly advisory — `weekly` for evals because the cron sweep runs Mondays,
 * `monthly` for everything else (engineering is complete and the design
 * doesn't drift release-to-release).
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://thoth-slr.vercel.app";
  const lastModified = new Date();
  return [
    { url: `${base}/`, lastModified, changeFrequency: "monthly", priority: 1.0 },
    { url: `${base}/showcase`, lastModified, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/evals`, lastModified, changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/sign-in`, lastModified, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/sign-up`, lastModified, changeFrequency: "yearly", priority: 0.3 },
  ];
}
